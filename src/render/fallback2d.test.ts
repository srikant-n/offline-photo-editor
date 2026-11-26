import { describe, it, expect, vi, beforeAll } from 'vitest';
import { create2dRenderer } from './fallback2d';
import { defaultAdjustments } from '../state/adjustments';
import type { Document } from '../types';

// Minimal 2D-context stand-in: records calls and property writes so tests can
// assert which passes the renderer ran.
class FakeCtx {
  calls: string[] = [];
  filterSets: string[] = [];
  private _filter = 'none';
  get filter() { return this._filter; }
  set filter(v: string) { this._filter = v; this.filterSets.push(v); }
  globalCompositeOperation = 'source-over';
  globalAlpha = 1;
  fillStyle = '';
  drawImage() { this.calls.push('drawImage'); }
  getImageData(_sx: number, _sy: number, w: number, h: number) {
    this.calls.push('getImageData');
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }
  putImageData() { this.calls.push('putImageData'); }
  fillRect() { this.calls.push('fillRect'); }
  clearRect() { this.calls.push('clearRect'); }
  save() { this.calls.push('save'); }
  restore() { this.calls.push('restore'); }
  transform() { this.calls.push('transform'); }
}

class FakeCanvas {
  width = 0;
  height = 0;
  ctx = new FakeCtx();
  getContext(kind: string) {
    return kind === '2d' ? this.ctx : null;
  }
}

let createdCanvases: FakeCanvas[] = [];

beforeAll(() => {
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected element: ${tag}`);
      const c = new FakeCanvas();
      createdCanvases.push(c);
      return c;
    },
  });
});

function fakeBitmap(w: number, h: number): ImageBitmap {
  return { width: w, height: h } as ImageBitmap;
}

function makeDoc(over: Partial<Document> = {}): Document {
  return {
    source: fakeBitmap(100, 50),
    sourceName: 'x.png',
    canvas: { width: 100, height: 50, background: '#ffffff' },
    canvasAuto: true,
    straighten: 0,
    transform: { rotate90: 0, flipH: false, flipV: false },
    adjustments: defaultAdjustments(),
    layers: [],
    ...over,
  };
}

function setup(doc = makeDoc()) {
  createdCanvases = [];
  const canvas = new FakeCanvas();
  const renderer = create2dRenderer(canvas as unknown as HTMLCanvasElement);
  return { canvas, ctx: canvas.ctx, renderer, doc };
}

describe('create2dRenderer sizing', () => {
  it('sizes the canvas to the auto geometry output', () => {
    const { canvas, renderer, doc } = setup();
    renderer.render(doc);
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(50);
  });

  it('uses the explicit canvas size when canvasAuto is false', () => {
    const doc = makeDoc({ canvasAuto: false, canvas: { width: 640, height: 480, background: '#000' } });
    const { canvas, renderer } = setup(doc);
    renderer.render(doc);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
  });

  it('rotate90 swaps the auto output dimensions', () => {
    const doc = makeDoc({
      transform: { rotate90: 90, flipH: false, flipV: false },
    });
    const { canvas, renderer } = setup(doc);
    renderer.render(doc);
    expect(canvas.width).toBe(50);
    expect(canvas.height).toBe(100);
  });

  it('maxDim downscales the output proportionally', () => {
    const { canvas, renderer, doc } = setup();
    renderer.render(doc, { maxDim: 50 });
    expect(canvas.width).toBe(50);
    expect(canvas.height).toBe(25);
  });

  it('never produces a zero-sized canvas', () => {
    const doc = makeDoc({
      canvasAuto: false,
      canvas: { width: 1, height: 1, background: '#fff' },
    });
    const { canvas, renderer } = setup(doc);
    renderer.render(doc, { maxDim: 0.001 });
    expect(canvas.width).toBeGreaterThanOrEqual(1);
    expect(canvas.height).toBeGreaterThanOrEqual(1);
  });
});

describe('create2dRenderer passes', () => {
  it('draws the geometry once for the "before" view', () => {
    const { ctx, renderer, doc } = setup();
    renderer.render(doc, { before: true });
    expect(ctx.calls.filter((c) => c === 'drawImage')).toHaveLength(1);
    expect(ctx.filter).toBe('none');
  });

  it('applies a filter pass for tone adjustments', () => {
    const doc = makeDoc();
    doc.adjustments.brightness = 50;
    doc.adjustments.contrast = -20;
    const { ctx, renderer } = setup(doc);
    renderer.render(doc);
    const draws = ctx.calls.filter((c) => c === 'drawImage');
    expect(draws.length).toBeGreaterThanOrEqual(2);
    // The tone pass sets a css filter then resets it to 'none'.
    const f = ctx.filterSets.find((v) => v !== 'none');
    expect(f).toBeDefined();
    expect(f).toContain('brightness(');
    expect(f).toContain('contrast(');
    expect(f).toContain('saturate(');
    expect(ctx.filterSets.at(-1)).toBe('none');
  });

  it('paints a warm overlay for positive temperature', () => {
    const doc = makeDoc();
    doc.adjustments.temperature = 80;
    const { ctx, renderer } = setup(doc);
    renderer.render(doc);
    expect(ctx.fillStyle).toContain('rgba(255,140,40');
    expect(ctx.globalCompositeOperation).toBe('source-over'); // restored
  });

  it('paints a cool overlay for negative temperature', () => {
    const doc = makeDoc();
    doc.adjustments.temperature = -80;
    const { ctx, renderer } = setup(doc);
    renderer.render(doc);
    expect(ctx.fillStyle).toContain('rgba(60,120,255');
  });

  it('skips the overlay for negligible temperature', () => {
    const doc = makeDoc();
    doc.adjustments.temperature = 0.5;
    const { ctx, renderer } = setup(doc);
    renderer.render(doc);
    expect(ctx.fillStyle).not.toContain('rgba(255,140,40');
    expect(ctx.fillStyle).not.toContain('rgba(60,120,255');
  });

  it('runs the sharpness path when sharpness > 1', () => {
    const doc = makeDoc();
    doc.adjustments.sharpness = 50;
    const { ctx, renderer } = setup(doc);
    renderer.render(doc);
    // Geometry + tone-filter draws; sharpness uses a scratch canvas and putImageData.
    expect(ctx.calls.filter((c) => c === 'drawImage')).toHaveLength(2);
    expect(ctx.calls).toContain('getImageData');
    expect(ctx.calls).toContain('putImageData');
    expect(createdCanvases.length).toBeGreaterThanOrEqual(2);
  });

  it('skips sharpness for the before view even when sharpness is set', () => {
    const doc = makeDoc();
    doc.adjustments.sharpness = 80;
    const { ctx, renderer } = setup(doc);
    renderer.render(doc, { before: true });
    expect(ctx.calls.filter((c) => c === 'drawImage')).toHaveLength(1);
    expect(createdCanvases.length).toBe(1); // geometry only, no scratch canvas
  });
});
