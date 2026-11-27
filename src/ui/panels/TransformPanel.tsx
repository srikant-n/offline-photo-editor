import type { CSSProperties } from 'react';
import { useEditor } from '../../state/documentStore';

/** Icon button with a Material Symbols icon and text label. */
function ToolButton({ icon, label, onClick, active, disabled, iconStyle }: {
  icon: string; label: string; onClick?: () => void; active?: boolean; disabled?: boolean;
  iconStyle?: CSSProperties;
}) {
  return (
    <button
      className={`tool-btn${active ? ' active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      type="button"
    >
      <span className="material-symbols-outlined" style={iconStyle}>{icon}</span>
      <span className="tool-btn-label">{label}</span>
    </button>
  );
}

/** Rotate / flip / straighten / canvas-size panel. */
export function TransformPanel() {
  const doc = useEditor((s) => s.doc);
  const rotate90 = useEditor((s) => s.rotate90);
  const flip = useEditor((s) => s.flip);
  const setStraighten = useEditor((s) => s.setStraighten);
  const beginGesture = useEditor((s) => s.beginGesture);
  const endGesture = useEditor((s) => s.endGesture);
  const setCanvasSize = useEditor((s) => s.setCanvasSize);
  const resetCanvasAuto = useEditor((s) => s.resetCanvasAuto);

  if (!doc) return null;
  const t = doc.transform;

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">
          <span className="material-symbols-outlined panel-icon">transform</span>
          Transform
        </span>
      </div>

      <div className="panel-section">
        <div className="panel-section-title">Rotate &amp; Flip</div>
        <div className="btn-row">
          <ToolButton icon="rotate_90_degrees_ccw" label="Rotate left" onClick={() => rotate90(-1)} />
          <ToolButton icon="rotate_90_degrees_cw" label="Rotate right" onClick={() => rotate90(1)} />
          <ToolButton
            icon="flip"
            label="Flip horizontal"
            active={t.flipH}
            onClick={() => flip('h')}
          />
          <ToolButton
            icon="flip"
            label="Flip vertical"
            active={t.flipV}
            iconStyle={{ transform: 'rotate(90deg)' }}
            onClick={() => flip('v')}
          />
        </div>
      </div>

      <div className="panel-section">
        <div className="slider-row">
          <div className="slider-labels">
            <span className="slider-name">Straighten</span>
            <span className="slider-value">{doc.straighten.toFixed(1)}°</span>
          </div>
          <input
            type="range"
            className="slider"
            min={-45}
            max={45}
            step={0.1}
            value={doc.straighten}
            onPointerDown={beginGesture}
            onChange={(e) => setStraighten(Number(e.target.value), true)}
            onPointerUp={endGesture}
            onKeyUp={endGesture}
          />
        </div>
      </div>

      <CanvasSizeSection
        w={doc.canvas.width}
        h={doc.canvas.height}
        bg={doc.canvas.background}
        auto={doc.canvasAuto}
        onApply={setCanvasSize}
        onAuto={resetCanvasAuto}
      />
    </div>
  );
}

/** Canvas-size editor: fixed W/H/background inputs plus an auto-size reset. */
function CanvasSizeSection({ w, h, bg, auto, onApply, onAuto }: {
  w: number; h: number; bg: string; auto: boolean;
  onApply: (w: number, h: number, bg: string) => void;
  onAuto: () => void;
}) {
  return (
    <div className="panel-section">
      <div className="panel-section-title">Canvas Size</div>
      <div className="field-row">
        <label className="field">
          <span>W</span>
          <input
            type="number"
            defaultValue={w}
            key={`w-${w}`}
            min={1}
            onBlur={(e) => {
              const nw = Math.max(1, Math.round(Number(e.target.value) || w));
              if (nw !== w) onApply(nw, h, bg);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </label>
        <label className="field">
          <span>H</span>
          <input
            type="number"
            defaultValue={h}
            key={`h-${h}`}
            min={1}
            onBlur={(e) => {
              const nh = Math.max(1, Math.round(Number(e.target.value) || h));
              if (nh !== h) onApply(w, nh, bg);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </label>
        <label className="field field-color">
          <span>BG</span>
          <input
            type="color"
            value={bg}
            onChange={(e) => onApply(w, h, e.target.value)}
          />
        </label>
      </div>
      <div className="field-row">
        <button className="btn-ghost btn-xs" onClick={onAuto} disabled={auto}>
          Auto-size to image
        </button>
        <span className="hint">{auto ? 'Canvas auto-fits the image' : 'Custom size'}</span>
      </div>
    </div>
  );
}
