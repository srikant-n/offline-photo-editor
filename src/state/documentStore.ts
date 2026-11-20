import { create } from 'zustand';
import type { Document, ToolMode, TransformState } from '../types';
import { defaultAdjustments } from './adjustments';
import { decodeImageBlob, type DecodedImage } from '../image/decode';
import { effectiveCrop, transformedSize, displayDraftToSourceCrop, type RotRect } from '../render/geometry';

const HISTORY_LIMIT = 50;

/** Live crop marquee: rotated rect in crop-mode display px. */
export type CropDraft = RotRect;

interface EditorState {
  doc: Document | null;
  past: Document[];
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

  /** Viewport transform: screen = imgPx * scale + t. baseW/H = rendered px size. */
  view: { scale: number; tx: number; ty: number; baseW: number; baseH: number };
  container: { w: number; h: number };

  // ---- document lifecycle ----
  loadImage: (decoded: DecodedImage) => void;
  loadFile: (file: Blob, name?: string) => Promise<void>;
  clearDocument: () => void;

  // ---- history ----
  /** Snapshot current doc before a mutation. Use for discrete commits. */
  commit: () => void;
  /** Start a coalesced gesture (e.g. slider drag). */
  beginGesture: () => void;
  /** End gesture; pushes gestureBase onto history if doc changed. */
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  /** Mutate doc. `history: 'push'` commits first; 'transient' requires an active gesture. */
  updateDoc: (fn: (d: Document) => Document, history?: 'push' | 'transient' | 'none') => void;

  // ---- tools / ui ----
  setTool: (t: ToolMode) => void;
  setCropDraft: (d: CropDraft | null) => void;
  setCropAspect: (a: number | null) => void;
  setComparing: (v: boolean) => void;
  setLoadError: (e: string | null) => void;
  setView: (v: Partial<EditorState['view']>) => void;
  setContainer: (w: number, h: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;

  // ---- document edits ----
  applyCrop: () => void;
  cancelCrop: () => void;
  rotate90: (dir: 1 | -1) => void;
  flip: (axis: 'h' | 'v') => void;
  setStraighten: (deg: number, transient?: boolean) => void;
  setCanvasSize: (w: number, h: number, background: string) => void;
  resetCanvasAuto: () => void;
  setAdjustment: (key: keyof Document['adjustments'], value: number, transient?: boolean) => void;
  resetAdjustments: () => void;
}

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
    view: { scale: 1, tx: 0, ty: 0, baseW: 0, baseH: 0 },
    container: { w: 0, h: 0 },

    loadImage: (decoded) => {
      set({
        doc: freshDoc(decoded),
        past: [], future: [], gestureBase: null,
        cropDraft: null, cropAspect: null, tool: 'select',
        comparing: false, loadError: null,
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
      set({ doc: null, past: [], future: [], gestureBase: null, cropDraft: null, cropAspect: null }),

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
  };
});

