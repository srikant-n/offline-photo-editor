import { useRef, useState } from 'react';
import { useEditor } from '../../state/documentStore';
import { samplePixel } from '../../render/layers/eyedropper';
import { layerContains } from '../../render/composite';
import type { ToolMode } from '../../types';

interface Props {
  out: { w: number; h: number };
  /** The visible composite canvas, used for eyedropper sampling. */
  compCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}

/** Tool modes that receive pointer interaction on the overlay. */
const INTERACTIVE: ToolMode[] = ['select', 'brush', 'shape', 'text', 'eyedropper'];

/** In-progress shape drag bounds in output-image px. */
interface ShapeDraft { x0: number; y0: number; x1: number; y1: number }

/** Arrowhead length multiplier relative to stroke width. */
const ARROW_HEAD = 4; // × strokeWidth
/** Half-angle of each arrowhead wing, in radians. */
const HEAD_ANGLE = Math.PI / 6;

/**
 * Transparent interaction layer over the composite canvas (SVG so previews
 * stay resolution-independent). Handles brush strokes, shape drags with
 * live preview, text placement, eyedropper sampling, and select-tool layer
 * moving. All geometry is in output-image px inside the transformed wrap.
 */
export function BrushCanvas({ out, compCanvasRef }: Props) {
  const tool = useEditor((s) => s.tool);
  const doc = useEditor((s) => s.doc);
  const selectedLayerId = useEditor((s) => s.selectedLayerId);
  const shape = useEditor((s) => s.shape);
  const currentColor = useEditor((s) => s.currentColor);
  const effShape = { ...shape, color: currentColor };

  const svgRef = useRef<SVGSVGElement>(null);
  /** Active drag state: brush stroke, shape drag, or layer move. */
  const dragRef = useRef<{
    kind: 'brush' | 'shape' | 'move';
    layerId?: string;
    startX: number; startY: number;
    layerStartX: number; layerStartY: number;
  } | null>(null);
  const [shapeDraft, setShapeDraft] = useState<ShapeDraft | null>(null);

  const interactive = INTERACTIVE.includes(tool);

  /** Converts client (screen) coords to output-image px via the SVG bounding rect. */
  const toImg = (e: React.PointerEvent | PointerEvent) => {
    const el = svgRef.current!;
    const r = el.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * out.w,
      y: ((e.clientY - r.top) / r.height) * out.h,
    };
  };

  /** Routes pointer-down to the active tool: brush, shape, text, eyedropper, or layer select/move. */
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !interactive) return;
    const st = useEditor.getState();
    const p = toImg(e);

    switch (tool) {
      case 'brush': {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        st.beginBrushStroke();
        st.brushStrokeTo(p.x, p.y);
        dragRef.current = { kind: 'brush', startX: p.x, startY: p.y, layerStartX: 0, layerStartY: 0 };
        break;
      }
      case 'shape': {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setShapeDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        dragRef.current = { kind: 'shape', startX: p.x, startY: p.y, layerStartX: 0, layerStartY: 0 };
        break;
      }
      case 'text': {
        e.stopPropagation();
        st.addTextLayer(p.x, p.y);
        break;
      }
      case 'eyedropper': {
        e.stopPropagation();
        const comp = compCanvasRef.current;
        if (comp) {
          const hex = samplePixel(comp, p.x, p.y, out.w, out.h);
          if (hex) st.setCurrentColor(hex);
        }
        break;
      }
      case 'select': {
        // Topmost visible non-image layer under the cursor.
        let hit: { id: string; x: number; y: number } | null = null;
        if (doc) {
          for (let i = doc.layers.length - 1; i >= 1; i--) {
            const l = doc.layers[i];
            if (l.visible && layerContains(l, p.x, p.y)) {
              hit = { id: l.id, x: l.x, y: l.y };
              break;
            }
          }
        }
        if (hit) {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          if (hit.id !== selectedLayerId) st.selectLayer(hit.id);
          st.beginGesture();
          dragRef.current = {
            kind: 'move', layerId: hit.id,
            startX: p.x, startY: p.y,
            layerStartX: hit.x, layerStartY: hit.y,
          };
        }
        // Otherwise let the event bubble → viewport pan.
        break;
      }
    }
  };

  /** Continues the active drag: stamps brush points, updates shape preview, or moves a layer. */
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toImg(e);
    const st = useEditor.getState();

    if (d.kind === 'brush') {
      st.brushStrokeTo(p.x, p.y);
    } else if (d.kind === 'shape') {
      setShapeDraft({ x0: d.startX, y0: d.startY, x1: p.x, y1: p.y });
    } else if (d.kind === 'move' && d.layerId) {
      st.updateLayer(d.layerId, {
        x: d.layerStartX + (p.x - d.startX),
        y: d.layerStartY + (p.y - d.startY),
      }, 'transient');
    }
  };

  /** Finalizes the active drag: commits the stroke, creates the shape layer, or ends the move gesture. */
  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    const st = useEditor.getState();
    const p = toImg(e);

    if (d.kind === 'brush') {
      st.commitBrushStroke();
    } else if (d.kind === 'shape') {
      setShapeDraft(null);
      if (Math.hypot(p.x - d.startX, p.y - d.startY) > 3) {
        st.addShapeLayer(d.startX, d.startY, p.x, p.y);
      }
    } else if (d.kind === 'move') {
      st.endGesture();
    }
  };

  const sel = doc?.layers.find((l) => l.id === selectedLayerId);
  const showSel = !!sel && sel.type !== 'image' && sel.visible;

  const common = {
    fill: effShape.fill ?? 'none',
    stroke: effShape.color,
    strokeWidth: effShape.strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  let preview: React.ReactNode = null;
  if (shapeDraft) {
    const { x0, y0, x1, y1 } = shapeDraft;
    const bx = Math.min(x0, x1), by = Math.min(y0, y1);
    const bw = Math.abs(x1 - x0), bh = Math.abs(y1 - y0);
    if (effShape.kind === 'rect' || effShape.kind === 'ellipse') {
      preview = effShape.kind === 'rect'
        ? <rect x={bx} y={by} width={bw} height={bh} {...common} />
        : <ellipse cx={bx + bw / 2} cy={by + bh / 2} rx={bw / 2} ry={bh / 2} {...common} />;
    } else {
      const headLen = Math.max(10, effShape.strokeWidth * ARROW_HEAD);
      const ang = Math.atan2(y1 - y0, x1 - x0);
      preview = (
        <g {...common} fill="none">
          <line x1={x0} y1={y0} x2={x1} y2={y1} />
          {effShape.kind === 'arrow' && (
            <>
              <line x1={x1} y1={y1} x2={x1 - headLen * Math.cos(ang - HEAD_ANGLE)} y2={y1 - headLen * Math.sin(ang - HEAD_ANGLE)} />
              <line x1={x1} y1={y1} x2={x1 - headLen * Math.cos(ang + HEAD_ANGLE)} y2={y1 - headLen * Math.sin(ang + HEAD_ANGLE)} />
            </>
          )}
        </g>
      );
    }
  }

  return (
    <svg
      ref={svgRef}
      className="brush-overlay"
      viewBox={`0 0 ${out.w} ${out.h}`}
      preserveAspectRatio="none"
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: interactive ? 'auto' : 'none',
        cursor: tool === 'eyedropper' ? 'crosshair' : tool === 'brush' ? 'crosshair' : tool === 'text' ? 'text' : undefined,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {preview}
      {showSel && sel && (
        <rect
          x={sel.x} y={sel.y} width={sel.w} height={sel.h}
          fill="none" stroke="#c0c1ff" strokeWidth={1.5}
          strokeDasharray="6 4" vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
