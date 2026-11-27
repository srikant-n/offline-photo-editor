import { useRef } from 'react';
import type { AdjustmentDef } from '../../state/adjustments';
import { formatValue } from '../../state/adjustments';

/** Props for {@link Slider}: the adjustment definition, current value, and gesture callbacks. */
interface Props {
  def: AdjustmentDef;
  value: number;
  onChange: (v: number, transient: boolean) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
}

/** Labeled slider with a scrubbable numeric readout. */
export function Slider({ def, value, onChange, onGestureStart, onGestureEnd }: Props) {
  const scrub = useRef<{ x: number; v: number } | null>(null);

  /** Snaps a raw value to the def's step and clamps it to [min, max]. */
  const clampStep = (v: number) => {
    const stepped = Math.round(v / def.step) * def.step;
    return Math.min(def.max, Math.max(def.min, Number(stepped.toFixed(4))));
  };

  return (
    <div className="slider-row">
      <div className="slider-labels">
        <span
          className="slider-name"
          title="Double-click to reset"
          onDoubleClick={() => onChange(def.def, false)}
        >
          {def.label}
        </span>
        <span
          className="slider-value"
          title="Drag to scrub"
          onPointerDown={(e) => {
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            scrub.current = { x: e.clientX, v: value };
            onGestureStart();
          }}
          onPointerMove={(e) => {
            if (!scrub.current) return;
            const range = def.max - def.min;
            const dv = ((e.clientX - scrub.current.x) / 200) * range;
            onChange(clampStep(scrub.current.v + dv), true);
          }}
          onPointerUp={() => {
            scrub.current = null;
            onGestureEnd();
          }}
        >
          {formatValue(def, value)}
        </span>
      </div>
      <input
        type="range"
        className="slider"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onPointerDown={onGestureStart}
        onChange={(e) => onChange(Number(e.target.value), true)}
        onPointerUp={onGestureEnd}
        onKeyUp={onGestureEnd}
      />
    </div>
  );
}
