import type { AdjustmentState, Document, GeoParams } from '../../types';
import { renderGeometry, transformedSize } from '../geometry';
import { VERT_SRC, TONE_FRAG_SRC, BLUR_FRAG_SRC, SHARPEN_FRAG_SRC } from './shaders';

/** Options controlling a single render pass. */
export interface RenderOptions {
  before?: boolean;
  /** Max dimension for the output; defaults to canvas size. */
  maxDim?: number;
}

/** A render backend (WebGL2 or Canvas2D fallback) that draws a Document into a canvas. */
export interface Renderer {
  canvas: HTMLCanvasElement;
  /** Render doc into renderer.canvas (sized by caller beforehand or via resize). */
  render(doc: Document, opts?: RenderOptions): void;
  dispose(): void;
}

/** An offscreen framebuffer + texture pair used as an intermediate render target. */
interface GpuTarget {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

/** Compiles a GLSL shader and throws with the info log on failure. */
function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    console.error('[gl] shader compile failed:', log, '\n--- source ---\n' + src);
    throw new Error('Shader compile failed: ' + log);
  }
  return sh;
}

/** Links a vertex + fragment shader pair into a program; throws on link failure. */
function program(gl: WebGL2RenderingContext, fragSrc: string) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  const ok = gl.getProgramParameter(p, gl.LINK_STATUS);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!ok) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    console.error('[gl] program link failed:', log);
    throw new Error('Program link failed: ' + log);
  }
  return p;
}

/** Allocates an RGBA render target (framebuffer + texture) of the given size. */
function makeTarget(gl: WebGL2RenderingContext, w: number, h: number): GpuTarget {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, w, h };
}

/** Cached result of probing the environment for WebGL2 support. */
let webgl2Support: boolean | null = null;
/** Returns true if WebGL2 is available in this browser (result is cached). */
export function supportsWebGL2(): boolean {
  if (webgl2Support !== null) return webgl2Support;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    webgl2Support = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl2Support = false;
  }
  return webgl2Support;
}

/**
 * Creates a WebGL2 renderer. Caller provides the canvas; its 2D size is set
 * by `resize()`. Returns null if WebGL2 is unavailable.
 */
