// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { blendModeToComposite, compositeLayers, layerContains } from './composite';
import { defaultAdjustments } from '../state/adjustments';
import type { BlendMode, Document, Layer } from '../types';

function solid(w: number, h: number, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return c;
}

function layer(id: string, canvas: HTMLCanvasElement, over: Partial<Layer> = {}): Layer {
  return {
    id, type: 'raster', name: id, visible: true, opacity: 1,
    blendMode: 'normal', x: 0, y: 0, w: canvas.width, h: canvas.height,
    canvas, ...over,
  };
}

function makeDoc(layers: Layer[]): Document {
  return {
    source: { width: 4, height: 4 } as ImageBitmap,
    sourceName: 'x.png',
    canvas: { width: 4, height: 4, background: '#ffffff' },
    canvasAuto: true,
    straighten: 0,
    transform: { rotate90: 0, flipH: false, flipV: false },
    adjustments: defaultAdjustments(),
    layers: [
      { id: 'image', type: 'image', name: 'Image', visible: true, opacity: 1, blendMode: 'normal', x: 0, y: 0, w: 0, h: 0 },
      ...layers,
    ],
  };
}

function pixel(out: HTMLCanvasElement, x = 0, y = 0): number[] {
  const ctx = out.getContext('2d')!;
  return Array.from(ctx.getImageData(x, y, 1, 1).data);
}

describe('blendModeToComposite', () => {
  it('maps blend modes to canvas composite ops', () => {
    expect(blendModeToComposite('normal')).toBe('source-over');
    expect(blendModeToComposite('multiply')).toBe('multiply');
    expect(blendModeToComposite('screen')).toBe('screen');
    expect(blendModeToComposite('overlay')).toBe('overlay');
    expect(blendModeToComposite('color-dodge')).toBe('color-dodge');
    expect(blendModeToComposite('color-burn')).toBe('color-burn');
    expect(blendModeToComposite('hard-light')).toBe('hard-light');
    expect(blendModeToComposite('soft-light')).toBe('soft-light');
    expect(blendModeToComposite('difference')).toBe('difference');
    expect(blendModeToComposite('exclusion')).toBe('exclusion');
    expect(blendModeToComposite('hue')).toBe('hue');
    expect(blendModeToComposite('saturation')).toBe('saturation');
    expect(blendModeToComposite('color')).toBe('color');
    expect(blendModeToComposite('luminosity')).toBe('luminosity');
  });

  it('falls back to source-over for unknown modes', () => {
    expect(blendModeToComposite('bogus' as BlendMode)).toBe('source-over');
  });
});

describe('layerContains', () => {
  const l = layer('a', solid(4, 4, '#fff'), { x: 10, y: 20, w: 30, h: 40 });

  it('is inclusive on all edges', () => {
    expect(layerContains(l, 10, 20)).toBe(true);
    expect(layerContains(l, 40, 60)).toBe(true);
    expect(layerContains(l, 25, 40)).toBe(true);
  });

  it('rejects points outside the rect', () => {
    expect(layerContains(l, 9.9, 30)).toBe(false);
    expect(layerContains(l, 30, 19)).toBe(false);
    expect(layerContains(l, 40.1, 30)).toBe(false);
    expect(layerContains(l, 30, 60.1)).toBe(false);
  });
});

