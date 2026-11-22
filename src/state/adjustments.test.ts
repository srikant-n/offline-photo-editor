import { describe, it, expect } from 'vitest';
import {
  ADJUSTMENTS, ADJUSTMENT_GROUPS, defaultAdjustments, formatValue,
} from './adjustments';
import type { AdjustmentState } from '../types';

const byKey = (key: keyof AdjustmentState) =>
  ADJUSTMENTS.find((d) => d.key === key)!;

describe('ADJUSTMENTS', () => {
  it('covers every AdjustmentState key exactly once', () => {
    const keys = ADJUSTMENTS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    const expected: (keyof AdjustmentState)[] = [
      'exposure', 'brightness', 'contrast', 'highlights', 'shadows',
      'whites', 'blacks', 'temperature', 'vibrance', 'saturation', 'sharpness',
    ];
    expect([...keys].sort()).toEqual([...expected].sort());
  });

  it('has sane ranges and steps for every slider', () => {
    for (const d of ADJUSTMENTS) {
      expect(d.min).toBeLessThan(d.max);
      expect(d.step).toBeGreaterThan(0);
      expect(d.def).toBeGreaterThanOrEqual(d.min);
      expect(d.def).toBeLessThanOrEqual(d.max);
      expect(ADJUSTMENT_GROUPS.some((g) => g.id === d.group)).toBe(true);
    }
  });

  it('exposure uses EV units with 2 decimals', () => {
    const d = byKey('exposure');
    expect(d.unit).toBe(' EV');
    expect(d.digits).toBe(2);
    expect(d.min).toBe(-3);
    expect(d.max).toBe(3);
  });

  it('sharpness is 0..100 like the other detail/color sliders', () => {
    const d = byKey('sharpness');
    expect(d.min).toBe(0);
    expect(d.max).toBe(100);
  });
});

describe('defaultAdjustments', () => {
  it('returns every key at its default value', () => {
    const a = defaultAdjustments();
    expect(Object.keys(a).sort()).toEqual(ADJUSTMENTS.map((d) => d.key).sort());
    for (const d of ADJUSTMENTS) expect(a[d.key]).toBe(d.def);
  });

  it('returns a fresh object each call', () => {
    const a = defaultAdjustments();
    const b = defaultAdjustments();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('formatValue', () => {
  it('adds a + sign for positive values', () => {
    expect(formatValue(byKey('brightness'), 25)).toBe('+25');
  });

  it('keeps the minus sign for negative values', () => {
    expect(formatValue(byKey('brightness'), -25)).toBe('-25');
  });

  it('formats zero without a sign', () => {
    expect(formatValue(byKey('brightness'), 0)).toBe('0');
  });

  it('appends the unit and honors digits', () => {
    expect(formatValue(byKey('exposure'), 0.5)).toBe('+0.50 EV');
    expect(formatValue(byKey('exposure'), -1.25)).toBe('-1.25 EV');
    expect(formatValue(byKey('exposure'), 0)).toBe('0.00 EV');
  });
});
