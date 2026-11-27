/** Fullscreen-triangle vertex shader shared by all passes. */
export const VERT_SRC = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/** Tone-adjustment fragment shader applying the full tone chain; uBefore skips adjustments. */
export const TONE_FRAG_SRC = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform vec2 uTexSize;
uniform float uExposure;    // EV, -3..3
uniform float uBrightness;  // -100..100
uniform float uContrast;    // -100..100
uniform float uHighlights;  // -100..100
uniform float uShadows;     // -100..100
uniform float uWhites;      // -100..100
uniform float uBlacks;      // -100..100
uniform float uTemperature; // -100..100 (warm +)
uniform float uVibrance;    // -100..100
uniform float uSaturation;  // -100..100
uniform float uBefore;      // 1.0 => skip adjustments

in vec2 vUv;
out vec4 fragColor;

vec3 lumaW = vec3(0.2126, 0.7152, 0.0722);

void main() {
  vec3 c = texture(uTex, vUv).rgb;

  if (uBefore > 0.5) {
    fragColor = vec4(c, 1.0);
    return;
  }

  // 1. Exposure (EV)
  c *= pow(2.0, uExposure);

  // 2. Brightness (linear offset)
  c += uBrightness * 0.005;

  // 3. Contrast around mid-gray
  c = (c - 0.5) * (1.0 + uContrast * 0.01) + 0.5;

  float l = dot(c, lumaW);
  // luminance weights: highlights strong near white, shadows strong near black
  float hw = smoothstep(0.35, 0.95, l);
  float sw = 1.0 - smoothstep(0.05, 0.60, l);

  // 4. Highlights / Shadows (luma-weighted gain)
  c *= 1.0 + (uHighlights * 0.006) * hw + (uShadows * 0.006) * sw;

  // 5. Whites / Blacks (endpoint emphasis)
  c += (uWhites * 0.004) * hw - (uBlacks * 0.004) * sw;

  c = clamp(c, 0.0, 1.0);
  l = dot(c, lumaW);

  // 6. Temperature (warm = +)
  float t = uTemperature * 0.006;
  c.r *= 1.0 + t;
  c.b *= 1.0 - t;
  c.g *= 1.0 - t * 0.15;

  // 7. Vibrance: saturation boost weighted by existing saturation
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float sat0 = mx - mn;
  float vib = 1.0 + (uVibrance * 0.01) * (1.0 - sat0) * 1.5;
  c = mix(vec3(dot(lumaW, c)), c, clamp(vib, 0.0, 2.5));

  // 8. Saturation
  float satF = clamp(1.0 + uSaturation * 0.01, 0.0, 2.0);
  c = mix(vec3(dot(lumaW, c)), c, satF);

  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

/** Separable 5-tap gaussian blur fragment shader; uDir gives the texel-space direction. */
export const BLUR_FRAG_SRC = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform vec2 uTexSize;
uniform vec2 uDir;      // texel-space direction * radius
uniform float uRadius;  // in pixels

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 px = uDir / uTexSize;
  vec4 sum = texture(uTex, vUv) * 0.227027;
  sum += texture(uTex, vUv + px * 1.3846) * 0.3162162;
  sum += texture(uTex, vUv - px * 1.3846) * 0.3162162;
  sum += texture(uTex, vUv + px * 3.2308) * 0.0702703;
  sum += texture(uTex, vUv - px * 3.2308) * 0.0702703;
  fragColor = sum;
}`;

/** Unsharp-mask composite shader sampling the toned (uSharp) and blurred (uBlur) textures. */
export const SHARPEN_FRAG_SRC = `#version 300 es
precision highp float;

uniform sampler2D uSharp;
uniform sampler2D uBlur;
uniform float uAmount; // 0..~1.5

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec3 s = texture(uSharp, vUv).rgb;
  vec3 b = texture(uBlur, vUv).rgb;
  vec3 c = s + (s - b) * uAmount;
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
