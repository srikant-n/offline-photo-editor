import { describe, it, expect } from 'vitest';
import { PRESETS, getPreset, lerpAdjustments } from './presets';
import { defaultAdjustments } from './state/adjustments';
import type { AdjustmentState } from './types';

describe('PRESETS', () => {
  it('has unique ids and covers the documented looks', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['vintage', 'bw', 'cinematic', 'warm', 'cool', 'fade', 'vivid']) {
      expect(ids).toContain(id);
    }
  });

  it('every preset has display metadata and valid adjustment keys', () => {
    const validKeys = new Set(Object.keys(defaultAdjustments()));
    for (const p of PRESETS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.icon.length).toBeGreaterThan(0);
      expect(p.swatch).toHaveLength(2);
      for (const c of p.swatch) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      for (const k of Object.keys(p.adjustments)) {
        expect(validKeys.has(k as keyof AdjustmentState)).toBe(true);
      }
    }
  });

  it('getPreset finds by id', () => {
    expect(getPreset('bw')?.name).toBe('B&W');
    expect(getPreset('vivid')?.adjustments.saturation).toBe(35);
    expect(getPreset('nope')).toBeUndefined();
    expect(getPreset('')).toBeUndefined();
  });
});

describe('lerpAdjustments', () => {
  const bw = getPreset('bw')!.adjustments;

  it('intensity 0 returns defaults for preset keys', () => {
    const out = lerpAdjustments(defaultAdjustments(), bw, 0);
    expect(out.saturation).toBe(0);
    expect(out.vibrance).toBe(0);
    expect(out.contrast).toBe(0);
    expect(out.brightness).toBe(0);
  });

  it('intensity 1 returns preset values', () => {
    const out = lerpAdjustments(defaultAdjustments(), bw, 1);
    expect(out.saturation).toBe(-100);
    expect(out.vibrance).toBe(-100);
    expect(out.contrast).toBe(10);
    expect(out.brightness).toBe(5);
  });

  it('intensity 0.5 lerps halfway from default', () => {
    const out = lerpAdjustments(defaultAdjustments(), bw, 0.5);
    expect(out.saturation).toBe(-50);
    expect(out.contrast).toBe(5);
  });

  it('clamps intensity to [0,1]', () => {
    expect(lerpAdjustments(defaultAdjustments(), bw, 2).saturation).toBe(-100);
    expect(lerpAdjustments(defaultAdjustments(), bw, -1).saturation).toBe(0);
  });

  it('keys absent from the preset keep the base value', () => {
    const base: AdjustmentState = { ...defaultAdjustments(), temperature: 42 };
    const out = lerpAdjustments(base, bw, 1);
    expect(out.temperature).toBe(42);
    expect(out.exposure).toBe(0);
  });

  it('an empty partial returns an equal copy, not the same object', () => {
    const base = defaultAdjustments();
    const out = lerpAdjustments(base, {}, 1);
    expect(out).toEqual(base);
    expect(out).not.toBe(base);
  });

  it('does not mutate the base adjustments', () => {
    const base = defaultAdjustments();
    lerpAdjustments(base, bw, 1);
    expect(base.saturation).toBe(0);
  });
});
