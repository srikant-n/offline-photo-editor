// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useEditor, imageLayer, defaultTextProps,
  DEFAULT_BRUSH, DEFAULT_SHAPE,
} from './documentStore';
import type { Document } from '../types';

const s = () => useEditor.getState();

function fakeBitmap(w: number, h: number): ImageBitmap {
  return { width: w, height: h } as ImageBitmap;
}

function load(w = 100, h = 50, name = 'test.png') {
  s().loadImage({ bitmap: fakeBitmap(w, h), width: w, height: h, name });
}

function doc(): Document {
  const d = s().doc;
  if (!d) throw new Error('no document loaded');
  return d;
}

beforeEach(() => {
  useEditor.setState({
    doc: null, past: [], future: [], gestureBase: null,
    tool: 'select', cropDraft: null, cropAspect: null,
    comparing: false, loadError: null,
    selectedLayerId: null, activeStroke: null,
    currentColor: '#ffd166',
    brush: { ...DEFAULT_BRUSH }, shape: { ...DEFAULT_SHAPE },
    view: { scale: 1, tx: 0, ty: 0, baseW: 0, baseH: 0 },
    container: { w: 0, h: 0 },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadImage / clearDocument', () => {
  it('creates a fresh auto-canvas document', () => {
    load(200, 100, 'photo.jpg');
    const d = doc();
    expect(d.sourceName).toBe('photo.jpg');
    expect(d.canvasAuto).toBe(true);
    expect(d.canvas).toEqual({ width: 200, height: 100, background: '#ffffff' });
    expect(d.straighten).toBe(0);
    expect(d.transform).toEqual({ rotate90: 0, flipH: false, flipV: false });
    expect(s().past).toEqual([]);
    expect(s().tool).toBe('select');
  });

  it('defaults sourceName to "image" when name is empty', () => {
    s().loadImage({ bitmap: fakeBitmap(10, 10), width: 10, height: 10, name: '' });
    expect(doc().sourceName).toBe('image');
  });

  it('clearDocument removes the doc and history', () => {
    load();
    s().setAdjustment('brightness', 10);
    s().clearDocument();
    expect(s().doc).toBeNull();
    expect(s().past).toEqual([]);
    expect(s().canUndo()).toBe(false);
  });
});

describe('loadFile', () => {
  it('sets loadError when decoding fails', async () => {
    // No createImageBitmap in node; the BMP sniff also fails for this blob.
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
    await s().loadFile(blob, 'bad.png');
    expect(s().doc).toBeNull();
    expect(s().loadError).toBeTruthy();
  });
});

describe('history: commit / undo / redo', () => {
  it('updateDoc push commits before mutating', () => {
    load();
    s().setAdjustment('brightness', 10);
    expect(s().canUndo()).toBe(true);
    expect(doc().adjustments.brightness).toBe(10);
    expect(s().canRedo()).toBe(false);
  });

  it('undo restores previous doc and redo reapplies', () => {
    load();
    s().setAdjustment('brightness', 10);
    s().setAdjustment('contrast', -20);
    s().undo();
    expect(doc().adjustments.brightness).toBe(10);
    expect(doc().adjustments.contrast).toBe(0);
    expect(s().canRedo()).toBe(true);
    s().redo();
    expect(doc().adjustments.contrast).toBe(-20);
    expect(s().canUndo()).toBe(true);
    expect(s().canRedo()).toBe(false);
  });

  it('undo/redo are no-ops at the ends', () => {
    load();
    s().undo();
    s().redo();
    expect(s().doc).not.toBeNull();
    expect(s().past).toEqual([]);
    expect(s().future).toEqual([]);
  });

  it('a new mutation clears the redo stack', () => {
    load();
    s().setAdjustment('brightness', 10);
    s().undo();
    s().setAdjustment('contrast', 5);
    expect(s().canRedo()).toBe(false);
  });

  it("updateDoc 'none' does not record history", () => {
    load();
    s().updateDoc((d) => ({ ...d, straighten: 5 }), 'none');
    expect(doc().straighten).toBe(5);
    expect(s().canUndo()).toBe(false);
  });

  it('commit pushes the current doc snapshot', () => {
    load();
    s().updateDoc((d) => ({ ...d, straighten: 3 }), 'none');
    s().commit();
    s().updateDoc((d) => ({ ...d, straighten: 7 }), 'none');
    s().undo();
    expect(doc().straighten).toBe(3);
  });

  it('history is capped at 50 entries', () => {
    load();
    for (let i = 1; i <= 60; i++) s().setAdjustment('brightness', i);
    expect(s().past.length).toBe(50);
    s().undo();
    expect(s().past.length).toBe(49);
  });
});

describe('gestures', () => {
  it('beginGesture/endGesture coalesces transient changes into one undo step', () => {
    load();
    s().beginGesture();
    s().updateDoc((d) => ({ ...d, straighten: 5 }), 'transient');
    s().updateDoc((d) => ({ ...d, straighten: 10 }), 'transient');
    s().endGesture();
    expect(doc().straighten).toBe(10);
    expect(s().past.length).toBe(1);
    s().undo();
    expect(doc().straighten).toBe(0);
  });

  it('transient update without a gesture auto-starts one', () => {
    load();
    s().setStraighten(10, true);
    expect(s().gestureBase).not.toBeNull();
    s().endGesture();
    expect(s().past.length).toBe(1);
  });

  it('endGesture without changes pushes nothing', () => {
    load();
    s().beginGesture();
    s().endGesture();
    expect(s().past).toEqual([]);
    expect(s().gestureBase).toBeNull();
  });

  it('beginGesture keeps the first snapshot across nested calls', () => {
    load();
    s().updateDoc((d) => ({ ...d, straighten: 5 }), 'none');
    s().beginGesture();
    s().updateDoc((d) => ({ ...d, straighten: 9 }), 'transient');
    s().beginGesture(); // should not overwrite gestureBase
    s().endGesture();
    s().undo();
    expect(doc().straighten).toBe(5);
  });
});

describe('document edits', () => {
  it('setStraighten clamps to ±45', () => {
    load();
    s().setStraighten(90);
    expect(doc().straighten).toBe(45);
    s().setStraighten(-90);
    expect(doc().straighten).toBe(-45);
  });

  it('setStraighten transient coalesces, discrete pushes', () => {
    load();
    s().setStraighten(10, true);
    s().setStraighten(20, true);
    s().endGesture();
    expect(s().past.length).toBe(1);
    s().setStraighten(30);
    expect(s().past.length).toBe(2);
  });

  it('rotate90 wraps through 0/90/180/270 and swaps auto canvas dims', () => {
    load(200, 100);
    s().rotate90(1);
    expect(doc().transform.rotate90).toBe(90);
    expect(doc().canvas).toMatchObject({ width: 100, height: 200 });
    s().rotate90(1);
    s().rotate90(1);
    s().rotate90(1);
    expect(doc().transform.rotate90).toBe(0);
    expect(doc().canvas).toMatchObject({ width: 200, height: 100 });
    s().rotate90(-1);
    expect(doc().transform.rotate90).toBe(270);
  });

  it('flip toggles the requested axis only', () => {
    load();
    s().flip('h');
    expect(doc().transform).toMatchObject({ flipH: true, flipV: false });
    s().flip('v');
    expect(doc().transform).toMatchObject({ flipH: true, flipV: true });
    s().flip('h');
    expect(doc().transform).toMatchObject({ flipH: false, flipV: true });
  });

  it('setCanvasSize disables auto and clamps to >=1', () => {
    load(200, 100);
    s().setCanvasSize(640.4, -5, '#000000');
    expect(doc().canvasAuto).toBe(false);
    expect(doc().canvas).toEqual({ width: 640, height: 1, background: '#000000' });
  });

  it('resetCanvasAuto restores geometry-derived size', () => {
    load(200, 100);
    s().rotate90(1);
    s().setCanvasSize(50, 50, '#fff');
    expect(doc().canvasAuto).toBe(false);
    s().resetCanvasAuto();
    expect(doc().canvasAuto).toBe(true);
    expect(doc().canvas).toMatchObject({ width: 100, height: 200 });
  });

  it('resetAdjustments restores all defaults', () => {
    load();
    s().setAdjustment('brightness', 50);
    s().setAdjustment('exposure', 1);
    s().resetAdjustments();
    expect(doc().adjustments.brightness).toBe(0);
    expect(doc().adjustments.exposure).toBe(0);
  });

  it('no-ops when there is no document', () => {
    s().setAdjustment('brightness', 10);
    s().rotate90(1);
    s().undo();
    s().applyCrop();
    expect(s().doc).toBeNull();
    expect(s().loadError).toBeNull();
  });
});

describe('crop', () => {
  it('applyCrop converts a display draft to a source crop', () => {
    load(100, 50);
    s().setTool('crop');
    // Identity transform: display px == source px. Left half of the image.
    s().setCropDraft({ cx: 25, cy: 25, w: 50, h: 50, angle: 0 });
    s().applyCrop();
    const d = doc();
    expect(d.crop).toMatchObject({ x: 0, y: 0, w: 50, h: 50 });
    expect(d.canvasAuto).toBe(true);
    expect(d.canvas).toMatchObject({ width: 50, height: 50 });
    expect(s().cropDraft).toBeNull();
    expect(s().tool).toBe('select');
    expect(s().canUndo()).toBe(true);
  });

  it('applyCrop with a full-frame draft clears the crop', () => {
    load(100, 50);
    s().setCropDraft({ cx: 50, cy: 25, w: 100, h: 50, angle: 0 });
    s().applyCrop();
    expect(doc().crop).toBeUndefined();
    expect(doc().canvas).toMatchObject({ width: 100, height: 50 });
  });

  it('cancelCrop clears the draft and returns to select', () => {
    load();
    s().setTool('crop');
    s().setCropDraft({ cx: 10, cy: 10, w: 20, h: 20, angle: 0 });
    s().cancelCrop();
    expect(s().cropDraft).toBeNull();
    expect(s().tool).toBe('select');
    expect(doc().crop).toBeUndefined();
  });

  it('applyCrop without a draft is a no-op', () => {
    load();
    s().applyCrop();
    expect(doc().crop).toBeUndefined();
    expect(s().canUndo()).toBe(false);
  });

  it('setCropAspect stores the locked ratio', () => {
    load();
    s().setCropAspect(16 / 9);
    expect(s().cropAspect).toBeCloseTo(16 / 9);
    s().setCropAspect(null);
    expect(s().cropAspect).toBeNull();
  });
});

describe('zoom', () => {
  it('zoomIn scales by 1.25 about the container center', () => {
    load();
    s().setContainer(200, 200);
    s().setView({ tx: 10, ty: 20 });
    s().zoomIn();
    const v = s().view;
    expect(v.scale).toBeCloseTo(1.25);
    // k = 1.25, center = (100,100)
    expect(v.tx).toBeCloseTo(100 - (100 - 10) * 1.25); // -12.5
    expect(v.ty).toBeCloseTo(100 - (100 - 20) * 1.25); // 0
  });

  it('zoomOut divides scale by 1.25', () => {
    load();
    s().setContainer(200, 200);
    s().setView({ scale: 2, tx: 0, ty: 0 });
    s().zoomOut();
    expect(s().view.scale).toBeCloseTo(1.6);
  });

  it('scale clamps to [0.02, 16]', () => {
    load();
    s().setContainer(200, 200);
    for (let i = 0; i < 40; i++) s().zoomIn();
    expect(s().view.scale).toBe(16);
    for (let i = 0; i < 60; i++) s().zoomOut();
    expect(s().view.scale).toBeCloseTo(0.02);
  });

  it('zoomFit fits the doc canvas inside the container with padding', () => {
    load(100, 50);
    s().setContainer(200, 100);
    s().zoomFit();
    const v = s().view;
    expect(v.scale).toBeCloseTo(1.84); // min(2, 2) * 0.92
    expect(v.tx).toBeCloseTo((200 - 100 * 1.84) / 2);
    expect(v.ty).toBeCloseTo((100 - 50 * 1.84) / 2);
  });

  it('zoomFit is a no-op without a container size', () => {
    load();
    s().zoomFit();
    expect(s().view.scale).toBe(1);
    expect(s().view.tx).toBe(0);
  });
});

describe('ui state', () => {
  it('setTool clears the crop draft', () => {
    load();
    s().setCropDraft({ cx: 1, cy: 1, w: 2, h: 2, angle: 0 });
    s().setTool('adjust');
    expect(s().tool).toBe('adjust');
    expect(s().cropDraft).toBeNull();
  });

  it('setView merges partial updates', () => {
    load();
    s().setView({ scale: 2 });
    expect(s().view).toMatchObject({ scale: 2, tx: 0, ty: 0 });
    s().setView({ tx: 5 });
    expect(s().view).toMatchObject({ scale: 2, tx: 5, ty: 0 });
  });

  it('undo/redo clear cropDraft', () => {
    load();
    s().setCropDraft({ cx: 1, cy: 1, w: 2, h: 2, angle: 0 });
    s().setAdjustment('brightness', 10);
    s().undo();
    expect(s().cropDraft).toBeNull();
  });
});

describe('layers', () => {
  it('loadImage seeds a locked image pseudo-layer at index 0', () => {
    load(100, 50);
    const layers = doc().layers;
    expect(layers).toHaveLength(1);
    expect(layers[0]).toMatchObject({ id: 'image', type: 'image', visible: true });
  });

  it('addTextLayer creates a selected text layer and is undoable', () => {
    load(100, 50);
    const id = s().addTextLayer(10, 10);
    expect(id).toBeTruthy();
    const layer = doc().layers.find((l) => l.id === id);
    expect(layer?.type).toBe('text');
    expect(s().selectedLayerId).toBe(id);
    expect(s().canUndo()).toBe(true);
    s().undo();
    expect(doc().layers.find((l) => l.id === id)).toBeUndefined();
  });

  it('updateLayer patches fields and guards the image layer', () => {
    load();
    const id = s().addTextLayer(5, 5)!;
    s().updateLayer(id, { opacity: 0.5, blendMode: 'multiply' });
    const layer = doc().layers.find((l) => l.id === id)!;
    expect(layer.opacity).toBe(0.5);
    expect(layer.blendMode).toBe('multiply');
    const before = doc().layers.length;
    s().updateLayer('image', { opacity: 0.1 });
    s().updateLayer('missing', { opacity: 0.1 });
    expect(doc().layers[0].opacity).toBe(1);
    expect(doc().layers).toHaveLength(before);
  });

  it('removeLayer deletes non-image layers only', () => {
    load();
    const id = s().addTextLayer(5, 5)!;
    s().removeLayer(id);
    expect(doc().layers.find((l) => l.id === id)).toBeUndefined();
    s().removeLayer('image');
    expect(doc().layers[0].type).toBe('image');
    expect(s().selectedLayerId).toBeNull();
  });

  it('moveLayer reorders without touching index 0', () => {
    load();
    const a = s().addTextLayer(5, 5)!;
    const b = s().addTextLayer(20, 20)!;
    // layers: [image, a, b]; move b down → [image, b, a]
    s().moveLayer(b, -1);
    expect(doc().layers.map((l) => l.id)).toEqual(['image', b, a]);
    s().moveLayer('image', 1);
    expect(doc().layers[0].id).toBe('image');
  });

  it('duplicateLayer clones canvas and inserts above', () => {
    load();
    const id = s().addTextLayer(5, 5)!;
    s().duplicateLayer(id);
    expect(doc().layers).toHaveLength(3);
    const copy = doc().layers[2];
    expect(copy.id).not.toBe(id);
    expect(copy.type).toBe('text');
    expect(s().selectedLayerId).toBe(copy.id);
  });

  it('applyPreset writes lerped adjustments as one undo step', () => {
    load();
    s().applyPreset('bw', 1);
    expect(doc().adjustments.saturation).toBe(-100);
    expect(s().past.length).toBe(1);
    s().undo();
    expect(doc().adjustments.saturation).toBe(0);
  });

  it('applyPreset ignores unknown ids and clamps intensity', () => {
    load();
    s().applyPreset('does-not-exist', 1);
    expect(doc().adjustments.saturation).toBe(0);
    expect(s().canUndo()).toBe(false);
    s().applyPreset('bw', 2);
    expect(doc().adjustments.saturation).toBe(-100);
  });

  it('applyPreset transient coalesces into a single undo step', () => {
    load();
    s().applyPreset('warm', 0.5, true);
    s().applyPreset('warm', 1, true);
    s().endGesture();
    expect(s().past.length).toBe(1);
    expect(doc().adjustments.temperature).toBe(45);
    s().undo();
    expect(doc().adjustments.temperature).toBe(0);
  });

  it('moveLayer refuses to move past the stack ends', () => {
    load();
    const a = s().addTextLayer(5, 5)!;
    const b = s().addTextLayer(20, 20)!;
    const order = () => doc().layers.map((l) => l.id);
    s().moveLayer(a, -1); // already directly above image → no-op
    expect(order()).toEqual(['image', a, b]);
    s().moveLayer(b, 1); // already topmost → no-op
    expect(order()).toEqual(['image', a, b]);
  });

  it('duplicateLayer ignores the image pseudo-layer and unknown ids', () => {
    load();
    const before = doc().layers.length;
    s().duplicateLayer('image');
    s().duplicateLayer('missing');
    expect(doc().layers).toHaveLength(before);
    expect(s().selectedLayerId).toBeNull();
  });

  it('addShapeLayer returns null without a document', () => {
    expect(s().addShapeLayer(0, 0, 10, 10)).toBeNull();
    expect(s().addTextLayer(0, 0)).toBeNull();
  });

  it('addShapeLayer rasterizes with the shared current color', () => {
    load(100, 50);
    s().setCurrentColor('#123456');
    s().setShape({ kind: 'ellipse', strokeWidth: 6 });
    const id = s().addShapeLayer(10, 10, 60, 40);
    expect(id).toBeTruthy();
    const layer = doc().layers.find((l) => l.id === id)!;
    expect(layer.type).toBe('shape');
    expect(layer.name).toBe('Ellipse');
    expect(layer.shape).toMatchObject({ kind: 'ellipse', color: '#123456', strokeWidth: 6 });
    expect(layer.canvas).toBeDefined();
    expect(layer.w).toBeGreaterThan(0);
    expect(s().selectedLayerId).toBe(id);
    expect(s().canUndo()).toBe(true);
  });

  it('updateTextLayer re-rasterizes and patches text props in one step', () => {
    load(100, 50);
    const id = s().addTextLayer(10, 10)!;
    s().updateTextLayer(id, { content: 'Hello', fontSize: 80, align: 'center' });
    const layer = doc().layers.find((l) => l.id === id)!;
    expect(layer.text).toMatchObject({ content: 'Hello', fontSize: 80, align: 'center' });
    expect(layer.canvas).toBeDefined();
    expect(s().past.length).toBe(2); // add + update = two commits
    s().undo();
    const reverted = doc().layers.find((l) => l.id === id)!;
    expect(reverted.text?.content).toBe('Text');
  });

  it('updateTextLayer ignores non-text layers and unknown ids', () => {
    load();
    const shapeId = s().addShapeLayer(0, 0, 20, 20)!;
    const before = doc().layers.length;
    s().updateTextLayer(shapeId, { content: 'nope' });
    s().updateTextLayer('missing', { content: 'nope' });
    s().updateTextLayer('image', { content: 'nope' });
    expect(doc().layers).toHaveLength(before);
    expect(doc().layers.find((l) => l.id === shapeId)?.text).toBeUndefined();
  });
});

describe('tool settings', () => {
  it('setBrush/setShape merge partial updates', () => {
    s().setBrush({ size: 12, hardness: 0.5 });
    expect(s().brush).toMatchObject({ size: 12, hardness: 0.5, opacity: 1, eraser: false });
    s().setShape({ kind: 'arrow' });
    expect(s().shape).toMatchObject({ kind: 'arrow', color: '#ffd166' });
  });

  it('setCurrentColor/selectLayer/setLoadError/setComparing update state', () => {
    s().setCurrentColor('#abcdef');
    expect(s().currentColor).toBe('#abcdef');
    s().selectLayer('layer-1');
    expect(s().selectedLayerId).toBe('layer-1');
    s().setLoadError('boom');
    expect(s().loadError).toBe('boom');
    s().setComparing(true);
    expect(s().comparing).toBe(true);
  });
});

describe('exported helpers', () => {
  it('imageLayer returns the locked pseudo-layer', () => {
    expect(imageLayer()).toEqual({
      id: 'image', type: 'image', name: 'Image',
      visible: true, opacity: 1, blendMode: 'normal',
      x: 0, y: 0, w: 0, h: 0,
    });
  });

  it('defaultTextProps fills every TextProps field', () => {
    const t = defaultTextProps('#ff0000', 300);
    expect(t).toEqual({
      content: 'Text', fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 64, bold: false, italic: false, color: '#ff0000',
      align: 'left', letterSpacing: 0, lineHeight: 1.2, wrapWidth: 300,
    });
  });
});

describe('brush stroke lifecycle', () => {
  it('beginBrushStroke creates a full-frame raster layer and working state', () => {
    load(100, 50);
    s().setBrush({ size: 20 });
    s().beginBrushStroke();
    const stroke = s().activeStroke;
    expect(stroke).not.toBeNull();
    expect(stroke!.points).toEqual([]);
    expect(stroke!.params).toMatchObject({ size: 20, color: '#ffd166', eraser: false });
    const layer = doc().layers.find((l) => l.id === stroke!.layerId)!;
    expect(layer.type).toBe('raster');
    expect(layer).toMatchObject({ x: 0, y: 0, w: 100, h: 50 });
    expect(stroke!.createdLayer).toBe(true);
    expect(s().selectedLayerId).toBe(layer.id);
    expect(s().canUndo()).toBe(false); // gesture not ended yet
  });

  it('beginBrushStroke is a no-op without a doc or during an active stroke', () => {
    s().beginBrushStroke();
    expect(s().activeStroke).toBeNull();
    load();
    s().beginBrushStroke();
    const first = s().activeStroke;
    s().beginBrushStroke();
    expect(s().activeStroke).toBe(first);
    expect(doc().layers.filter((l) => l.type === 'raster')).toHaveLength(1);
  });

  it('brushStrokeTo accumulates points and commitBrushStroke writes the canvas', () => {
    load(100, 50);
    s().beginBrushStroke();
    s().brushStrokeTo(10, 10);
    s().brushStrokeTo(30, 30);
    const stroke = s().activeStroke!;
    expect(stroke.points).toEqual([{ x: 10, y: 10 }, { x: 30, y: 30 }]);
    s().commitBrushStroke();
    expect(s().activeStroke).toBeNull();
    const layer = doc().layers.find((l) => l.id === stroke.layerId)!;
    expect(layer.canvas).toBe(stroke.canvas);
    // The stamp drew something: some pixel in the stroke canvas is non-transparent.
    const ctx = layer.canvas!.getContext('2d')!;
    const data = ctx.getImageData(0, 0, layer.canvas!.width, layer.canvas!.height).data;
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted++;
    expect(painted).toBeGreaterThan(0);
    // One gesture = one undo step that removes the whole stroke.
    expect(s().past.length).toBe(1);
    s().undo();
    expect(doc().layers.find((l) => l.id === stroke.layerId)).toBeUndefined();
  });

  it('cancelBrushStroke removes a stroke-created layer and its selection', () => {
    load(100, 50);
    s().beginBrushStroke();
    const stroke = s().activeStroke!;
    s().brushStrokeTo(10, 10);
    s().cancelBrushStroke();
    expect(s().activeStroke).toBeNull();
    expect(doc().layers.find((l) => l.id === stroke.layerId)).toBeUndefined();
    expect(s().selectedLayerId).toBeNull();
  });

  it('reuses the selected raster layer instead of creating a new one', () => {
    load(100, 50);
    s().beginBrushStroke();
    const stroke = s().activeStroke!;
    s().commitBrushStroke();
    // Second stroke targets the same raster layer.
    s().beginBrushStroke();
    const second = s().activeStroke!;
    expect(second.layerId).toBe(stroke.layerId);
    expect(second.createdLayer).toBe(false);
    expect(doc().layers.filter((l) => l.type === 'raster')).toHaveLength(1);
    s().cancelBrushStroke();
    // Cancelling a reused layer keeps the layer (and its prior content).
    expect(doc().layers.find((l) => l.id === stroke.layerId)).toBeDefined();
  });

  it('commitBrushStroke/cancelBrushStroke are no-ops without a stroke', () => {
    load();
    s().commitBrushStroke();
    s().cancelBrushStroke();
    expect(s().activeStroke).toBeNull();
    expect(doc().layers).toHaveLength(1);
  });
});

describe('loadFile success path', () => {
  it('decodes an image blob and loads it', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 8, height: 4 })));
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    await s().loadFile(blob, 'ok.png');
    expect(s().loadError).toBeNull();
    expect(doc().sourceName).toBe('ok.png');
    expect(doc().canvas).toMatchObject({ width: 8, height: 4 });
  });

  it('clears a previous loadError on successful load', async () => {
    s().setLoadError('old');
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 2, height: 2 })));
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    await s().loadFile(blob);
    expect(s().loadError).toBeNull();
    // No name → falls back to blob name (empty for a plain Blob) → 'image'.
    expect(doc().sourceName).toBe('image');
  });
});
