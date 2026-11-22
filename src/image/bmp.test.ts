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
  rows?: Uint8Array[];
  /** Raw encoded payload for RLE-compressed BMPs. */
  rle?: Uint8Array;
  /** BI_BITFIELDS masks written after the 40-byte header. */
  masks?: { r: number; g: number; b: number; a?: number };
}

function makeBmp(spec: BmpSpec): ArrayBuffer {
  const { width, height, bpp } = spec;
  const compression = spec.compression ?? 0;
  const stride = Math.floor((bpp * width + 31) / 32) * 4;

  const palette = spec.palette ?? [];
  const paletteBytes = palette.length * 4;
  const maskBytes = spec.masks ? (compression === 6 ? 16 : 12) : 0;
  const pixelOffset = 54 + maskBytes + paletteBytes;
  const dataSize = spec.rle?.length ?? stride * height;
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

  if (spec.masks) {
    dv.setUint32(54, spec.masks.r, true);
    dv.setUint32(58, spec.masks.g, true);
    dv.setUint32(62, spec.masks.b, true);
    if (compression === 6) dv.setUint32(66, spec.masks.a ?? 0, true);
  }

  const palOff = 54 + maskBytes;
  palette.forEach(([r, g, b], i) => {
    const o = palOff + i * 4;
    u8[o] = b; u8[o + 1] = g; u8[o + 2] = r; u8[o + 3] = 0;
  });

  // File rows are stored bottom-up unless topDown; spec.rows are given in
  // file order already, so write them verbatim.
  spec.rows?.forEach((row, i) => {
    u8.set(row.subarray(0, stride), pixelOffset + i * stride);
  });
  if (spec.rle) u8.set(spec.rle, pixelOffset);
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

  it('decodes 4bpp BI_RGB with high-nibble-first pixels', async () => {
    const palette: [number, number, number][] = [
      [10, 0, 0], [20, 0, 0], [30, 0, 0], [40, 0, 0],
    ];
    const buf = makeBmp({
      width: 3, height: 2, bpp: 4, palette,
      rows: [
        new Uint8Array([0x32, 0x10, 0, 0]), // bottom row: indices 3,2,1
        new Uint8Array([0x01, 0x20, 0, 0]), // top row: indices 0,1,2
      ],
    });
    const bmp = (await decodeBMP(buf)) as unknown as FakeImageData;
    expect(px(bmp, 0, 0)).toEqual([10, 0, 0, 255]);
    expect(px(bmp, 1, 0)).toEqual([20, 0, 0, 255]);
    expect(px(bmp, 2, 0)).toEqual([30, 0, 0, 255]);
    expect(px(bmp, 0, 1)).toEqual([40, 0, 0, 255]);
    expect(px(bmp, 1, 1)).toEqual([30, 0, 0, 255]);
    expect(px(bmp, 2, 1)).toEqual([20, 0, 0, 255]);
  });

  it('decodes top-down 24bpp rows in file order', async () => {
    const buf = makeBmp({
      width: 2, height: 2, bpp: 24, topDown: true,
      rows: [
        new Uint8Array([30, 20, 10, 60, 50, 40, 0, 0]),
        new Uint8Array([90, 80, 70, 255, 255, 255, 0, 0]),
      ],
    });
    const bmp = (await decodeBMP(buf)) as unknown as FakeImageData;
    expect(px(bmp, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(px(bmp, 1, 0)).toEqual([40, 50, 60, 255]);
    expect(px(bmp, 0, 1)).toEqual([70, 80, 90, 255]);
    expect(px(bmp, 1, 1)).toEqual([255, 255, 255, 255]);
  });

  it('decodes 16bpp BI_BITFIELDS RGB565', async () => {
    const buf = makeBmp({
      width: 4, height: 1, bpp: 16, compression: 3,
      masks: { r: 0xf800, g: 0x07e0, b: 0x001f },
      rows: [new Uint8Array([
        0x00, 0xf8, // red
        0xe0, 0x07, // green
        0x1f, 0x00, // blue
        0xff, 0xff, // white
      ])],
    });
    const bmp = (await decodeBMP(buf)) as unknown as FakeImageData;
    expect(px(bmp, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(bmp, 1, 0)).toEqual([0, 255, 0, 255]);
    expect(px(bmp, 2, 0)).toEqual([0, 0, 255, 255]);
    expect(px(bmp, 3, 0)).toEqual([255, 255, 255, 255]);
  });

  it('decodes 32bpp BI_ALPHABITFIELDS with alpha', async () => {
    const buf = makeBmp({
      width: 1, height: 1, bpp: 32, compression: 6,
      masks: { r: 0x00ff0000, g: 0x0000ff00, b: 0x000000ff, a: 0xff000000 },
      rows: [new Uint8Array([30, 20, 10, 128])], // BGRA
    });
    const bmp = (await decodeBMP(buf)) as unknown as FakeImageData;
    expect(px(bmp, 0, 0)).toEqual([10, 20, 30, 128]);
  });

  it('decodes RLE8 encoded, absolute, and end-of-line runs', async () => {
    const palette: [number, number, number][] = [
      [10, 0, 0], [20, 0, 0], [30, 0, 0], [40, 0, 0],
    ];
    const buf = makeBmp({
      width: 4, height: 2, bpp: 8, compression: 1, palette,
      rle: new Uint8Array([
        0x04, 0x01,       // bottom row: four pixels of index 1
        0x00, 0x00,       // end of line
        0x00, 0x04,       // absolute mode: four pixels
        0x02, 0x03, 0x00, 0x01,
        0x00, 0x01,       // end of bitmap
      ]),
    });
    const bmp = (await decodeBMP(buf)) as unknown as FakeImageData;
    expect(px(bmp, 0, 0)).toEqual([30, 0, 0, 255]);
    expect(px(bmp, 1, 0)).toEqual([40, 0, 0, 255]);
    expect(px(bmp, 2, 0)).toEqual([10, 0, 0, 255]);
    expect(px(bmp, 3, 0)).toEqual([20, 0, 0, 255]);
    expect(px(bmp, 0, 1)).toEqual([20, 0, 0, 255]);
    expect(px(bmp, 3, 1)).toEqual([20, 0, 0, 255]);
  });

  it('decodes RLE4 encoded and absolute runs with high-nibble-first pixels', async () => {
    const palette: [number, number, number][] = [
      [10, 0, 0], [20, 0, 0], [30, 0, 0], [40, 0, 0],
    ];
    const buf = makeBmp({
      width: 4, height: 2, bpp: 4, compression: 2, palette,
      rle: new Uint8Array([
        0x04, 0x12,       // bottom row: indices 1,2,1,2
        0x00, 0x00,       // end of line
        0x00, 0x04,       // absolute mode: four pixels
        0x30, 0x21,       // indices 3,0,2,1
        0x00, 0x01,       // end of bitmap
      ]),
    });
    const bmp = (await decodeBMP(buf)) as unknown as FakeImageData;
    expect(px(bmp, 0, 0)).toEqual([40, 0, 0, 255]);
    expect(px(bmp, 1, 0)).toEqual([10, 0, 0, 255]);
    expect(px(bmp, 2, 0)).toEqual([30, 0, 0, 255]);
    expect(px(bmp, 3, 0)).toEqual([20, 0, 0, 255]);
    expect(px(bmp, 0, 1)).toEqual([20, 0, 0, 255]);
    expect(px(bmp, 1, 1)).toEqual([30, 0, 0, 255]);
    expect(px(bmp, 2, 1)).toEqual([20, 0, 0, 255]);
    expect(px(bmp, 3, 1)).toEqual([30, 0, 0, 255]);
  });
});
