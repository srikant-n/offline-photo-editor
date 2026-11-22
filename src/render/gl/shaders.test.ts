import { describe, it, expect } from 'vitest';
import { VERT_SRC, TONE_FRAG_SRC, BLUR_FRAG_SRC, SHARPEN_FRAG_SRC } from './shaders';

const SOURCES = { VERT_SRC, TONE_FRAG_SRC, BLUR_FRAG_SRC, SHARPEN_FRAG_SRC };

describe('shader sources', () => {
  it.each(Object.entries(SOURCES))('%s is a GLSL ES 3.00 shader with a main()', (_name, src) => {
    expect(src).toContain('#version 300 es');
    expect(src).toContain('void main()');
    // Balanced braces is a cheap sanity check for truncated sources.
    const open = (src.match(/{/g) ?? []).length;
    const close = (src.match(/}/g) ?? []).length;
    expect(open).toBe(close);
    expect(open).toBeGreaterThan(0);
  });

  it('vertex shader outputs position and uv', () => {
    expect(VERT_SRC).toContain('aPos');
    expect(VERT_SRC).toContain('vUv');
    expect(VERT_SRC).toContain('gl_Position');
  });

  it('tone shader declares every adjustment uniform', () => {
    for (const u of [
      'uTex', 'uTexSize', 'uExposure', 'uBrightness', 'uContrast',
      'uHighlights', 'uShadows', 'uWhites', 'uBlacks',
      'uTemperature', 'uVibrance', 'uSaturation', 'uBefore',
    ]) {
      expect(TONE_FRAG_SRC).toContain(u);
    }
  });

  it('tone shader skips adjustments when uBefore is set', () => {
    expect(TONE_FRAG_SRC).toContain('uBefore > 0.5');
  });

  it('blur shader takes a direction and radius', () => {
    expect(BLUR_FRAG_SRC).toContain('uniform vec2 uDir');
    expect(BLUR_FRAG_SRC).toContain('uniform float uRadius');
    expect(BLUR_FRAG_SRC).toContain('uTexSize');
  });

  it('sharpen shader combines sharp and blurred inputs', () => {
    expect(SHARPEN_FRAG_SRC).toContain('uniform sampler2D uSharp');
    expect(SHARPEN_FRAG_SRC).toContain('uniform sampler2D uBlur');
    expect(SHARPEN_FRAG_SRC).toContain('uniform float uAmount');
  });
});
