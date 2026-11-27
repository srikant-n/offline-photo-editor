import { useState } from 'react';
import { useEditor } from '../../state/documentStore';
import { PRESETS } from '../../presets';

/** One-click tone presets with an intensity slider (0–100%). */
export function PresetsPanel() {
  const doc = useEditor((s) => s.doc);
  const applyPreset = useEditor((s) => s.applyPreset);
  const resetAdjustments = useEditor((s) => s.resetAdjustments);
  const beginGesture = useEditor((s) => s.beginGesture);
  const endGesture = useEditor((s) => s.endGesture);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [intensity, setIntensity] = useState(100);

  if (!doc) return null;

  /** Selects a preset at full intensity as a single history entry. */
  const pick = (id: string) => {
    setPresetId(id);
    setIntensity(100);
    applyPreset(id, 1);
  };

  /** Re-applies the selected preset at a new intensity within the active gesture. */
  const slide = (v: number) => {
    setIntensity(v);
    if (presetId) applyPreset(presetId, v / 100, true);
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">
          <span className="material-symbols-outlined panel-icon">auto_awesome</span>
          Presets
        </span>
        <button className="btn-ghost btn-xs" onClick={resetAdjustments} title="Reset all adjustments">
          Reset
        </button>
      </div>

      <div className="preset-grid">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={`preset-btn preset-rich${presetId === p.id ? ' active' : ''}`}
            onClick={() => pick(p.id)}
            title={p.name}
            type="button"
          >
            <span
              className="preset-swatch"
              style={{ background: `linear-gradient(135deg, ${p.swatch[0]}, ${p.swatch[1]})` }}
            />
            <span className="preset-name">{p.name}</span>
          </button>
        ))}
      </div>

      <div className="panel-section" style={{ marginTop: 10 }}>
        <div className="slider-labels">
          <span className="slider-name">Intensity</span>
          <span className="slider-value">{intensity}%</span>
        </div>
        <input
          type="range" className="slider" min={0} max={100} step={1}
          value={intensity} disabled={!presetId}
          onPointerDown={beginGesture}
          onChange={(e) => slide(Number(e.target.value))}
          onPointerUp={endGesture}
          onKeyUp={endGesture}
        />
      </div>

      <p className="hint">Presets adjust the base image tone only. Drag intensity to blend.</p>
    </div>
  );
}
