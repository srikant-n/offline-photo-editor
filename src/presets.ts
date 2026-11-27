import type { AdjustmentState } from './types';
import { defaultAdjustments } from './state/adjustments';

/** A named, one-click adjustment preset shown in the presets panel. */
export interface Preset {
  id: string;
  name: string;
  icon: string;
  /** Two CSS colors used for the swatch gradient. */
  swatch: [string, string];
  adjustments: Partial<AdjustmentState>;
}

/** Library of built-in adjustment presets. */
export const PRESETS: Preset[] = [
  {
    id: 'vintage', name: 'Vintage', icon: 'filter_vintage',
    swatch: ['#8a6b4a', '#d9b98c'],
    adjustments: {
      temperature: 35, contrast: -15, saturation: -20,
      brightness: 5, shadows: 10, highlights: -10,
    },
  },
  {
    id: 'bw', name: 'B&W', icon: 'contrast',
    swatch: ['#3a3a3a', '#c8c8c8'],
    adjustments: {
      saturation: -100, vibrance: -100, contrast: 10, brightness: 5,
    },
  },
  {
    id: 'cinematic', name: 'Cinematic', icon: 'movie',
    swatch: ['#1d3557', '#e07a5f'],
    adjustments: {
      temperature: -15, saturation: -25, contrast: 20,
      brightness: -5, shadows: -10, highlights: -10, sharpness: 15,
    },
  },
  {
    id: 'warm', name: 'Warm', icon: 'wb_sunny',
    swatch: ['#f4a261', '#e76f51'],
    adjustments: {
      temperature: 45, saturation: 15, brightness: 5, vibrance: 10,
    },
  },
  {
    id: 'cool', name: 'Cool', icon: 'ac_unit',
    swatch: ['#8ecae6', '#219ebc'],
    adjustments: {
      temperature: -45, saturation: 5, brightness: 3,
    },
  },
  {
    id: 'fade', name: 'Fade', icon: 'blur_on',
    swatch: ['#adb5bd', '#e9ecef'],
    adjustments: {
      contrast: -30, brightness: 15, blacks: 30, saturation: -15,
      highlights: -10,
    },
  },
  {
    id: 'vivid', name: 'Vivid', icon: 'flare',
    swatch: ['#ff006e', '#ffd60a'],
    adjustments: {
      saturation: 35, vibrance: 30, contrast: 15, sharpness: 20,
    },
  },
];

/** Look up a preset by its id. Returns undefined if not found. */
export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/**
 * Build an AdjustmentState for a preset at the given intensity (0..1).
 * Keys not present in the preset fall back to defaults; keys present are
 * lerped from the default toward the preset value.
 */
export function lerpAdjustments(
  base: AdjustmentState,
  partial: Partial<AdjustmentState>,
  intensity: number,
): AdjustmentState {
  const t = Math.max(0, Math.min(1, intensity));
  const out = { ...base };
  for (const key of Object.keys(partial) as (keyof AdjustmentState)[]) {
    const target = partial[key];
    if (target === undefined) continue;
    const def = defaultAdjustments()[key];
    out[key] = def + (target - def) * t;
  }
  return out;
}
