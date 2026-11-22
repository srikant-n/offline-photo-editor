import { describe, it, expect, beforeEach } from 'vitest';
import { useEditor } from './documentStore';
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
    view: { scale: 1, tx: 0, ty: 0, baseW: 0, baseH: 0 },
    container: { w: 0, h: 0 },
  });
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