describe('compositeLayers', () => {
  it('draws base then layers topmost-last', () => {
    const base = solid(4, 4, '#000000');
    const red = solid(4, 4, '#ff0000');
    const blue = solid(4, 4, '#0000ff');
    const out = document.createElement('canvas');
    out.width = 4; out.height = 4;
    const ctx = out.getContext('2d')!;
    compositeLayers(base, makeDoc([layer('a', red), layer('b', blue)]), ctx);
    // top layer (blue, later in array) wins
    expect(pixel(out)).toEqual([0, 0, 255, 255]);
  });

  it('before:true skips all layers', () => {
    const base = solid(4, 4, '#102030');
    const red = solid(4, 4, '#ff0000');
    const out = document.createElement('canvas');
    out.width = 4; out.height = 4;
    const ctx = out.getContext('2d')!;
    compositeLayers(base, makeDoc([layer('a', red)]), ctx, { before: true });
    expect(pixel(out)).toEqual([16, 32, 48, 255]);
  });

  it('invisible layers are skipped', () => {
    const base = solid(4, 4, '#000000');
    const red = solid(4, 4, '#ff0000');
    const out = document.createElement('canvas');
    out.width = 4; out.height = 4;
    const ctx = out.getContext('2d')!;
    compositeLayers(base, makeDoc([layer('a', red, { visible: false })]), ctx);
    expect(pixel(out)).toEqual([0, 0, 0, 255]);
  });

  it('opacity blends the layer over the base', () => {
    const base = solid(4, 4, '#000000');
    const red = solid(4, 4, '#ff0000');
    const out = document.createElement('canvas');
    out.width = 4; out.height = 4;
    const ctx = out.getContext('2d')!;
    compositeLayers(base, makeDoc([layer('a', red, { opacity: 0.5 })]), ctx);
    const [r, g, b] = pixel(out);
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(160);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('multiply blend mode darkens', () => {
    const base = solid(4, 4, '#ffffff');
    const red = solid(4, 4, '#ff0000');
    const out = document.createElement('canvas');
    out.width = 4; out.height = 4;
    const ctx = out.getContext('2d')!;
    compositeLayers(base, makeDoc([layer('a', red, { blendMode: 'multiply' })]), ctx);
    expect(pixel(out)).toEqual([255, 0, 0, 255]);
  });

  it('scale maps layer placement into output pixels', () => {
    const base = solid(8, 8, '#000000');
    // 2x2 red square at output (4,4)-(6,6); scale 0.5 → canvas px (2,2)-(3,3)
    const red = solid(2, 2, '#ff0000');
    const out = document.createElement('canvas');
    out.width = 4; out.height = 4;
    const ctx = out.getContext('2d')!;
    compositeLayers(
      base,
      makeDoc([layer('a', red, { x: 4, y: 4, w: 4, h: 4 })]),
      ctx,
      { scale: 0.5 },
    );
    expect(pixel(out, 2, 2)).toEqual([255, 0, 0, 255]);
    expect(pixel(out, 0, 0)).toEqual([0, 0, 0, 255]);
  });

  it('hideLayers skips non-image layers', () => {
    const base = solid(4, 4, '#000000');
    const red = solid(4, 4, '#ff0000');
    const out = document.createElement('canvas');
    out.width = 4; out.height = 4;
    const ctx = out.getContext('2d')!;
    compositeLayers(base, makeDoc([layer('a', red)]), ctx, { hideLayers: true });
    expect(pixel(out)).toEqual([0, 0, 0, 255]);
  });

  it('liveStroke substitutes the in-progress canvas for its layer', () => {
    const base = solid(4, 4, '#000000');
    const stored = solid(4, 4, '#ff0000');
    const live = solid(4, 4, '#00ff00');
    const out = document.createElement('canvas');
    out.width = 4; out.height = 4;
    const ctx = out.getContext('2d')!;
    const l = layer('a', stored);
    compositeLayers(base, makeDoc([l]), ctx, { liveStroke: { layerId: 'a', canvas: live } });
    expect(pixel(out)).toEqual([0, 255, 0, 255]);
  });

  it('liveStroke for a different layer id leaves the stored canvas', () => {
    const base = solid(4, 4, '#000000');
    const stored = solid(4, 4, '#ff0000');
    const live = solid(4, 4, '#00ff00');
    const out = document.createElement('canvas');
    out.width = 4; out.height = 4;
    const ctx = out.getContext('2d')!;
    compositeLayers(base, makeDoc([layer('a', stored)]), ctx, { liveStroke: { layerId: 'other', canvas: live } });
    expect(pixel(out)).toEqual([255, 0, 0, 255]);
  });

  it('layers without a canvas are skipped', () => {
    const base = solid(4, 4, '#000000');
    const l = { ...layer('a', solid(4, 4, '#ff0000')), canvas: undefined };
    const out = document.createElement('canvas');
    out.width = 4; out.height = 4;
    const ctx = out.getContext('2d')!;
    compositeLayers(base, makeDoc([l]), ctx);
    expect(pixel(out)).toEqual([0, 0, 0, 255]);
  });

  it('restores globalAlpha and composite op after compositing', () => {
    const base = solid(4, 4, '#000000');
    const red = solid(4, 4, '#ff0000');
    const out = document.createElement('canvas');
    out.width = 4; out.height = 4;
    const ctx = out.getContext('2d')!;
    compositeLayers(base, makeDoc([layer('a', red, { opacity: 0.5, blendMode: 'multiply' })]), ctx);
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.globalCompositeOperation).toBe('source-over');
  });
});
