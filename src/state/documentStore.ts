import { create } from 'zustand';
import type {
  Document, Layer, ShapeProps, TextProps, ToolMode, TransformState,
} from '../types';
import { defaultAdjustments } from './adjustments';
import { decodeImageBlob, type DecodedImage } from '../image/decode';
import {
  documentOutputSize, effectiveCrop, transformedSize,
  displayDraftToSourceCrop, type RotRect,
} from '../render/geometry';
import { rasterizeText } from '../render/layers/textRender';
import { rasterizeShape } from '../render/layers/shapes';
import { makeStamp, stampSegment, type BrushParams, type StrokePoint } from '../render/layers/brush';
import { getPreset, lerpAdjustments } from '../presets';

/** Maximum number of undo snapshots retained in history. */
const HISTORY_LIMIT = 50;

/** Live crop marquee: rotated rect in crop-mode display px. */
export type CropDraft = RotRect;

/** Brush tool settings: size in px, hardness/opacity 0..1, eraser mode flag. */
export interface BrushSettings {
  size: number;
  /** 0..1 */
  hardness: number;
  /** 0..1 */
  opacity: number;
  eraser: boolean;
}

/** Default brush settings used for new strokes. */
export const DEFAULT_BRUSH: BrushSettings = {
  size: 40, hardness: 0.8, opacity: 1, eraser: false,
};

/** Default shape properties used when the shape tool starts. */
export const DEFAULT_SHAPE: ShapeProps = {
  kind: 'rect', color: '#ffd166', strokeWidth: 4,
};

/** Builds default TextProps for a new text layer, with the given color and wrap width. */
export function defaultTextProps(color: string, wrapWidth: number): TextProps {
  return {
    content: 'Text',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 64,
    bold: false,
    italic: false,
    color,
    align: 'left',
    letterSpacing: 0,
    lineHeight: 1.2,
    wrapWidth,
  };
}

/** In-progress brush stroke working state (not part of the document). */
export interface ActiveStroke {
  layerId: string;
  /** Working canvas — a fresh copy (copy-on-write safe). */
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Output-px → canvas-px offset (0,0 for full-frame raster layers). */
  offsetX: number;
  offsetY: number;
  points: StrokePoint[];
  params: BrushParams;
  /** True when the target raster layer was created by this stroke. */
  createdLayer: boolean;
}

/** Root zustand store holding the document, undo history, tool state, and viewport. */
interface EditorState {
  /** Current document, or null when no image is loaded. */
  doc: Document | null;
  /** Undo stack of document snapshots, oldest→newest (capped at HISTORY_LIMIT). */
  past: Document[];
  /** Redo stack of document snapshots. */
  future: Document[];
  /** Doc snapshot at the start of an in-progress gesture (slider drag etc.). */
  gestureBase: Document | null;

  tool: ToolMode;
  /** Live crop marquee state while the crop tool is active. */
  cropDraft: CropDraft | null;
  /** Locked aspect ratio (w/h) for the crop marquee; null = free. */
  cropAspect: number | null;
  /** 1 while the user holds the before/after comparison. */
  comparing: boolean;
  /** Set when a file fails to decode, cleared on next load. */
  loadError: string | null;

  // ---- layers / tools (Section 2) ----
  selectedLayerId: string | null;
  /** Shared foreground color for brush/text/shape + eyedropper target. */
  currentColor: string;
  brush: BrushSettings;
  shape: ShapeProps;
  /** Live brush-stroke working canvas (mutated during the gesture). */
  activeStroke: ActiveStroke | null;

  /** Viewport transform: screen = imgPx * scale + t. baseW/H = rendered px size. */
  view: { scale: number; tx: number; ty: number; baseW: number; baseH: number };
  container: { w: number; h: number };

  // ---- document lifecycle ----
  /** Replace the current document with a freshly decoded image. */
  loadImage: (decoded: DecodedImage) => void;
  /** Decode a Blob/File and load it as the document; sets loadError on failure. */
  loadFile: (file: Blob, name?: string) => Promise<void>;
  /** Close the current document and reset all editor state. */
  clearDocument: () => void;

  // ---- history ----
  /** Snapshot current doc before a mutation. Use for discrete commits. */
  commit: () => void;
  /** Start a coalesced gesture (e.g. slider drag). */
  beginGesture: () => void;
  /** End gesture; pushes gestureBase onto history if doc changed. */
  endGesture: () => void;
  /** Restore the previous document snapshot. */
  undo: () => void;
  /** Re-apply the most recently undone snapshot. */
  redo: () => void;
  /** Whether an undo is available. */
  canUndo: () => boolean;
  /** Whether a redo is available. */
  canRedo: () => boolean;