export function createGlRenderer(canvas: HTMLCanvasElement, opts?: { loseOnDispose?: boolean }): Renderer | null {
  const glMaybe = canvas.getContext('webgl2', {
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  if (!glMaybe) return null;
  const gl: WebGL2RenderingContext = glMaybe;

  let toneProg: WebGLProgram, blurProg: WebGLProgram, sharpProg: WebGLProgram;
  try {
    toneProg = program(gl, TONE_FRAG_SRC);
    blurProg = program(gl, BLUR_FRAG_SRC);
    sharpProg = program(gl, SHARPEN_FRAG_SRC);
  } catch {
    return null;
  }

  // Fullscreen triangle
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // Source texture (geometry stage output)
  const srcTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  let targets: GpuTarget[] = [];
  /** Reallocates ping-pong render targets when the output size changes. */
  const ensureTargets = (w: number, h: number) => {
    if (targets.length === 3 && targets[0].w === w && targets[0].h === h) return;
    for (const t of targets) {
      gl.deleteFramebuffer(t.fbo);
      gl.deleteTexture(t.tex);
    }
    targets = [makeTarget(gl, w, h), makeTarget(gl, w, h), makeTarget(gl, w, h)];
  };

  /** Looks up a uniform location by name (convenience wrapper). */
  const U = (p: WebGLProgram, name: string) => gl.getUniformLocation(p, name);

  const toneLocs = {
    tex: U(toneProg, 'uTex'), texSize: U(toneProg, 'uTexSize'),
    exposure: U(toneProg, 'uExposure'), brightness: U(toneProg, 'uBrightness'),
    contrast: U(toneProg, 'uContrast'), highlights: U(toneProg, 'uHighlights'),
    shadows: U(toneProg, 'uShadows'), whites: U(toneProg, 'uWhites'),
    blacks: U(toneProg, 'uBlacks'), temperature: U(toneProg, 'uTemperature'),
    vibrance: U(toneProg, 'uVibrance'), saturation: U(toneProg, 'uSaturation'),
    before: U(toneProg, 'uBefore'),
  };
  const blurLocs = {
    tex: U(blurProg, 'uTex'), texSize: U(blurProg, 'uTexSize'),
    dir: U(blurProg, 'uDir'), radius: U(blurProg, 'uRadius'),
  };
  const sharpLocs = {
    sharp: U(sharpProg, 'uSharp'), blur: U(sharpProg, 'uBlur'),
    amount: U(sharpProg, 'uAmount'),
  };

  /** Uploads the geometry-stage canvas as the source texture. */
  function setSourceTexture(geo: HTMLCanvasElement) {
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, geo);
  }

  /** Binds a render target (or the default framebuffer) and sets the viewport. */
  function bindQuad(target: GpuTarget | null, w: number, h: number) {
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
    }
    gl.viewport(0, 0, w, h);
  }

  /** Issues the fullscreen-triangle draw call. */
  function draw() {
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /** Pushes all adjustment uniforms for the tone pass. */
  function setAdjUniforms(a: AdjustmentState, before: boolean) {
    gl.uniform1f(toneLocs.exposure, a.exposure);
    gl.uniform1f(toneLocs.brightness, a.brightness);
    gl.uniform1f(toneLocs.contrast, a.contrast);
    gl.uniform1f(toneLocs.highlights, a.highlights);
    gl.uniform1f(toneLocs.shadows, a.shadows);
    gl.uniform1f(toneLocs.whites, a.whites);
    gl.uniform1f(toneLocs.blacks, a.blacks);
    gl.uniform1f(toneLocs.temperature, a.temperature);
    gl.uniform1f(toneLocs.vibrance, a.vibrance);
    gl.uniform1f(toneLocs.saturation, a.saturation);
    gl.uniform1f(toneLocs.before, before ? 1 : 0);
  }

  function render(doc: Document, opts: RenderOptions = {}) {
    const before = !!opts.before;
    const maxDim = opts.maxDim ?? Infinity;
    const full = doc.canvasAuto
      ? (() => {
          const s = transformedSize(doc.source.width, doc.source.height, geoParams(doc));
          return { w: s.w, h: s.h };
        })()
      : { w: doc.canvas.width, h: doc.canvas.height };
    let w = full.w, h = full.h;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const geo = renderGeometry(doc.source, doc.source.width, doc.source.height, geoParams(doc, w, h));
    setSourceTexture(geo);

    const sharp = before ? 0 : doc.adjustments.sharpness;
    ensureTargets(w, h);

    // Pass 1: tone → target[0]
    gl.useProgram(toneProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(toneLocs.tex, 0);
    gl.uniform2f(toneLocs.texSize, geo.width, geo.height);
    setAdjUniforms(doc.adjustments, before);
    bindQuad(targets[0], w, h);
    draw();

    if (sharp > 0.5) {
      // Pass 2: horizontal blur target[0] → target[1]
      gl.useProgram(blurProg);
      gl.uniform1i(blurLocs.tex, 0);
      gl.uniform2f(blurLocs.texSize, w, h);
      gl.uniform2f(blurLocs.dir, 1, 0);
      gl.uniform1f(blurLocs.radius, 1.0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targets[0].tex);
      bindQuad(targets[1], w, h);
      draw();
      // Pass 3: vertical blur target[1] → target[2]
      gl.uniform2f(blurLocs.dir, 0, 1);
      gl.bindTexture(gl.TEXTURE_2D, targets[1].tex);
      bindQuad(targets[2], w, h);
      draw();
      // Pass 4: unsharp composite → screen
      gl.useProgram(sharpProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targets[0].tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, targets[2].tex);
      gl.uniform1i(sharpLocs.sharp, 0);
      gl.uniform1i(sharpLocs.blur, 1);
      gl.uniform1f(sharpLocs.amount, Math.min(1.5, sharp / 100) * 0.9);
      bindQuad(null, w, h);
      draw();
      gl.activeTexture(gl.TEXTURE0);
    } else {
      // blit target[0] → screen
      gl.useProgram(toneProg);
      gl.uniform1f(toneLocs.before, 1); // reuse tone prog as copy: before=1 samples? no—samples uTex=srcTex
      // Instead use a plain copy: bind srcTex? target[0] already has toned result.
      // Simplest: draw target[0] to screen with toneProg sampling target[0] and before=1.
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targets[0].tex);
      gl.uniform1i(toneLocs.tex, 0);
      gl.uniform2f(toneLocs.texSize, w, h);
      bindQuad(null, w, h);
      draw();
      gl.activeTexture(gl.TEXTURE0);
    }
  }

  /** Computes GeoParams for a document at the requested output size. */
  function geoParams(doc: Document, w?: number, h?: number): GeoParams {
    const size = doc.canvasAuto
      ? transformedSize(doc.source.width, doc.source.height, {
          crop: doc.crop, straighten: doc.straighten, transform: doc.transform,
          outW: 0, outH: 0, background: doc.canvas.background,
        })
      : { w: doc.canvas.width, h: doc.canvas.height };
    const outW = w ?? size.w, outH = h ?? size.h;
    return {
      crop: doc.crop, straighten: doc.straighten, transform: doc.transform,
      outW, outH, background: doc.canvas.background,
    };
  }

  return {
    canvas,
    render,
    dispose() {
      for (const t of targets) {
        gl.deleteFramebuffer(t.fbo);
        gl.deleteTexture(t.tex);
      }
      targets = [];
      gl.deleteTexture(srcTex);
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(vbo);
      for (const p of [toneProg, blurProg, sharpProg]) gl.deleteProgram(p);
      if (opts?.loseOnDispose) {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    },
  };
}
