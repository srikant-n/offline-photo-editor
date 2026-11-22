import { describe, it, expect } from 'vitest';
import {
  transformedSize, sourceToOutputMatrix, effectiveCrop,
  applyMat, invertMat, multiply, rotatedRectCorners, rectFromQuad,
  displayDraftToSourceCrop, sourceCropToDisplayDraft, mapRotRect, IDENTITY,
  documentOutputSize,
} from './geometry';
import type { Document, TransformState } from '../types';

const T = (over: Partial<TransformState> = {}): TransformState => ({
  rotate90: 0, flipH: false, flipV: false, ...over,
});
const base = { outW: 0, outH: 0, background: '#fff' };

describe('effectiveCrop', () => {
  it('returns full frame when no crop', () => {
    expect(effectiveCrop(100, 50)).toEqual({ x: 0, y: 0, w: 100, h: 50, angle: 0 });
  });
  it('clamps to bounds', () => {
    expect(effectiveCrop(100, 50, { x: 90, y: 40, w: 50, h: 50 }))
      .toEqual({ x: 90, y: 40, w: 10, h: 10, angle: 0 });
  });
});

describe('transformedSize', () => {
  it('identity size = source size', () => {
    expect(transformedSize(400, 300, { straighten: 0, transform: T(), ...base }))
      .toEqual({ w: 400, h: 300 });
  });
  it('rotate90 swaps dims', () => {
    expect(transformedSize(400, 300, { straighten: 0, transform: T({ rotate90: 90 }), ...base }))
      .toEqual({ w: 300, h: 400 });
  });
  it('crop shrinks output', () => {
    expect(transformedSize(400, 300, {
      crop: { x: 50, y: 50, w: 200, h: 100 }, straighten: 0, transform: T(), ...base,
    })).toEqual({ w: 200, h: 100 });
  });
  it('crop angle does not change output size (angle=0 straighten)', () => {
    expect(transformedSize(400, 300, {
      crop: { x: 50, y: 50, w: 200, h: 100, angle: 30 }, straighten: 0, transform: T(), ...base,
    })).toEqual({ w: 200, h: 100 });
  });
});

