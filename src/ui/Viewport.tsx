import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../state/documentStore';
import type { Document } from '../types';
import { createGlRenderer, type Renderer } from '../render/gl/engine';
import { create2dRenderer } from '../render/fallback2d';
import { documentOutputSize, sourceCropToDisplayDraft } from '../render/geometry';
import { CropOverlay } from './CropOverlay';

const PREVIEW_MAX_DIM = 4096;

/** In crop mode the base render ignores crop+straighten so the user sees the full image. */
function renderDoc(doc: Document, cropping: boolean): Document {
  return cropping ? { ...doc, crop: undefined, straighten: 0 } : doc;
}

export function Viewport() {
  const doc = useEditor((s) => s.doc);
  const tool = useEditor((s) => s.tool);
  const comparing = useEditor((s) => s.comparing);
  const cropDraft = useEditor((s) => s.cropDraft);
  const view = useEditor((s) => s.view);
  const setView = useEditor((s) => s.setView);
  const setContainer = useEditor((s) => s.setContainer);
  const zoomFit = useEditor((s) => s.zoomFit);

  const containerRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [backend, setBackend] = useState<'gl' | '2d' | null>(null);
  const fitKeyRef = useRef('');
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const cropping = tool === 'crop' && !!doc;
  const rdoc = useMemo(
    () => (doc ? renderDoc(doc, cropping) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, cropping],
  );
  const out = useMemo(
    () => (rdoc ? documentOutputSize(rdoc) : { w: 0, h: 0 }),
    [rdoc],
  );

  // Renderer lifecycle: GL on its own canvas; 2D fallback gets a separate
  // canvas because a canvas can't switch context modes once WebGL is attached.
  useEffect(() => {
    if (rendererRef.current) return;
    const glCanvas = glCanvasRef.current;
    const c2d = canvas2dRef.current;
    if (!glCanvas || !c2d) return;
    const gl = createGlRenderer(glCanvas);
    if (gl) {
      rendererRef.current = gl;
      setBackend('gl');
    } else {
      glCanvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
      rendererRef.current = create2dRenderer(c2d);
      setBackend('2d');
    }
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  const [renderError, setRenderError] = useState('');

  // Render on doc/tool/compare changes
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !rdoc) return;
    try {
      r.render(rdoc, { before: comparing, maxDim: PREVIEW_MAX_DIM });
      setRenderError('');
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : String(err));
      console.error('render failed', err);
    }
    setView({ baseW: out.w, baseH: out.h });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rdoc, comparing]);

  // Fit view when the document or output size changes
  useEffect(() => {
    if (!doc) { fitKeyRef.current = ''; return; }
    const key = `${doc.source.width}x${doc.source.height}:${out.w}x${out.h}`;
    if (key !== fitKeyRef.current) {
      fitKeyRef.current = key;
      // wait a frame so container size is known
      requestAnimationFrame(() => zoomFit());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, out.w, out.h]);

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainer(el.clientWidth, el.clientHeight);
    });
    ro.observe(el);
    setContainer(el.clientWidth, el.clientHeight);
    return () => ro.disconnect();
  }, [setContainer]);

  // Initialize crop draft when entering crop mode (and re-init after undo)
  useEffect(() => {
    if (tool !== 'crop' || !doc || cropDraft) return;
    const d = renderDoc(doc, true);
    const size = documentOutputSize(d);
    const rect = doc.crop
      ? sourceCropToDisplayDraft(
          doc.source.width, doc.source.height, doc.transform, size.w, size.h, doc.crop,
        )
      : { cx: size.w / 2, cy: size.h / 2, w: size.w, h: size.h, angle: 0 };
    useEditor.getState().setCropDraft(rect);
  }, [tool, doc, cropDraft]);

  const toImg = (clientX: number, clientY: number) => {
    const el = containerRef.current!;
    const r = el.getBoundingClientRect();
    return {
      x: (clientX - r.left - view.tx) / view.scale,
      y: (clientY - r.top - view.ty) / view.scale,
    };
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const el = containerRef.current!;
    const r = el.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const imgX = (sx - view.tx) / view.scale;
    const imgY = (sy - view.ty) / view.scale;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const ns = Math.min(16, Math.max(0.02, view.scale * factor));
    setView({ scale: ns, tx: sx - imgX * ns, ty: sy - imgY * ns });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (cropping) return; // CropOverlay handles its own pointer events
    panRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const pan = panRef.current;
    if (!pan) return;
    setView({ tx: pan.tx + (e.clientX - pan.x), ty: pan.ty + (e.clientY - pan.y) });
  };
  const onPointerUp = () => { panRef.current = null; };

  if (!doc || !rdoc) return null;

  return (
    <div
      ref={containerRef}
      className="viewport"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="viewport-canvas-wrap" style={{
        transform: `translate(${view.tx}px, ${view.ty}px)`,
        width: out.w * view.scale,
        height: out.h * view.scale,
      }}>
        <canvas
          ref={glCanvasRef}
          className="viewport-canvas"
          style={{ width: '100%', height: '100%', display: backend === 'gl' ? 'block' : 'none' }}
        />
        <canvas
          ref={canvas2dRef}
          className="viewport-canvas"
          style={{ width: '100%', height: '100%', display: backend === '2d' ? 'block' : 'none' }}
        />
        {comparing && <div className="compare-badge compare-before">Before</div>}
        {comparing && <div className="compare-badge compare-after">After</div>}
      </div>
      {cropping && cropDraft && doc && (
        <CropOverlay
          draft={cropDraft}
          out={out}
          view={view}
          toImg={toImg}
        />
      )}
      {renderError && <div className="viewport-hint" style={{ color: 'var(--error)', bottom: 30 }}>{renderError}</div>}
      {!cropping && (
        <div className="viewport-hint">
          Scroll to zoom · Drag to pan · Hold \ for before/after
        </div>
      )}
    </div>
  );
}


