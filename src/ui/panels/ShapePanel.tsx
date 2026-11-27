import { useEditor } from '../../state/documentStore';
import type { ShapeProps } from '../../types';

/** Shape kinds selectable in the panel, with icon and label. */
const KINDS: { id: ShapeProps['kind']; label: string; icon: string }[] = [
  { id: 'rect', label: 'Rect', icon: 'rectangle' },
  { id: 'ellipse', label: 'Ellipse', icon: 'circle' },
  { id: 'line', label: 'Line', icon: 'pen_size_2' },
  { id: 'arrow', label: 'Arrow', icon: 'arrow_forward' },
];

/** Shape tool settings: kind, color, stroke width, optional fill. */
export function ShapePanel() {
  const shape = useEditor((s) => s.shape);
  const setShape = useEditor((s) => s.setShape);
  const currentColor = useEditor((s) => s.currentColor);
  const setCurrentColor = useEditor((s) => s.setCurrentColor);

  const isLine = shape.kind === 'line' || shape.kind === 'arrow';

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">
          <span className="material-symbols-outlined panel-icon">category</span>
          Shape
        </span>
      </div>

      <div className="btn-row" style={{ marginBottom: 8 }}>
        {KINDS.map((k) => (
          <button
            key={k.id}
            className={`tool-btn${shape.kind === k.id ? ' active' : ''}`}
            style={{ minWidth: 52, flex: 1 }}
            onClick={() => setShape({ kind: k.id })}
            title={k.label}
            type="button"
          >
            <span className="material-symbols-outlined">{k.icon}</span>
            <span className="tool-btn-label">{k.label}</span>
          </button>
        ))}
      </div>

      <div className="field-row" style={{ marginBottom: 8 }}>
        <span className="field"><span>Stroke</span>
          <input type="color" value={currentColor}
            onChange={(e) => setCurrentColor(e.target.value)} />
        </span>
        <span className="field"><span>Width {shape.strokeWidth}px</span>
          <input type="range" className="slider" min={1} max={60} step={1}
            value={shape.strokeWidth}
            onChange={(e) => setShape({ strokeWidth: Number(e.target.value) })} />
        </span>
      </div>

      {!isLine && (
        <div className="field-row" style={{ marginBottom: 4 }}>
          <span className="field"><span>Fill</span>
            <input type="checkbox" checked={!!shape.fill}
              onChange={(e) => setShape({ fill: e.target.checked ? currentColor : undefined })} />
          </span>
          {shape.fill && (
            <span className="field"><span>Fill color</span>
              <input type="color" value={shape.fill}
                onChange={(e) => setShape({ fill: e.target.value })} />
            </span>
          )}
        </div>
      )}

      <p className="hint">Drag on the canvas to draw. Each shape becomes its own layer.</p>
    </div>
  );
}
