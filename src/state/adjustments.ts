import type { AdjustmentState } from '../types';

export interface AdjustmentDef {
  key: keyof AdjustmentState;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
  /** Suffix shown in the value readout, e.g. " EV". */
  unit?: string;
  /** decimals shown in readout */
  digits?: number;
  group: 'light' | 'color' | 'detail';
}

export const ADJUSTMENT_GROUPS: { id: AdjustmentDef['group']; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'color', label: 'Color' },
  { id: 'detail', label: 'Detail' },
];

export const ADJUSTMENTS: AdjustmentDef[] = [
  { key: 'exposure', label: 'Exposure', min: -3, max: 3, step: 0.05, def: 0, unit: ' EV', digits: 2, group: 'light' },
  { key: 'brightness', label: 'Brightness', min: -100, max: 100, step: 1, def: 0, group: 'light' },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, def: 0, group: 'light' },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1, def: 0, group: 'light' },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1, def: 0, group: 'light' },
  { key: 'whites', label: 'Whites', min: -100, max: 100, step: 1, def: 0, group: 'light' },
  { key: 'blacks', label: 'Blacks', min: -100, max: 100, step: 1, def: 0, group: 'light' },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100, step: 1, def: 0, group: 'color' },
  { key: 'vibrance', label: 'Vibrance', min: -100, max: 100, step: 1, def: 0, group: 'color' },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1, def: 0, group: 'color' },
  { key: 'sharpness', label: 'Sharpness', min: 0, max: 100, step: 1, def: 0, group: 'detail' },
];

export function defaultAdjustments(): AdjustmentState {
  const a = {} as AdjustmentState;
  for (const d of ADJUSTMENTS) a[d.key] = d.def;
  return a;
}

export function formatValue(d: AdjustmentDef, v: number): string {
  const n = v.toFixed(d.digits ?? 0);
  const sign = v > 0 ? '+' : '';
  return `${sign}${n}${d.unit ?? ''}`;
}