describe('sourceToOutputMatrix', () => {
  it('identity maps source px to centered output px', () => {
    const m = sourceToOutputMatrix(
      { x: 0, y: 0, w: 100, h: 50 }, 0, T(), 100, 50,
    );
    expect(applyMat(m, 0, 0)).toEqual([0, 0]);
    expect(applyMat(m, 100, 50)).toEqual([100, 50]);
    expect(applyMat(m, 50, 25)).toEqual([50, 25]);
  });

  it('centers content when output is larger', () => {
    const m = sourceToOutputMatrix(
      { x: 0, y: 0, w: 100, h: 50 }, 0, T(), 200, 100,
    );
    expect(applyMat(m, 0, 0)).toEqual([50, 25]);
    expect(applyMat(m, 100, 50)).toEqual([150, 75]);
  });

  it('crop translates content', () => {
    const m = sourceToOutputMatrix(
      { x: 10, y: 20, w: 50, h: 30 }, 0, T(), 50, 30,
    );
    expect(applyMat(m, 10, 20)).toEqual([0, 0]);
    expect(applyMat(m, 60, 50)).toEqual([50, 30]);
  });

  it('rotate90 maps corners correctly', () => {
    const m = sourceToOutputMatrix(
      { x: 0, y: 0, w: 100, h: 50 }, 0, T({ rotate90: 90 }), 50, 100,
    );
    const tl = applyMat(m, 0, 0);
    const br = applyMat(m, 100, 50);
    expect(tl[0]).toBeCloseTo(50);
    expect(tl[1]).toBeCloseTo(0);
    expect(br[0]).toBeCloseTo(0);
    expect(br[1]).toBeCloseTo(100);
  });

  it('flipH mirrors horizontally', () => {
    const m = sourceToOutputMatrix(
      { x: 0, y: 0, w: 100, h: 50 }, 0, T({ flipH: true }), 100, 50,
    );
    expect(applyMat(m, 0, 0)[0]).toBeCloseTo(100);
    expect(applyMat(m, 100, 0)[0]).toBeCloseTo(0);
  });

  it('crop angle derotates the rect: rotated corner maps to crop-local corner', () => {
    // crop 100x50 at (10,10), center (60,35), angle 30.
    // The rect's local top-right corner in source = c + Rot(30)*(50,-25).
    const crop = { x: 10, y: 10, w: 100, h: 50, angle: 30 };
    const m = sourceToOutputMatrix(crop, 0, T(), 100, 50);
    const rad = (30 * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    // source point = center + Rot(30)*(50,-25)  (local TR corner)
    const sx = 60 + 50 * cos - (-25) * sin;
    const sy = 35 + 50 * sin + (-25) * cos;
    const [ox, oy] = applyMat(m, sx, sy);
    // should land at crop-local (100, 0) → output (100, 0) since outW=100,outH=50, straighten 0
    expect(ox).toBeCloseTo(100, 1);
    expect(oy).toBeCloseTo(0, 1);
  });
});

describe('rotated rect helpers', () => {
  it('corners → rectFromQuad round-trips', () => {
    const r = { cx: 100, cy: 80, w: 120, h: 60, angle: 25 };
    const back = rectFromQuad(rotatedRectCorners(r));
    expect(back.cx).toBeCloseTo(100);
    expect(back.cy).toBeCloseTo(80);
    expect(back.w).toBeCloseTo(120);
    expect(back.h).toBeCloseTo(60);
    // angle may differ by 180 (same rect) — normalize
    let da = Math.abs(back.angle - 25) % 360;
    if (da > 180) da = 360 - da;
    expect(da).toBeCloseTo(0, 1);
  });
});

describe('crop display draft round-trip', () => {
  it('axis-aligned crop round-trips through display coords', () => {
    const src = { x: 50, y: 40, w: 200, h: 150 };
    const disp = sourceCropToDisplayDraft(400, 300, T(), 400, 300, src);
    expect(disp.cx).toBeCloseTo(150);
    expect(disp.cy).toBeCloseTo(115);
    expect(disp.w).toBeCloseTo(200);
    expect(disp.h).toBeCloseTo(150);
    expect(Math.abs(disp.angle)).toBeCloseTo(0, 1);
    const back = displayDraftToSourceCrop(400, 300, T(), 400, 300, disp);
    expect(back.x).toBeCloseTo(50, 0);
    expect(back.y).toBeCloseTo(40, 0);
    expect(back.w).toBeCloseTo(200, 0);
    expect(back.h).toBeCloseTo(150, 0);
  });

  it('angled crop round-trips', () => {
    const src = { x: 100, y: 100, w: 200, h: 100, angle: 20 };
    const disp = sourceCropToDisplayDraft(400, 300, T(), 400, 300, src);
    const back = displayDraftToSourceCrop(400, 300, T(), 400, 300, disp);
    const bcx = back.x + back.w / 2, bcy = back.y + back.h / 2;
    expect(bcx).toBeCloseTo(200, 0);
    expect(bcy).toBeCloseTo(150, 0);
    expect(back.w).toBeCloseTo(200, 0);
    expect(back.h).toBeCloseTo(100, 0);
    let da = Math.abs((back.angle ?? 0) - 20) % 360;
    if (da > 180) da = 360 - da;
    expect(da).toBeCloseTo(0, 1);
  });

  it('round-trips with rotate90 transform', () => {
    const src = { x: 50, y: 40, w: 200, h: 100 };
    const disp = sourceCropToDisplayDraft(400, 300, T({ rotate90: 90 }), 300, 400, src);
    const back = displayDraftToSourceCrop(400, 300, T({ rotate90: 90 }), 300, 400, disp);
    expect(back.w).toBeCloseTo(200, 0);
    expect(back.h).toBeCloseTo(100, 0);
  });
});

describe('invertMat', () => {
  it('invert undoes the matrix', () => {
    const m = multiply(
      { a: 0, b: 1, c: -1, d: 0, e: 50, f: 10 },
      { a: 1, b: 0, c: 0, d: 1, e: 5, f: 5 },
    );
    const inv = invertMat(m);
    const p = applyMat(m, 7, 9);
    const back = applyMat(inv, p[0], p[1]);
    expect(back[0]).toBeCloseTo(7);
    expect(back[1]).toBeCloseTo(9);
    expect(IDENTITY.a).toBe(1);
  });
});

describe('mapRotRect', () => {
  it('maps a rotated rect through rotation+translation', () => {
    const m = multiply(
      { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 }, // rot90 cw
      { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 },
    );
    const r = { cx: 50, cy: 50, w: 40, h: 20, angle: 0 };
    const out = mapRotRect(m, r);
    // p -> translate(10,20) -> rot90cw: (50,50) -> (60,70) -> (-70,60)
    expect(out.cx).toBeCloseTo(-70);
    expect(out.cy).toBeCloseTo(60);
    // edge lengths are preserved; the rect's local x-axis now points down
    expect(out.w).toBeCloseTo(40);
    expect(out.h).toBeCloseTo(20);
    let da = Math.abs(out.angle - 90) % 360;
    if (da > 180) da = 360 - da;
    expect(da).toBeCloseTo(0, 1);
  });
});

describe('documentOutputSize', () => {
  const doc = (over: Partial<Document> = {}): Document => ({
    source: { width: 400, height: 300 } as ImageBitmap,
    sourceName: 'x',
    canvas: { width: 123, height: 45, background: '#fff' },
    canvasAuto: true,
    straighten: 0,
    transform: T(),
    adjustments: {} as Document['adjustments'],
    ...over,
  });

  it('returns geometry-derived size when canvasAuto is true', () => {
    expect(documentOutputSize(doc())).toEqual({ w: 400, h: 300 });
    expect(documentOutputSize(doc({
      transform: T({ rotate90: 90 }),
    }))).toEqual({ w: 300, h: 400 });
    expect(documentOutputSize(doc({
      crop: { x: 50, y: 50, w: 200, h: 100 },
    }))).toEqual({ w: 200, h: 100 });
  });

  it('returns the explicit canvas size when canvasAuto is false', () => {
    expect(documentOutputSize(doc({ canvasAuto: false }))).toEqual({ w: 123, h: 45 });
  });
});
