import { useEditor } from '../../state/documentStore';

/** Brush settings: size, hardness, opacity, color, eraser. */
export function BrushPanel() {
  const brush = useEditor((s) => s.brush);
  const setBrush = useEditor((s) => s.setBrush);
  const currentColor = useEditor((s) => s.currentColor);
  const setCurrentColor = useEditor((s) => s.setCurrentColor);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">
          <span className="material-symbols-outlined panel-icon">brush</span>
          Brush
        </span>
        <button
          className={`btn-ghost btn-xs${brush.eraser ? ' active' : ''}`}
          title="Eraser — paints transparency on the target layer"
          onClick={() => setBrush({ eraser: !brush.eraser })}
          type="button"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>ink_eraser</span> Erase
        </button>
      </div>

      <div className="field-row" style={{ marginBottom: 8 }}>
        <span className="field field-color"><span>Color</span>
          <input type="color" value={brush.eraser ? '#000000' : currentColor} disabled={brush.eraser}
            onChange={(e) => setCurrentColor(e.target.value)} />
        </span>
        <span className="field"><span>Size {brush.size}px</span>
          <input type="range" className="slider" min={2} max={300} step={1}
            value={brush.size} onChange={(e) => setBrush({ size: Number(e.target.value) })} />
        </span>
      </div>

      <div className="field-row" style={{ marginBottom: 8 }}>
        <span className="field"><span>Hardness {Math.round(brush.hardness * 100)}%</span>
          <input type="range" className="slider" min={0} max={100} step={1}
            value={Math.round(brush.hardness * 100)}
            onChange={(e) => setBrush({ hardness: Number(e.target.value) / 100 })} />
        </span>
        <span className="field"><span>Opacity {Math.round(brush.opacity * 100)}%</span>
          <input type="range" className="slider" min={1} max={100} step={1}
            value={Math.round(brush.opacity * 100)}
            onChange={(e) => setBrush({ opacity: Number(e.target.value) / 100 })} />
        </span>
      </div>

      <p className="hint">
        Drag on the canvas to paint. Strokes create a raster layer, or paint onto
        the selected raster layer. Each stroke is one undo step.
      </p>
    </div>
  );
}
