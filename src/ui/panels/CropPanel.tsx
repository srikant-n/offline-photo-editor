import { useEditor } from '../../state/documentStore';
import { documentOutputSize } from '../../render/geometry';
import type { Document } from '../../types';
import type { CropDraft } from '../../state/documentStore';

/** A named crop aspect-ratio preset; ratio null means free-form. */
interface RatioPreset {
  label: string;
  /** width/height; null = free */
  ratio: number | null;
}

/** Aspect-ratio presets offered in the crop panel. */
const PRESETS: RatioPreset[] = [
  { label: 'Free', ratio: null },
  { label: '1:1', ratio: 1 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '3:2', ratio: 3 / 2 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '9:16', ratio: 9 / 16 },
  { label: 'IG Post', ratio: 1 },
  { label: 'IG Portrait', ratio: 4 / 5 },
  { label: 'Story', ratio: 9 / 16 },
];

/** Crop-mode display dims (full un-cropped image). */
function cropViewSize(doc: Document): { w: number; h: number } {
  return documentOutputSize({ ...doc, crop: undefined, straighten: 0 });
}

/** Resize the draft to `ratio` about its center, clamped to the view. */
function draftWithRatio(d: CropDraft, ratio: number, out: { w: number; h: number }): CropDraft {
  // max w/h fitting ratio inside out bounds, anchored at center
  let w = Math.min(out.w, out.h * ratio);
  let h = w / ratio;
  if (h > out.h) { h = out.h; w = h * ratio; }
  // shrink if the rect's rotated bbox would exceed — approximate with axis clamp
  const hw = w / 2, hh = h / 2;
  const rad = (Math.abs(d.angle) * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const ex = hw * cos + hh * sin;
  const ey = hw * sin + hh * cos;
  const maxEx = Math.min(d.cx, out.w - d.cx);
  const maxEy = Math.min(d.cy, out.h - d.cy);
  const k = Math.min(1, maxEx / Math.max(ex, 1e-6), maxEy / Math.max(ey, 1e-6));
  return { ...d, w: w * k, h: h * k };
}

/** Crop aspect presets + angle + apply/cancel. */
export function CropPanel() {
  const doc = useEditor((s) => s.doc);
  const cropDraft = useEditor((s) => s.cropDraft);
  const cropAspect = useEditor((s) => s.cropAspect);
  const setCropDraft = useEditor((s) => s.setCropDraft);
  const setCropAspect = useEditor((s) => s.setCropAspect);
  const applyCrop = useEditor((s) => s.applyCrop);
  const cancelCrop = useEditor((s) => s.cancelCrop);

  if (!doc) return null;

  const angle = cropDraft?.angle ?? 0;

  /** Sets the locked aspect ratio and resizes the draft to match. */
  const pickRatio = (ratio: number | null) => {
    setCropAspect(ratio);
    if (ratio != null && cropDraft) {
      setCropDraft(draftWithRatio(cropDraft, ratio, cropViewSize(doc)));
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">
          <span className="material-symbols-outlined panel-icon">crop</span>
          Crop &amp; Straighten
        </span>
      </div>

      <div className="panel-section">
        <div className="panel-section-title">Aspect Ratio</div>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className={`preset-btn${cropAspect === p.ratio ? ' active' : ''}`}
              onClick={() => pickRatio(p.ratio)}
              type="button"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="hint">Rotate the marquee with the handle above it, or the slider below.</div>
      </div>

      <div className="panel-section">
        <div className="slider-row">
          <div className="slider-labels">
            <span className="slider-name">Angle</span>
            <span className="slider-value">{angle.toFixed(1)}°</span>
          </div>
          <input
            type="range"
            className="slider"
            min={-45}
            max={45}
            step={0.1}
            value={angle}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (cropDraft) setCropDraft({ ...cropDraft, angle: v });
            }}
          />
        </div>
      </div>

      <div className="panel-section btn-row">
        <button className="btn-primary" onClick={applyCrop} type="button">Apply</button>
        <button className="btn-ghost" onClick={cancelCrop} type="button">Cancel</button>
      </div>
    </div>
  );
}
