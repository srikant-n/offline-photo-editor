import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { decodeImageBlob } from './decode';

// decodeBMP (used for BMP inputs) ends by rasterizing into a canvas and
// calling createImageBitmap. Stub the minimal DOM surface like bmp.test.ts.
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
  getContext() {
    return { putImageData: () => {} };
  }
}

/** 1x1 24bpp BI_RGB BMP (red pixel). */
function makeTinyBmp(): ArrayBuffer {
  const buf = new ArrayBuffer(58);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  dv.setUint8(0, 0x42); dv.setUint8(1, 0x4d); // 'BM'
  dv.setUint32(2, buf.byteLength, true);
  dv.setUint32(10, 54, true);   // pixel data offset
  dv.setUint32(14, 40, true);   // BITMAPINFOHEADER
  dv.setInt32(18, 1, true);     // width
  dv.setInt32(22, 1, true);     // height (bottom-up)
  dv.setUint16(26, 1, true);    // planes
  dv.setUint16(28, 24, true);   // bpp
  dv.setUint32(30, 0, true);    // BI_RGB
  dv.setUint32(34, 4, true);    // image size (1 row * 4-byte stride)
  u8.set([0, 0, 255, 0], 54);   // BGRX -> red
  return buf;
}

beforeAll(() => {
  vi.stubGlobal('ImageData', FakeImageData);
  vi.stubGlobal('document', { createElement: () => new FakeCanvas() });
});

beforeEach(() => {
  // Default: blob path succeeds returning a fixed-size bitmap; the canvas
  // path (decodeBMP) reports the canvas dimensions.
  vi.stubGlobal('createImageBitmap', vi.fn(async (src: any, opts?: any) => {
    if (opts) return { width: 640, height: 480, opts };
    return { width: src.width, height: src.height, opts };
  }));
});

describe('decodeImageBlob', () => {
  it('routes .bmp files to the BMP decoder', async () => {
    const blob = new Blob([makeTinyBmp()], { type: 'application/octet-stream' });
    const img = await decodeImageBlob(blob, 'photo.bmp');
    expect(img.width).toBe(1);
    expect(img.height).toBe(1);
    expect(img.name).toBe('photo.bmp');
    // The BMP path must not consult createImageBitmap's blob overload.
    expect(vi.mocked(createImageBitmap).mock.calls[0][1]).toBeUndefined();
  });

  it('routes image/bmp and image/x-ms-bmp MIME types to the BMP decoder', async () => {
    for (const type of ['image/bmp', 'image/x-ms-bmp']) {
      vi.mocked(createImageBitmap).mockClear();
      const blob = new Blob([makeTinyBmp()], { type });
      const img = await decodeImageBlob(blob, 'no-extension');
      expect(img.width).toBe(1);
      expect(img.height).toBe(1);
    }
  });

  it('decodes regular images via createImageBitmap with EXIF orientation', async () => {
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    const img = await decodeImageBlob(blob, 'pic.png');
    expect(img).toMatchObject({ width: 640, height: 480, name: 'pic.png' });
    expect(vi.mocked(createImageBitmap).mock.calls[0][1])
      .toEqual({ imageOrientation: 'from-image' });
  });

  it('falls back to BMP sniffing when createImageBitmap fails', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async (_src: any, opts?: any) => {
      if (opts) throw new Error('cannot decode');
      return { width: _src.width, height: _src.height };
    }));
    // Not named/type-marked as BMP, but the bytes have the BM magic.
    const blob = new Blob([makeTinyBmp()], { type: 'image/png' });
    const img = await decodeImageBlob(blob, 'disguised.png');
    expect(img.width).toBe(1);
    expect(img.height).toBe(1);
    expect(img.name).toBe('disguised.png');
  });

  it('rethrows the original error when the fallback is not a BMP', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => {
      throw new Error('cannot decode');
    }));
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
    await expect(decodeImageBlob(blob, 'bad.png')).rejects.toThrow('cannot decode');
  });

  it('propagates BMP decode errors for corrupt .bmp files', async () => {
    const blob = new Blob([new Uint8Array(4)], { type: 'image/bmp' });
    await expect(decodeImageBlob(blob, 'tiny.bmp')).rejects.toThrow('Not a BMP file');
  });

  it('matches the .bmp extension case-insensitively', async () => {
    const blob = new Blob([makeTinyBmp()], { type: 'application/octet-stream' });
    const img = await decodeImageBlob(blob, 'PHOTO.BMP');
    expect(img.width).toBe(1);
    expect(img.height).toBe(1);
    expect(img.name).toBe('PHOTO.BMP');
  });

  it('lowercases the blob MIME type before checking', async () => {
    const blob = new Blob([makeTinyBmp()], { type: 'IMAGE/X-MS-BMP' });
    const img = await decodeImageBlob(blob, 'no-ext');
    expect(img.width).toBe(1);
    expect(img.height).toBe(1);
  });

  it('defaults the name to an empty string', async () => {
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    const img = await decodeImageBlob(blob);
    expect(img.name).toBe('');
  });
});
