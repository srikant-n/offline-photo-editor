import { describe, it, expect, vi, beforeAll } from 'vitest';
import { decodeBMP } from './bmp';

// decodeBMP ends by rasterizing into a canvas and calling createImageBitmap.
// Stub the minimal DOM surface: ImageData is a plain byte container, and the
// fake canvas captures whatever putImageData receives.
class FakeImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
}

class FakeCanvas {
  width = 0;
  height = 0;
  img: FakeImageData | null = null;
  getContext() {
    return {
      putImageData: (img: FakeImageData) => { this.img = img; },
    };
  }
}

let lastCanvas: FakeCanvas;

beforeAll(() => {
  vi.stubGlobal('ImageData', FakeImageData);
  vi.stubGlobal('document', {
    createElement: () => {
      lastCanvas = new FakeCanvas();
      return lastCanvas;
    },
  });
  vi.stubGlobal('createImageBitmap', async (src: FakeCanvas) => src.img);
});

function px(img: FakeImageData, x: number, y: number): [number, number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

interface BmpSpec {
  width: number;
  height: number;
  bpp: number;
  compression?: number;
  topDown?: boolean;
  palette?: [number, number, number][]; // RGB triples
  /** Raw pixel bytes, rows top-to-bottom as they appear in the file for bottom-up. */
  rows: Uint8Array[];
}

function makeBmp(spec: BmpSpec): ArrayBuffer {
  const { width, height, bpp } = spec;
  const compression = spec.compression ?? 0;
  const stride = Math.floor((bpp * width + 31) / 32) * 4;

  const palette = spec.palette ?? [];
  const paletteBytes = palette.length * 4;
  const pixelOffset = 54 + paletteBytes;
  const dataSize = stride * height;
  const buf = new ArrayBuffer(pixelOffset + dataSize);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);

  dv.setUint8(0, 0x42); dv.setUint8(1, 0x4d); // 'BM'
  dv.setUint32(2, buf.byteLength, true);
  dv.setUint32(10, pixelOffset, true);
  dv.setUint32(14, 40, true); // BITMAPINFOHEADER
  dv.setInt32(18, width, true);
  dv.setInt32(22, spec.topDown ? -height : height, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, bpp, true);
  dv.setUint32(30, compression, true);
  dv.setUint32(34, dataSize, true);
  dv.setUint32(46, palette.length, true); // biClrUsed

  palette.forEach(([r, g, b], i) => {
    const o = 54 + i * 4;
    u8[o] = b; u8[o + 1] = g; u8[o + 2] = r; u8[o + 3] = 0;
  });

  // File rows are stored bottom-up unless topDown; spec.rows are given in
  // file order already, so write them verbatim.
  spec.rows.forEach((row, i) => {
    u8.set(row.subarray(0, stride), pixelOffset + i * stride);
  });
  return buf;
}

describe('decodeBMP', () => {
  it('decodes 24bpp BI_RGB with correct channel order', async () => {
    // 1x1, BGR bytes (30, 20, 10) -> RGB (10, 20, 30)
    const buf = makeBmp({
      width: 1, height: 1, bpp: 24,
      rows: [new Uint8Array([30, 20, 10, 0])],
    });
    const bmp = (await decodeBMP(buf)) as unknown as FakeImageData;
    expect(px(bmp, 0, 0)).toEqual([10, 20, 30, 255]);
  });

  it('decodes 8bpp palette without swapping red and blue', async () => {
    // palette[0] = red, palette[1] = green; 2x2 checkerboard of indices
    const buf = makeBmp({
      width: 2, height: 2, bpp: 8,
      palette: [[255, 0, 0], [0, 255, 0]],
      rows: [
        new Uint8Array([0, 1, 0, 0]), // bottom row: red, green
        new Uint8Array([1, 0, 0, 0]), // top row: green, red
      ],
    });
    const bmp = (await decodeBMP(buf)) as unknown as FakeImageData;
    expect(px(bmp, 0, 0)).toEqual([0, 255, 0, 255]); // top-left = green
    expect(px(bmp, 1, 0)).toEqual([255, 0, 0, 255]); // top-right = red
    expect(px(bmp, 0, 1)).toEqual([255, 0, 0, 255]); // bottom-left = red
    expect(px(bmp, 1, 1)).toEqual([0, 255, 0, 255]); // bottom-right = green
  });

  it('treats the undefined alpha byte of 32bpp BI_RGB as opaque', async () => {
    const buf = makeBmp({
      width: 1, height: 1, bpp: 32,
      rows: [new Uint8Array([30, 20, 10, 0])], // alpha byte = 0
    });
    const bmp = (await decodeBMP(buf)) as unknown as FakeImageData;
    expect(px(bmp, 0, 0)).toEqual([10, 20, 30, 255]);
  });

  it('rejects unsupported compression instead of decoding garbage', async () => {
    const buf = makeBmp({
      width: 1, height: 1, bpp: 24, compression: 4, // BI_JPEG
      rows: [new Uint8Array(4)],
    });
    await expect(decodeBMP(buf)).rejects.toThrow(/compression/i);
  });

  it('rejects RLE compression on non-palettized depths', async () => {
    const buf = makeBmp({
      width: 1, height: 1, bpp: 24, compression: 1, // BI_RLE8
      rows: [new Uint8Array(4)],
    });
    await expect(decodeBMP(buf)).rejects.toThrow(/RLE/i);
  });
});
