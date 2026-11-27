import type { ShapeProps } from '../../types';

/** A rasterized shape: its canvas plus the placement rect in output px. */
export interface RasterizedShape {
  canvas: HTMLCanvasElement;
  /** Placement rect in output px. */
  x: number; y: number; w: number; h: number;
}

/**
 * Rasterize a shape drag to a canvas covering its bounds (padded for stroke
 * width and arrowheads). (x0,y0)→(x1,y1) is the drag vector in output px;
 * the arrowhead points toward (x1,y1).
 */
export function rasterizeShape(
  shape: ShapeProps,
  x0: number, y0: number, x1: number, y1: number,
): RasterizedShape {
  const bx = Math.min(x0, x1), by = Math.min(y0, y1);
  const bw = Math.abs(x1 - x0), bh = Math.abs(y1 - y0);
  const pad = shape.strokeWidth / 2 + 2;
  const extra = shape.kind === 'arrow' ? shape.strokeWidth * 4 : 0;
  const x = Math.max(0, Math.floor(bx - pad - extra));
  const y = Math.max(0, Math.floor(by - pad - extra));
  const w = Math.max(1, Math.ceil(bx + bw + pad + extra) - x);
  const h = Math.max(1, Math.ceil(by + bh + pad + extra) - y);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.lineWidth = shape.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = shape.color;
  if (shape.fill) ctx.fillStyle = shape.fill;

  // Drag endpoints in canvas coords (keeps arrow direction).
  const ax = x0 - x, ay = y0 - y, bx2 = x1 - x, by2 = y1 - y;
  // Axis-aligned bounds in canvas coords for rect/ellipse.
  const rx = Math.min(ax, bx2), ry = Math.min(ay, by2);
  const rw = Math.abs(bx2 - ax), rh = Math.abs(by2 - ay);

  switch (shape.kind) {
    case 'rect': {
      const inset = shape.strokeWidth / 2;
      ctx.beginPath();
      ctx.rect(rx + inset, ry + inset, Math.max(0, rw - shape.strokeWidth), Math.max(0, rh - shape.strokeWidth));
      if (shape.fill) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'ellipse': {
      ctx.beginPath();
      ctx.ellipse(rx + rw / 2, ry + rh / 2, Math.max(0.1, rw / 2 - shape.strokeWidth / 2), Math.max(0.1, rh / 2 - shape.strokeWidth / 2), 0, 0, Math.PI * 2);
      if (shape.fill) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'line':
    case 'arrow': {
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx2, by2);
      ctx.stroke();
      if (shape.kind === 'arrow') {
        const headLen = Math.max(10, shape.strokeWidth * 4);
        const ang = Math.atan2(by2 - ay, bx2 - ax);
        ctx.beginPath();
        ctx.moveTo(bx2, by2);
        ctx.lineTo(bx2 - headLen * Math.cos(ang - Math.PI / 6), by2 - headLen * Math.sin(ang - Math.PI / 6));
        ctx.moveTo(bx2, by2);
        ctx.lineTo(bx2 - headLen * Math.cos(ang + Math.PI / 6), by2 - headLen * Math.sin(ang + Math.PI / 6));
        ctx.stroke();
      }
      break;
    }
  }

  return { canvas, x, y, w, h };
}
