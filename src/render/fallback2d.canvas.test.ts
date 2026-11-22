// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { create2dRenderer } from './fallback2d';
import { defaultAdjustments } from '../state/adjustments';
import type { Document } from '../types';

function makeSource(
  w: number,
  h: number,
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  paint(ctx, w, h);
  return c;
}

function edgeSource(w = 16, h = 16): HTMLCanvasElement {
  return makeSource(w, h, (ctx, width, height) => {
    ctx.fillStyle = '#505050';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#b0b0b0';
    ctx.fillRect(width / 2, 0, width / 2, height);
  });
}

function makeDoc(source: HTMLCanvasElement, over: Partial<Document> = {}): Document {
  return {
    source: source as unknown as ImageBitmap,
    sourceName: 'edge.png',
    canvas: { width: source.width, height: source.height, background: '#ffffff' },
    canvasAuto: true,
    straighten: 0,
    transform: { rotate90: 0, flipH: false, flipV: false },
    adjustments: defaultAdjustments(),
    ...over,
  };
}

function pixels(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function px(img: ImageData, x: number, y: number): [number, number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

describe('create2dRenderer pixels', () => {
  it('renders source pixels unchanged for the before view', () => {
    const src = edgeSource(8, 8);
    const doc = makeDoc(src);
    const canvas = document.createElement('canvas');
    const renderer = create2dRenderer(canvas);
    renderer.render(doc, { before: true });

    const img = pixels(canvas);
    expect(canvas.width).toBe(8);
    expect(canvas.height).toBe(8);
    expect(px(img, 0, 0)).toEqual([80, 80, 80, 255]);
    expect(px(img, 7, 0)).toEqual([176, 176, 176, 255]);
  });

  it('sharpness enhances the edge instead of blurring uniformly', () => {
    const src = edgeSource();
    const plain = makeDoc(src);
    const sharpDoc = makeDoc(src, {
      adjustments: { ...defaultAdjustments(), sharpness: 100 },
    });
    const canvas = document.createElement('canvas');
    const renderer = create2dRenderer(canvas);

    renderer.render(plain);
    const before = pixels(canvas).data.slice();
    renderer.render(sharpDoc);
    const after = pixels(canvas).data;

    const w = canvas.width, h = canvas.height;
    const colDiff = (x: number) => {
      let sum = 0;
      for (let y = 0; y < h; y++) {
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) sum += Math.abs(after[i + c] - before[i + c]);
      }
      return sum;
    };

    const edge = Math.max(...[6, 7, 8, 9, 10].map(colDiff));
    const far = Math.max(colDiff(0), colDiff(1), colDiff(14), colDiff(15));
    expect(edge).toBeGreaterThan(0);
    expect(far).toBeLessThan(edge / 4);
  });

  it('fills custom canvas background around a smaller centered image', () => {
    const src = edgeSource(8, 8);
    const doc = makeDoc(src, {
      canvasAuto: false,
      canvas: { width: 16, height: 8, background: '#ff0000' },
    });
    const canvas = document.createElement('canvas');
    const renderer = create2dRenderer(canvas);
    renderer.render(doc);

    const img = pixels(canvas);
    expect(px(img, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(img, 5, 0)).toEqual([80, 80, 80, 255]);
    expect(px(img, 11, 0)).toEqual([176, 176, 176, 255]);
    expect(px(img, 12, 0)).toEqual([255, 0, 0, 255]);
    expect(px(img, 15, 7)).toEqual([255, 0, 0, 255]);
  });
});
