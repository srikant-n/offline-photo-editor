import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defaultAdjustments } from '../../state/adjustments';
import type { Document } from '../../types';

function fakeCanvasWithGl(gl: unknown) {
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => gl),
  } as unknown as HTMLCanvasElement;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('createGlRenderer', () => {
  it('returns null when webgl2 context is unavailable', async () => {
    const { createGlRenderer: create } = await import('./engine');
    const canvas = fakeCanvasWithGl(null);
    expect(create(canvas)).toBeNull();
    expect((canvas as any).getContext).toHaveBeenCalledWith('webgl2', expect.objectContaining({
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    }));
  });
});

describe('supportsWebGL2', () => {
  it('returns false when the browser has no webgl2', async () => {
    vi.stubGlobal('document', {
      createElement: () => ({ getContext: () => null }),
    });
    const { supportsWebGL2: sup } = await import('./engine');
    expect(sup()).toBe(false);
  });

  it('returns true and releases the probe context when webgl2 exists', async () => {
    const loseContext = vi.fn();
    const gl = { getExtension: vi.fn(() => ({ loseContext })) };
    vi.stubGlobal('document', {
      createElement: () => ({ getContext: () => gl }),
    });
    const { supportsWebGL2: sup } = await import('./engine');
    expect(sup()).toBe(true);
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it('caches the result across calls', async () => {
    const createElement = vi.fn(() => ({ getContext: () => null }));
    vi.stubGlobal('document', { createElement });
    const { supportsWebGL2: sup } = await import('./engine');
    expect(sup()).toBe(false);
    expect(sup()).toBe(false);
    expect(createElement).toHaveBeenCalledOnce();
  });

  it('returns false when document access throws', async () => {
    vi.stubGlobal('document', {
      createElement: () => { throw new Error('no DOM'); },
    });
    const { supportsWebGL2: sup } = await import('./engine');
    expect(sup()).toBe(false);
  });
});

function fake2dContext() {
  return {
    fillStyle: '',
    fillRect: () => {},
    save: () => {},
    restore: () => {},
    transform: () => {},
    drawImage: () => {},
  };
}

function fakeGeoCanvas() {
  return {
    width: 0,
    height: 0,
    getContext: () => fake2dContext(),
  };
}

function stubGeometryDocument() {
  const canvases: ReturnType<typeof fakeGeoCanvas>[] = [];
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected element: ${tag}`);
      const c = fakeGeoCanvas();
      canvases.push(c);
      return c;
    },
  });
  return canvases;
}

function createFakeGl(opts: { compileOk?: boolean; linkOk?: boolean } = {}) {
  const loseContext = vi.fn();
  const gl: any = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, STATIC_DRAW: 6, TEXTURE_2D: 7, RGBA: 8, UNSIGNED_BYTE: 9,
    TEXTURE_MIN_FILTER: 10, TEXTURE_MAG_FILTER: 11, TEXTURE_WRAP_S: 12,
    TEXTURE_WRAP_T: 13, LINEAR: 14, CLAMP_TO_EDGE: 15, FRAMEBUFFER: 16,
    COLOR_ATTACHMENT0: 17, TRIANGLES: 18, TEXTURE0: 19, TEXTURE1: 20,
    UNPACK_FLIP_Y_WEBGL: 21,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => opts.compileOk !== false),
    getShaderInfoLog: vi.fn(() => 'fake shader log'),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => opts.linkOk !== false),
    getProgramInfoLog: vi.fn(() => 'fake program log'),
    deleteProgram: vi.fn(),
    createVertexArray: vi.fn(() => ({})),
    bindVertexArray: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    createTexture: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    pixelStorei: vi.fn(),
    createFramebuffer: vi.fn(() => ({})),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    getUniformLocation: vi.fn((_p: any, name: string) => ({ name })),
    useProgram: vi.fn(),
    activeTexture: vi.fn(),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    viewport: vi.fn(),
    drawArrays: vi.fn(),
    deleteFramebuffer: vi.fn(),
    deleteTexture: vi.fn(),
    deleteVertexArray: vi.fn(),
    deleteBuffer: vi.fn(),
    getExtension: vi.fn(() => ({ loseContext })),
  };
  return { gl, loseContext };
}

function makeDoc(over: Partial<Document> = {}): Document {
  return {
    source: { width: 4, height: 3 } as ImageBitmap,
    sourceName: 'x.png',
    canvas: { width: 4, height: 3, background: '#ffffff' },
    canvasAuto: true,
    straighten: 0,
    transform: { rotate90: 0, flipH: false, flipV: false },
    adjustments: defaultAdjustments(),
    layers: [],
    ...over,
  };
}

async function setupRender(gl: any, opts?: { loseOnDispose?: boolean }) {
  const { createGlRenderer } = await import('./engine');
  const geoCanvases = stubGeometryDocument();
  const canvas = fakeCanvasWithGl(gl);
  const renderer = createGlRenderer(canvas, opts);
  return { renderer, canvas, geoCanvases };
}

const uniformVals = (gl: any, method: 'uniform1f' | 'uniform2f', name: string) =>
  gl[method].mock.calls
    .filter((c: any[]) => c[0]?.name === name)
    .map((c: any[]) => method === 'uniform1f' ? c[1] : [c[1], c[2]]);

describe('createGlRenderer render', () => {
  it('renders tone-only output with two draw passes', async () => {
    const { gl } = createFakeGl();
    const { renderer, canvas } = await setupRender(gl);
    if (!renderer) throw new Error('renderer unavailable');

    renderer.render(makeDoc());

    expect(canvas.width).toBe(4);
    expect(canvas.height).toBe(3);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(uniformVals(gl, 'uniform1f', 'uBefore')).toEqual([0, 1]);
    const srcUpload = gl.texImage2D.mock.calls.find((c: any[]) => c.length === 6);
    expect(srcUpload).toBeDefined();
    expect(srcUpload[5].width).toBe(4);
    expect(srcUpload[5].height).toBe(3);
  });

  it('runs four passes for sharpness with blur and unsharp uniforms', async () => {
    const { gl } = createFakeGl();
    const { renderer } = await setupRender(gl);
    if (!renderer) throw new Error('renderer unavailable');
    const doc = makeDoc({
      adjustments: { ...defaultAdjustments(), sharpness: 80 },
    });

    renderer.render(doc);

    expect(gl.drawArrays).toHaveBeenCalledTimes(4);
    expect(uniformVals(gl, 'uniform2f', 'uDir')).toEqual([[1, 0], [0, 1]]);
    expect(uniformVals(gl, 'uniform1f', 'uRadius')).toEqual([1]);
    expect(uniformVals(gl, 'uniform1f', 'uAmount')[0]).toBeCloseTo(0.72);
    expect(uniformVals(gl, 'uniform1f', 'uBefore')).toEqual([0]);
  });

  it('recreates render targets when the output size changes', async () => {
    const { gl } = createFakeGl();
    const { renderer } = await setupRender(gl);
    if (!renderer) throw new Error('renderer unavailable');
    const doc = makeDoc();

    renderer.render(doc, { maxDim: 2 });
    expect(gl.deleteFramebuffer).not.toHaveBeenCalled();
    renderer.render(doc, { maxDim: 4 });
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(3);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(3);
  });

  it('dispose deletes GL resources and loses the context when requested', async () => {
    const { gl, loseContext } = createFakeGl();
    const { renderer } = await setupRender(gl, { loseOnDispose: true });
    if (!renderer) throw new Error('renderer unavailable');
    renderer.render(makeDoc());

    renderer.dispose();

    expect(loseContext).toHaveBeenCalledOnce();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(3);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(3);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(4);
    expect(gl.deleteVertexArray).toHaveBeenCalledOnce();
    expect(gl.deleteBuffer).toHaveBeenCalledOnce();
  });

  it('returns null when shader compilation fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { gl } = createFakeGl({ compileOk: false });
    const { renderer } = await setupRender(gl);
    expect(renderer).toBeNull();
    err.mockRestore();
  });

  it('returns null when program linking fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { gl } = createFakeGl({ linkOk: false });
    const { renderer } = await setupRender(gl);
    expect(renderer).toBeNull();
    err.mockRestore();
  });
});
