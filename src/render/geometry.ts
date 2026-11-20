import type { CropRect, GeoParams, TransformState } from '../types';

/**
 * 2D affine matrix [a b c d e f]:
 *   x' = a*x + c*y + e
 *   y' = b*x + d*y + f
 */
export interface Mat {
  a: number; b: number; c: number; d: number; e: number; f: number;
}

export const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** Returns M = M2 * M1 (apply M1 first, then M2). */
export function multiply(m2: Mat, m1: Mat): Mat {
  return {
    a: m2.a * m1.a + m2.c * m1.b,
    b: m2.b * m1.a + m2.d * m1.b,
    c: m2.a * m1.c + m2.c * m1.d,
    d: m2.b * m1.c + m2.d * m1.d,
    e: m2.a * m1.e + m2.c * m1.f + m2.e,
    f: m2.b * m1.e + m2.d * m1.f + m2.f,
  };
}

export function translate(tx: number, ty: number): Mat {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function rotate(deg: number): Mat {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

export function scale(sx: number, sy: number): Mat {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

export function applyMat(m: Mat, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

export interface EffectiveCrop {
  x: number; y: number; w: number; h: number;
  /** Crop-rect rotation about its center, degrees. */
  angle?: number;
}

/** Crop rect clamped to the source bounds. */
export function effectiveCrop(srcW: number, srcH: number, crop?: CropRect): EffectiveCrop {
  if (!crop) return { x: 0, y: 0, w: srcW, h: srcH, angle: 0 };
  const x = Math.max(0, Math.min(srcW - 1, crop.x));
  const y = Math.max(0, Math.min(srcH - 1, crop.y));
  const w = Math.max(1, Math.min(srcW - x, crop.w));
  const h = Math.max(1, Math.min(srcH - y, crop.h));
  return { x, y, w, h, angle: crop.angle ?? 0 };
}

export interface Bounds {
  w: number; h: number;
  /** Top-left offset of the rotated content inside its bounding box. */
  minX: number; minY: number;
}

/** Bounding box of the crop rect after straighten rotation (about its center). */
export function rotatedBounds(crop: EffectiveCrop, straightenDeg: number): Bounds {
  const cx = crop.w / 2, cy = crop.h / 2;
  const corners: [number, number][] = [
    [0, 0], [crop.w, 0], [crop.w, crop.h], [0, crop.h],
  ];
  const rad = (straightenDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [px, py] of corners) {
    // rotate about (cx, cy); y-down coords, positive angle = clockwise
    const dx = px - cx, dy = py - cy;
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    const x = rx + cx, y = ry + cy;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { w: maxX - minX, h: maxY - minY, minX, minY };
}

/** Dimensions of the final output image (before any custom canvas override). */
export function transformedSize(srcW: number, srcH: number, p: GeoParams): { w: number; h: number } {
  const crop = effectiveCrop(srcW, srcH, p.crop);
  const b = rotatedBounds(crop, p.straighten);
  const swap = ((p.transform.rotate90 / 90) % 2) === 1;
  return {
    w: Math.max(1, Math.round(swap ? b.h : b.w)),
    h: Math.max(1, Math.round(swap ? b.w : b.h)),
  };
}

/**
 * Full source-pixel → output-pixel affine for the geometry stage.
 * Output pixel (0,0) is top-left of the outW×outH canvas; content is centered.
 */
export function sourceToOutputMatrix(
  crop: EffectiveCrop,
  straightenDeg: number,
  transform: TransformState,
  outW: number,
  outH: number,
): Mat {
  const bounds = rotatedBounds(crop, straightenDeg);
  const bw = bounds.w, bh = bounds.h;
  const cx = bw / 2, cy = bh / 2;

  // `multiply(step, m)` left-multiplies, so steps apply in written order.
  let m = IDENTITY;
  // 1. crop frame: derotate the (possibly angled) crop rect about its center
  //    so the selected region becomes the axis-aligned [x,y,w,h] rect.
  const ang = crop.angle ?? 0;
  if (ang !== 0) {
    const ccx = crop.x + crop.w / 2, ccy = crop.y + crop.h / 2;
    m = multiply(translate(-ccx, -ccy), m);
    m = multiply(rotate(-ang), m);
    m = multiply(translate(ccx, ccy), m);
  }
  // 2. into crop-local coords
  m = multiply(translate(-crop.x, -crop.y), m);
  // 2. straighten: rotate about crop center (crop-local center)
  const k = crop.w / 2, k2 = crop.h / 2;
  m = multiply(translate(-k, -k2), m);
  m = multiply(rotate(straightenDeg), m);
  m = multiply(translate(k, k2), m);
  // 3. into rotated-bbox-local coords (subtract bbox min)
  m = multiply(translate(-bounds.minX, -bounds.minY), m);
  // 4. center bbox at origin
  m = multiply(translate(-cx, -cy), m);
  // 5. quarter-turns (clockwise in y-down space)
  m = multiply(rotate(transform.rotate90), m);
  // 6. flips about origin
  if (transform.flipH) m = multiply(scale(-1, 1), m);
  if (transform.flipV) m = multiply(scale(1, -1), m);
  // 7. move content center to output center
  m = multiply(translate(outW / 2, outH / 2), m);

  return m;
}

export function invertMat(m: Mat): Mat {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-9) return IDENTITY;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

/** A rotated rectangle: center + size + rotation about center (deg, y-down cw+). */
export interface RotRect {
  cx: number; cy: number; w: number; h: number; angle: number;
}

/** 4 corners of a RotRect in order [TL, TR, BR, BL]. */
export function rotatedRectCorners(r: RotRect): [number, number][] {
  const rad = (r.angle * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const pts: [number, number][] = [];
  for (const [lx, ly] of [[-r.w / 2, -r.h / 2], [r.w / 2, -r.h / 2], [r.w / 2, r.h / 2], [-r.w / 2, r.h / 2]] as const) {
    pts.push([r.cx + lx * cos - ly * sin, r.cy + lx * sin + ly * cos]);
  }
  return pts;
}

/**
 * Recover {cx,cy,w,h,angle} from 4 quad points ordered [TL,TR,BR,BL].
 * The parameterization is self-consistent: w runs along p0→p1.
 */
export function rectFromQuad(pts: [number, number][]): RotRect {
  const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
  const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
  const e0x = pts[1][0] - pts[0][0], e0y = pts[1][1] - pts[0][1];
  const e1x = pts[2][0] - pts[1][0], e1y = pts[2][1] - pts[1][1];
  const w = Math.hypot(e0x, e0y);
  const h = Math.hypot(e1x, e1y);
  const angle = (Math.atan2(e0y, e0x) * 180) / Math.PI;
  return { cx, cy, w, h, angle };
}

/** Map a RotRect through an affine matrix → RotRect (similarity transforms only). */
export function mapRotRect(m: Mat, r: RotRect): RotRect {
  return rectFromQuad(rotatedRectCorners(r).map(([x, y]) => applyMat(m, x, y)) as [number, number][]);
}

/**
 * Crop-mode draft (rotated rect in display px) → source-space CropRect.
 * `mFull` maps source px → display px for the un-cropped, un-straightened render.
 */
export function displayDraftToSourceCrop(
  srcW: number,
  srcH: number,
  transform: TransformState,
  dispW: number,
  dispH: number,
  draft: RotRect,
): CropRect {
  const m = sourceToOutputMatrix(
    { x: 0, y: 0, w: srcW, h: srcH },
    0, transform, dispW, dispH,
  );
  const inv = invertMat(m);
  const src = mapRotRect(inv, draft);
  const crop = effectiveCrop(srcW, srcH, {
    x: src.cx - src.w / 2, y: src.cy - src.h / 2, w: src.w, h: src.h, angle: src.angle,
  });
  return { x: crop.x, y: crop.y, w: crop.w, h: crop.h, angle: src.angle };
}

/** Source-space CropRect → crop-mode display draft (RotRect in display px). */
export function sourceCropToDisplayDraft(
  srcW: number,
  srcH: number,
  transform: TransformState,
  dispW: number,
  dispH: number,
  crop: CropRect,
): RotRect {
  const m = sourceToOutputMatrix(
    { x: 0, y: 0, w: srcW, h: srcH },
    0, transform, dispW, dispH,
  );
  const ec = effectiveCrop(srcW, srcH, crop);
  return mapRotRect(m, {
    cx: ec.x + ec.w / 2, cy: ec.y + ec.h / 2, w: ec.w, h: ec.h, angle: ec.angle ?? 0,
  });
}

const geometryCache = new WeakMap<ImageBitmap, { key: string; canvas: HTMLCanvasElement }>();

/**
 * Rasterize the geometry stage (crop + straighten + rotate/flip + background
 * fill) into a canvas of outW×outH. Result is cached per source+params.
 */
export function renderGeometry(
  source: ImageBitmap,
  srcW: number,
  srcH: number,
  p: GeoParams,
): HTMLCanvasElement {
  const crop = effectiveCrop(srcW, srcH, p.crop);
  const key = JSON.stringify([crop, p.straighten, p.transform, p.outW, p.outH, p.background]);
  const cached = geometryCache.get(source);
  if (cached && cached.key === key) return cached.canvas;

  const canvas = document.createElement('canvas');
  canvas.width = p.outW;
  canvas.height = p.outH;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = p.background;
  ctx.fillRect(0, 0, p.outW, p.outH);

  const m = sourceToOutputMatrix(crop, p.straighten, p.transform, p.outW, p.outH);
  ctx.save();
  ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
  // Draw the whole source; the affine maps crop-local → output.
  // We must draw with dst coords equal to src coords so the transform applies
  // to source pixels directly.
  ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, srcW, srcH);
  ctx.restore();

  geometryCache.set(source, { key, canvas });
  return canvas;
}

/** Output pixel dims for a document (auto = fit geometry; else custom canvas). */
export function documentOutputSize(doc: import('../types').Document): { w: number; h: number } {
  if (!doc.canvasAuto) return { w: doc.canvas.width, h: doc.canvas.height };
  return transformedSize(doc.source.width, doc.source.height, {
    crop: doc.crop, straighten: doc.straighten, transform: doc.transform,
    outW: 0, outH: 0, background: doc.canvas.background,
  });
}
