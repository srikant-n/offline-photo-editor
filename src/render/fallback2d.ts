import type { Document, GeoParams } from '../types';
import { renderGeometry, transformedSize } from './geometry';
import type { RenderOptions, Renderer } from './gl/engine';

/**
 * Canvas2D fallback renderer used when WebGL2 is unavailable.
 * Approximates the tone chain with ctx.filter + simple pixel ops.
 */
export function create2dRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext('2d')!;

  /** Builds GeoParams for a document at the given output size (0 → natural size). */
  function geo(doc: Document, w: number, h: number): GeoParams {
    const size = doc.canvasAuto
      ? transformedSize(doc.source.width, doc.source.height, {
          crop: doc.crop, straighten: doc.straighten, transform: doc.transform,
          outW: 0, outH: 0, background: doc.canvas.background,
        })
      : { w: doc.canvas.width, h: doc.canvas.height };
    return {
      crop: doc.crop, straighten: doc.straighten, transform: doc.transform,
      outW: w || size.w, outH: h || size.h, background: doc.canvas.background,
    };
  }

  /** Renders the document into the renderer's canvas, respecting maxDim downscaling. */
  function render(doc: Document, opts: RenderOptions = {}) {
    const before = !!opts.before;
    const a = doc.adjustments;
    const maxDim = opts.maxDim ?? Infinity;

    const size = doc.canvasAuto
      ? transformedSize(doc.source.width, doc.source.height, geo(doc, 0, 0))
      : { w: doc.canvas.width, h: doc.canvas.height };
    const scale = Math.min(1, maxDim / Math.max(size.w, size.h));
    const w = Math.max(1, Math.round(size.w * scale));
    const h = Math.max(1, Math.round(size.h * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const g = renderGeometry(doc.source, doc.source.width, doc.source.height, geo(doc, w, h));
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(g, 0, 0);

    if (!before) {
      // ctx.filter approximations for the mappable params.
      const bright = 1 + (a.brightness / 100) * 0.5 + a.exposure * 0.18;
      const contrast = 1 + (a.contrast / 100) * 0.9;
      const sat = Math.max(0, 1 + a.saturation / 100 + a.vibrance / 200);
      ctx.filter = `brightness(${bright}) contrast(${contrast}) saturate(${sat})`;
      ctx.drawImage(g, 0, 0);
      ctx.filter = 'none';

      // Temperature via a translucent warm/cool overlay.
      if (Math.abs(a.temperature) > 1) {
        const warm = a.temperature > 0;
        const alpha = Math.min(0.35, Math.abs(a.temperature) / 100 * 0.35);
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = warm ? `rgba(255,140,40,${alpha})` : `rgba(60,120,255,${alpha})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }
      // Sharpness: cheap 3x3 unsharp via offscreen when requested.
      if (a.sharpness > 1) applySharpness2d(ctx, canvas, Math.min(1.5, a.sharpness / 100) * 0.9);
    }
    ctx.restore();
  }

  return { canvas, render, dispose() {} };
}

/** Applies a cheap unsharp mask by differencing the image against a blurred copy. */
function applySharpness2d(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, amount: number) {
  const w = canvas.width, h = canvas.height;
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext('2d')!;
  tctx.filter = 'blur(1px)';
  tctx.drawImage(canvas, 0, 0);
  tctx.filter = 'none';

  const src = ctx.getImageData(0, 0, w, h);
  const blur = tctx.getImageData(0, 0, w, h);
  const data = src.data, blurred = blur.data;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = data[i + c] + (data[i + c] - blurred[i + c]) * amount;
      data[i + c] = Math.max(0, Math.min(255, v));
    }
  }
  ctx.putImageData(src, 0, 0);
}
