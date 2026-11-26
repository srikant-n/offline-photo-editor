/** Brush stamp engine: soft-edged circular stamps along a stroke path. */

export interface BrushParams {
  /** Stamp diameter in output px. */
  size: number;
  /** 0..1 — fraction of radius that is fully opaque before the soft falloff. */
  hardness: number;
  /** 0..1 stamp opacity. */
  opacity: number;
  color: string;
  /** Eraser mode: stamps with destination-out. */
  eraser?: boolean;
}

/** Radial-gradient stamp canvas for the given params (cached by key). */
export function makeStamp(p: BrushParams): HTMLCanvasElement {
  const key = `${p.size}|${p.hardness}|${p.color}|${p.eraser ? 1 : 0}`;
  return stampFor(key, p);
}

const stampMap = new Map<string, HTMLCanvasElement>();
function stampFor(key: string, p: BrushParams): HTMLCanvasElement {
  const cached = stampMap.get(key);
  if (cached) return cached;
  const size = Math.max(1, Math.ceil(p.size));
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const r = size / 2;
  const hard = Math.max(0, Math.min(1, p.hardness));
  const inner = r * hard;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  const col = p.eraser ? 'rgba(0,0,0,1)' : hexToRgba(p.color, 1);
  // Fade to the same hue at alpha 0 — fading to transparent black leaves a
  // dark rim on each stamp where the RGB channels collapse before alpha.
  const edge = p.eraser ? 'rgba(0,0,0,0)' : hexToRgba(p.color, 0);
  if (inner >= r - 0.5) {
    g.addColorStop(0, col);
    g.addColorStop(1, col);
  } else {
    g.addColorStop(0, col);
    g.addColorStop(Math.max(0.001, inner / r), col);
    g.addColorStop(1, edge);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  if (stampMap.size > 64) stampMap.clear();
  stampMap.set(key, c);
  return c;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return `rgba(255,255,255,${alpha})`;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function stampSpacing(size: number): number {
  return Math.max(1, size / 4);
}

/**
 * Stamp along a polyline on ctx. Points are in the same coordinate space as
 * ctx's current transform target. `from`/`to` are consecutive points.
 */
export function stampSegment(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  p: BrushParams,
  stamp: HTMLCanvasElement,
): void {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const spacing = stampSpacing(p.size);
  const steps = Math.max(1, Math.ceil(dist / spacing));
  const half = p.size / 2;
  ctx.save();
  ctx.globalAlpha = p.opacity;
  if (p.eraser) ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t - half;
    const y = from.y + (to.y - from.y) * t - half;
    ctx.drawImage(stamp, x, y, p.size, p.size);
  }
  ctx.restore();
}

export interface StrokePoint { x: number; y: number }