  /** Mutate doc. `history: 'push'` commits first; 'transient' requires an active gesture. */
  updateDoc: (fn: (d: Document) => Document, history?: 'push' | 'transient' | 'none') => void;

  // ---- tools / ui ----
  /** Switch the active tool; clears any in-progress crop draft. */
  setTool: (t: ToolMode) => void;
  /** Set or clear the live crop marquee rect. */
  setCropDraft: (d: CropDraft | null) => void;
  /** Set the locked crop aspect ratio (w/h); null = free. */
  setCropAspect: (a: number | null) => void;
  /** Toggle before/after comparison display. */
  setComparing: (v: boolean) => void;
  /** Set or clear the file-load error toast message. */
  setLoadError: (e: string | null) => void;
  /** Patch the viewport transform (scale + translation). */
  setView: (v: Partial<EditorState['view']>) => void;
  /** Update the viewport container size in screen px. */
  setContainer: (w: number, h: number) => void;
  /** Zoom in one step around the container center. */
  zoomIn: () => void;
  /** Zoom out one step around the container center. */
  zoomOut: () => void;
  /** Fit the rendered image to the container with padding. */
  zoomFit: () => void;

  // ---- document edits ----
  /** Commit the crop draft: convert it to source coords and resize the canvas to fit. */
  applyCrop: () => void;
  /** Discard the crop draft and return to the select tool. */
  cancelCrop: () => void;
  /** Rotate the image 90° clockwise (dir=1) or counter-clockwise (dir=-1). */
  rotate90: (dir: 1 | -1) => void;
  /** Toggle horizontal ('h') or vertical ('v') flip. */
  flip: (axis: 'h' | 'v') => void;
  /** Set the free straighten angle in degrees (-45..45); transient coalesces into a gesture. */
  setStraighten: (deg: number, transient?: boolean) => void;
  /** Set a fixed output canvas size and background, disabling auto-sizing. */
  setCanvasSize: (w: number, h: number, background: string) => void;
  /** Re-enable auto canvas sizing to the transformed image bounds. */
  resetCanvasAuto: () => void;
  /** Set one adjustment value; transient coalesces into a gesture (e.g. slider drag). */
  setAdjustment: (key: keyof Document['adjustments'], value: number, transient?: boolean) => void;
  /** Reset all adjustments to their defaults. */
  resetAdjustments: () => void;

  // ---- layers ----
  /** Select a layer for editing, or null to deselect. */
  selectLayer: (id: string | null) => void;
  /** Set the shared foreground color used by brush, text, shape, and eyedropper. */
  setCurrentColor: (c: string) => void;
  /** Merge partial brush settings into the current brush config. */
  setBrush: (p: Partial<BrushSettings>) => void;
  /** Merge partial shape props into the current shape config. */
  setShape: (p: Partial<ShapeProps>) => void;
  /** Patch any layer field; 'push' records history, 'transient' needs a gesture. */
  updateLayer: (id: string, patch: Partial<Layer>, history?: 'push' | 'transient' | 'none') => void;
  /** Patch a text layer's text props and re-rasterize (one history entry). */
  updateTextLayer: (id: string, patch: Partial<TextProps>, transient?: boolean) => void;
  /** Delete a layer (the locked image layer cannot be removed). */
  removeLayer: (id: string) => void;
  /** Deep-copy a layer, insert it above the original, and select the copy. */
  duplicateLayer: (id: string) => void;
  /** Move a layer up/down the stack (later index = visually on top). */
  moveLayer: (id: string, dir: 1 | -1) => void;
  /** Create a text layer at an output-space point; returns its id. */
  addTextLayer: (x: number, y: number) => string | null;
  /** Create a rasterized shape layer from a drag; returns its id. */
  addShapeLayer: (x0: number, y0: number, x1: number, y1: number) => string | null;
  /** Apply a named preset at intensity 0..1 through the adjustment path. */
  applyPreset: (presetId: string, intensity: number, transient?: boolean) => void;

  // ---- brush stroke lifecycle ----
  /** Begin a stroke: ensures a raster target layer + working canvas. */
  beginBrushStroke: () => void;
  /** Stamp to an output-space point during an active stroke. */
  brushStrokeTo: (x: number, y: number) => void;
  /** Commit the working canvas into the layer (inside the gesture). */
  commitBrushStroke: () => void;
  /** Discard the stroke (e.g. Escape). */
  cancelBrushStroke: () => void;
}

