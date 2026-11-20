import { useEditor } from '../../state/documentStore';
import { ADJUSTMENTS, ADJUSTMENT_GROUPS } from '../../state/adjustments';
import { Slider } from './Slider';

/** Tone & color adjustment panel. */
export function TonePanel() {
  const doc = useEditor((s) => s.doc);
  const setAdjustment = useEditor((s) => s.setAdjustment);
  const beginGesture = useEditor((s) => s.beginGesture);
  const endGesture = useEditor((s) => s.endGesture);
  const resetAdjustments = useEditor((s) => s.resetAdjustments);

  if (!doc) return null;

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">
          <span className="material-symbols-outlined panel-icon">tune</span>
          Tone &amp; Color
        </span>
        <button className="btn-ghost btn-xs" onClick={resetAdjustments} title="Reset all adjustments">
          Reset
        </button>
      </div>
      {ADJUSTMENT_GROUPS.map((g) => (
        <div key={g.id} className="panel-section">
          <div className="panel-section-title">{g.label}</div>
          {ADJUSTMENTS.filter((d) => d.group === g.id).map((d) => (
            <Slider
              key={d.key}
              def={d}
              value={doc.adjustments[d.key]}
              onChange={(v, transient) => setAdjustment(d.key, v, transient)}
              onGestureStart={beginGesture}
              onGestureEnd={endGesture}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