let layerCounter = 0;
/** Generates a unique layer id with a readable prefix. */
function layerId(prefix: string): string {
  layerCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${layerCounter}`;
}

/** Pseudo-layer at index 0: renders the adjusted source via the GL/2D pass. */
export function imageLayer(): Layer {
  return {
    id: 'image', type: 'image', name: 'Image',
    visible: true, opacity: 1, blendMode: 'normal',
    x: 0, y: 0, w: 0, h: 0,
  };
}

/** Builds a new Document from decoded image data with default edits and an image layer. */
function freshDoc(d: DecodedImage): Document {
  return {
    source: d.bitmap,
    sourceName: d.name || 'image',
    canvas: {
      width: d.width,
      height: d.height,
      background: '#ffffff',
    },
    canvasAuto: true,
    straighten: 0,
    transform: { rotate90: 0, flipH: false, flipV: false },
    adjustments: defaultAdjustments(),
    layers: [imageLayer()],
  };
}

/** Recompute auto canvas size after geometry changes. */
function withAutoCanvas(d: Document): Document {
  if (!d.canvasAuto) return d;
  const s = transformedSize(d.source.width, d.source.height, {
    crop: d.crop, straighten: d.straighten, transform: d.transform,
    outW: 0, outH: 0, background: d.canvas.background,
  });
  return { ...d, canvas: { ...d.canvas, width: s.w, height: s.h } };
}

export const useEditor = create<EditorState>((set, get) => {
  const pushDoc = (d: Document) =>
    set((s) => ({
      past: [...s.past, d].slice(-HISTORY_LIMIT),
      future: [],
      gestureBase: null,
    }));

  return {
    doc: null,
    past: [],
    future: [],
    gestureBase: null,
    tool: 'select',
    cropDraft: null,
    cropAspect: null,
    comparing: false,
    loadError: null,
    selectedLayerId: null,
    currentColor: '#ffd166',
    brush: { ...DEFAULT_BRUSH },
    shape: { ...DEFAULT_SHAPE },
    activeStroke: null,
    view: { scale: 1, tx: 0, ty: 0, baseW: 0, baseH: 0 },
    container: { w: 0, h: 0 },

    loadImage: (decoded) => {
      set({
        doc: freshDoc(decoded),
        past: [], future: [], gestureBase: null,
        cropDraft: null, cropAspect: null, tool: 'select',
        comparing: false, loadError: null,
        selectedLayerId: null, activeStroke: null,
      });
    },

    loadFile: async (file, name) => {
      try {
        const decoded = await decodeImageBlob(file, name ?? (file as File).name ?? '');
        get().loadImage(decoded);
      } catch (e) {
        set({ loadError: e instanceof Error ? e.message : 'Unsupported or corrupt image file' });
      }
    },

    clearDocument: () =>
      set({
        doc: null, past: [], future: [], gestureBase: null,
        cropDraft: null, cropAspect: null, selectedLayerId: null, activeStroke: null,
      }),

    commit: () => {
      const { doc } = get();
      if (doc) pushDoc(doc);
    },

    beginGesture: () => {
      const { doc, gestureBase } = get();
      if (doc && !gestureBase) set({ gestureBase: doc });
    },

    endGesture: () => {
      const { doc, gestureBase } = get();
      if (!doc || !gestureBase) { set({ gestureBase: null }); return; }
      if (doc !== gestureBase) {
        set((s) => ({
          past: [...s.past, gestureBase].slice(-HISTORY_LIMIT),
          future: [],
          gestureBase: null,
        }));
      } else {
        set({ gestureBase: null });
      }
    },

    undo: () => {
      const { doc, past, future } = get();
      if (!doc || past.length === 0) return;
      const prev = past[past.length - 1];
      set({
        doc: prev,
        past: past.slice(0, -1),
        future: [doc, ...future],
        gestureBase: null,
        cropDraft: null,
      });
    },

    redo: () => {
      const { doc, past, future } = get();
      if (!doc || future.length === 0) return;
      const next = future[0];
      set({
        doc: next,
        past: [...past, doc].slice(-HISTORY_LIMIT),
        future: future.slice(1),
        gestureBase: null,
        cropDraft: null,
      });
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    updateDoc: (fn, history = 'push') => {
      const { doc, gestureBase } = get();
      if (!doc) return;
      const next = fn(doc);
      if (next === doc) return;
      if (history === 'push') get().commit();
      else if (history === 'transient' && !gestureBase) set({ gestureBase: doc });
      set({ doc: next });
    },

    setTool: (tool) => set({ tool, cropDraft: null }),
    setCropDraft: (cropDraft) => set({ cropDraft }),
    setCropAspect: (cropAspect) => set({ cropAspect }),
    setComparing: (comparing) => set({ comparing }),
    setLoadError: (loadError) => set({ loadError }),

    setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),
    setContainer: (w, h) => set({ container: { w, h } }),

    zoomIn: () => {
      const { view, container } = get();
      const s = Math.min(16, view.scale * 1.25);
      const k = s / view.scale;
      const cx = container.w / 2, cy = container.h / 2;
      set({ view: { ...view, scale: s, tx: cx - (cx - view.tx) * k, ty: cy - (cy - view.ty) * k } });
    },
    zoomOut: () => {
      const { view, container } = get();
      const s = Math.max(0.02, view.scale / 1.25);
      const k = s / view.scale;
      const cx = container.w / 2, cy = container.h / 2;
      set({ view: { ...view, scale: s, tx: cx - (cx - view.tx) * k, ty: cy - (cy - view.ty) * k } });
    },
    zoomFit: () => {
      const { view, container, doc } = get();
      const bw = view.baseW || doc?.canvas.width || 1;
      const bh = view.baseH || doc?.canvas.height || 1;
      if (!container.w || !container.h) return;
      const pad = 0.92;
      const s = Math.min(container.w / bw, container.h / bh) * pad;
      set({
        view: {
          ...view, scale: s,
          tx: (container.w - bw * s) / 2,
          ty: (container.h - bh * s) / 2,
        },
      });
    },

    applyCrop: () => {
      const { doc, cropDraft } = get();
      if (!doc || !cropDraft) return;
      get().commit();
      // cropDraft is in crop-mode display coords → convert to source space
      const disp = doc.canvasAuto
        ? transformedSize(doc.source.width, doc.source.height, {
            straighten: 0, transform: doc.transform,
            outW: 0, outH: 0, background: doc.canvas.background,
          })
        : { w: doc.canvas.width, h: doc.canvas.height };
      const srcCrop = displayDraftToSourceCrop(
        doc.source.width, doc.source.height, doc.transform, disp.w, disp.h, cropDraft,
      );
      const ec = effectiveCrop(doc.source.width, doc.source.height, srcCrop);
      const isFull =
        ec.x === 0 && ec.y === 0 && ec.w === doc.source.width && ec.h === doc.source.height &&
        Math.abs(ec.angle ?? 0) < 0.5;
      const next: Document = {
        ...doc,
        crop: isFull ? undefined : srcCrop,
        canvasAuto: true,
      };
      set({ doc: withAutoCanvas(next), cropDraft: null, tool: 'select' });
    },

    cancelCrop: () => set({ cropDraft: null, tool: 'select' }),

    rotate90: (dir) => {
      get().updateDoc((d) => {
        const next = ((d.transform.rotate90 + dir * 90) % 360 + 360) % 360 as TransformState['rotate90'];
        return withAutoCanvas({ ...d, transform: { ...d.transform, rotate90: next } });
      });
    },

    flip: (axis) => {
      get().updateDoc((d) =>
        withAutoCanvas({
          ...d,
          transform: { ...d.transform, [axis === 'h' ? 'flipH' : 'flipV']: !d.transform[axis === 'h' ? 'flipH' : 'flipV'] },
        }),
      );
    },

    setStraighten: (deg, transient = false) => {
      const clamped = Math.max(-45, Math.min(45, deg));
      if (transient) {
        get().updateDoc((d) => withAutoCanvas({ ...d, straighten: clamped }), 'transient');
      } else {
        get().updateDoc((d) => withAutoCanvas({ ...d, straighten: clamped }), 'push');
      }
    },

    setCanvasSize: (w, h, background) => {
      get().updateDoc((d) => ({
        ...d,
        canvas: { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)), background },
        canvasAuto: false,
      }));
    },

    resetCanvasAuto: () => {
      get().updateDoc((d) => {
        if (d.canvasAuto) return d;
        const s = transformedSize(d.source.width, d.source.height, {
          crop: d.crop, straighten: d.straighten, transform: d.transform,
          outW: 0, outH: 0, background: d.canvas.background,
        });
        return { ...d, canvasAuto: true, canvas: { ...d.canvas, width: s.w, height: s.h } };
      });
    },

    setAdjustment: (key, value, transient = false) => {
      get().updateDoc(
        (d) => ({ ...d, adjustments: { ...d.adjustments, [key]: value } }),
        transient ? 'transient' : 'push',
      );
    },

    resetAdjustments: () => {
      get().updateDoc((d) => ({ ...d, adjustments: defaultAdjustments() }));
    },

    // ---- layers ----

    selectLayer: (selectedLayerId) => set({ selectedLayerId }),
    setCurrentColor: (currentColor) => set({ currentColor }),
    setBrush: (p) => set((s) => ({ brush: { ...s.brush, ...p } })),
    setShape: (p) => set((s) => ({ shape: { ...s.shape, ...p } })),

    updateLayer: (id, patch, history = 'push') => {
      get().updateDoc((d) => {
        const i = d.layers.findIndex((l) => l.id === id);
        if (i <= 0) return d; // image layer and unknown ids are immutable
        const layers = d.layers.slice();
        layers[i] = { ...layers[i], ...patch };
        return { ...d, layers };
      }, history);
    },

    updateTextLayer: (id, patch, transient = false) => {
      const { doc } = get();
      const layer = doc?.layers.find((l) => l.id === id);
      if (!doc || !layer || layer.type !== 'text' || !layer.text) return;
      const text: TextProps = { ...layer.text, ...patch };
      const r = rasterizeText(text);
      get().updateDoc((d) => {
        const i = d.layers.findIndex((l) => l.id === id);
        if (i <= 0) return d;
        const layers = d.layers.slice();
        layers[i] = { ...layers[i], text, canvas: r.canvas, w: r.w, h: r.h };
        return { ...d, layers };
      }, transient ? 'transient' : 'push');
    },

    removeLayer: (id) => {
      const { selectedLayerId } = get();
      get().updateDoc((d) => {
        const i = d.layers.findIndex((l) => l.id === id);
        if (i <= 0) return d;
        const layers = d.layers.slice(0, i).concat(d.layers.slice(i + 1));
        return { ...d, layers };
      });
      if (selectedLayerId === id) set({ selectedLayerId: null });
    },

    duplicateLayer: (id) => {
      const { doc } = get();
      const layer = doc?.layers.find((l) => l.id === id);
      if (!doc || !layer || layer.type === 'image') return;
      const copy: Layer = {
        ...layer,
        id: layerId('layer'),
        name: `${layer.name} copy`,
        canvas: layer.canvas ? cloneCanvas(layer.canvas) : undefined,
        text: layer.text ? { ...layer.text } : undefined,
        shape: layer.shape ? { ...layer.shape } : undefined,
      };
      get().updateDoc((d) => {
        const i = d.layers.findIndex((l) => l.id === id);
        if (i <= 0) return d;
        const layers = d.layers.slice();
        layers.splice(i + 1, 0, copy);
        return { ...d, layers };
      });
      set({ selectedLayerId: copy.id });
    },

    moveLayer: (id, dir) => {
      get().updateDoc((d) => {
        const i = d.layers.findIndex((l) => l.id === id);
        const j = i + dir;
        if (i <= 0 || j <= 0 || j >= d.layers.length) return d;
        const layers = d.layers.slice();
        [layers[i], layers[j]] = [layers[j], layers[i]];
        return { ...d, layers };
      });
    },

    addTextLayer: (x, y) => {
      const { doc, currentColor } = get();
      if (!doc) return null;
      const out = documentOutputSize(doc);
      const wrapWidth = Math.min(640, Math.max(220, Math.round(out.w * 0.5)));
      const fontSize = Math.max(16, Math.min(120, Math.round(out.h * 0.055)));
      const text = { ...defaultTextProps(currentColor, wrapWidth), fontSize };
      const r = rasterizeText(text);
      const layer: Layer = {
        id: layerId('text'), type: 'text', name: 'Text',
        visible: true, opacity: 1, blendMode: 'normal',
        x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)),
        w: r.w, h: r.h, canvas: r.canvas, text,
      };
      get().updateDoc((d) => ({ ...d, layers: [...d.layers, layer] }));
      set({ selectedLayerId: layer.id });
      return layer.id;
    },

    addShapeLayer: (x0, y0, x1, y1) => {
      const { doc, shape, currentColor } = get();
      if (!doc) return null;
      // Stroke color always comes from the shared current color (eyedropper,
      // brush panel, shape panel all write it).
      const effShape = { ...shape, color: currentColor };
      const r = rasterizeShape(effShape, x0, y0, x1, y1);
      const layer: Layer = {
        id: layerId('shape'), type: 'shape', name: effShape.kind[0].toUpperCase() + effShape.kind.slice(1),
        visible: true, opacity: 1, blendMode: 'normal',
        x: r.x, y: r.y, w: r.w, h: r.h, canvas: r.canvas,
        shape: { ...effShape },
      };
      get().updateDoc((d) => ({ ...d, layers: [...d.layers, layer] }));
      set({ selectedLayerId: layer.id });
      return layer.id;
    },

    applyPreset: (presetId, intensity, transient = false) => {
      const preset = getPreset(presetId);
      if (!preset) return;
      const t = Math.max(0, Math.min(1, intensity));
      get().updateDoc(
        (d) => ({ ...d, adjustments: lerpAdjustments(d.adjustments, preset.adjustments, t) }),
        transient ? 'transient' : 'push',
      );
    },

    // ---- brush stroke lifecycle ----

    beginBrushStroke: () => {
      const { doc, brush, currentColor, selectedLayerId, activeStroke } = get();
      if (!doc || activeStroke) return;
      const out = documentOutputSize(doc);
      get().beginGesture();

      // Reuse the selected raster layer if it has content; otherwise create one.
      const sel = doc.layers.find((l) => l.id === selectedLayerId);
      let target = sel && sel.type === 'raster' ? sel : null;
      let created = false;
      if (!target) {
        target = {
          id: layerId('brush'), type: 'raster', name: 'Brush',
          visible: true, opacity: 1, blendMode: 'normal',
          x: 0, y: 0, w: out.w, h: out.h,
        };
        created = true;
        get().updateDoc((d) => ({ ...d, layers: [...d.layers, target!] }), 'transient');
        set({ selectedLayerId: target.id });
      }

      // Working canvas = clone of existing content (copy-on-write) or fresh.
      const w = Math.max(1, Math.round(target.w));
      const h = Math.max(1, Math.round(target.h));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      if (target.canvas) ctx.drawImage(target.canvas, 0, 0);

      const params: BrushParams = {
        size: brush.size,
        hardness: brush.hardness,
        opacity: brush.opacity,
        color: currentColor,
        eraser: brush.eraser,
      };
      set({
        activeStroke: {
          layerId: target.id, canvas, ctx,
          offsetX: target.x, offsetY: target.y,
          points: [], params, createdLayer: created,
        },
      });
    },

    brushStrokeTo: (x, y) => {
      const { activeStroke } = get();
      if (!activeStroke) return;
      const cx = x - activeStroke.offsetX;
      const cy = y - activeStroke.offsetY;
      const prev = activeStroke.points[activeStroke.points.length - 1];
      activeStroke.points.push({ x: cx, y: cy });
      // Stamp live onto the working canvas (not part of the doc → no history).
      const stamp = makeStamp(activeStroke.params);
      stampSegment(
        activeStroke.ctx,
        prev ?? { x: cx, y: cy },
        { x: cx, y: cy },
        activeStroke.params,
        stamp,
      );
      // Trigger a re-composite without touching the doc.
      set({ activeStroke: { ...activeStroke } });
    },

    commitBrushStroke: () => {
      const { activeStroke } = get();
      if (!activeStroke) return;
      const { layerId, canvas } = activeStroke;
      set({ activeStroke: null });
      get().updateDoc((d) => {
        const i = d.layers.findIndex((l) => l.id === layerId);
        if (i <= 0) return d;
        const layers = d.layers.slice();
        layers[i] = { ...layers[i], canvas };
        return { ...d, layers };
      }, 'transient');
      get().endGesture();
    },

    cancelBrushStroke: () => {
      const { activeStroke } = get();
      if (!activeStroke) return;
      const { layerId, createdLayer } = activeStroke;
      set({ activeStroke: null });
      if (createdLayer) {
        get().updateDoc((d) => {
          const i = d.layers.findIndex((l) => l.id === layerId);
          if (i <= 0) return d;
          const layers = d.layers.slice(0, i).concat(d.layers.slice(i + 1));
          return { ...d, layers };
        }, 'transient');
        if (get().selectedLayerId === layerId) set({ selectedLayerId: null });
      }
      get().endGesture();
    },
  };
});

/** Creates a copy of a canvas with identical pixel content. */
function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

