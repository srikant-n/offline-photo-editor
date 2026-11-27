/**
 * Minimal BMP decoder supporting the common variants:
 *  - uncompressed 24/32-bit (BI_RGB) and 16/32-bit bitfields
 *  - 8-bit palette (BI_RGB)
 *  - 4-bit and 8-bit RLE compression
 * Returns an ImageBitmap.
 */

const BMP_MAGIC = 0x4d42; // 'BM'

/** Parsed BMP header fields needed to decode pixel data. */
interface BmpInfo {
  width: number;
  height: number;
  topDown: boolean;
  bpp: number;
  compression: number;
  palette: Uint32Array | null; // RGBA packed
  masks: { r: number; g: number; b: number; a: number } | null;
  pixelOffset: number;
  data: ArrayBuffer;
}

/** Reads R/G/B/A bitfield masks from a V2+ header or the fields following a BITMAPINFOHEADER. */
function readMasks(dv: DataView, off: number, compression: number, headerSize: number): BmpInfo['masks'] {
  // For BI_BITFIELDS(3) and BI_ALPHABITFIELDS(6): masks follow the file header
  // for headerSize==40, or live inside BITMAPV4/V5 headers.
  const readMask = (o: number) => dv.getUint32(o, true);
  if (headerSize >= 52) {
    // BITMAPV2INFOHEADER+
    return {
      r: readMask(off + 40),
      g: readMask(off + 44),
      b: readMask(off + 48),
      a: headerSize >= 56 ? readMask(off + 52) : 0,
    };
  }
  if (compression === 3 || compression === 6) {
    const base = off + 40;
    return {
      r: readMask(base),
      g: readMask(base + 4),
      b: readMask(base + 8),
      a: compression === 6 ? readMask(base + 12) : 0,
    };
  }
  return null;
}

/** Computes the right-shift and max-value scale for a contiguous bitfield mask. */
function shiftFor(mask: number): { shift: number; scale: number } {
  if (!mask) return { shift: 0, scale: 0 };
  let shift = 0;
  let m = mask;
  while ((m & 1) === 0) { m >>>= 1; shift++; }
  const bits = 32 - Math.clz32(m);
  return { shift, scale: (1 << bits) - 1 };
}

/** Decodes a BMP file buffer into an ImageBitmap. Throws on unsupported or corrupt files. */
export async function decodeBMP(buf: ArrayBuffer): Promise<ImageBitmap> {
  const dv = new DataView(buf);
  if (buf.byteLength < 54 || dv.getUint16(0, true) !== BMP_MAGIC) {
    throw new Error('Not a BMP file');
  }
  const pixelOffset = dv.getUint32(10, true);
  const headerSize = dv.getUint32(14, true);
  const infoOff = 14;
  if (headerSize < 40) throw new Error('Unsupported BMP header');
  const width = dv.getInt32(infoOff + 4, true);
  const rawHeight = dv.getInt32(infoOff + 8, true);
  const topDown = rawHeight < 0;
  const height = Math.abs(rawHeight);
  const bpp = dv.getUint16(infoOff + 14, true);
  const compression = dv.getUint32(infoOff + 16, true);
  const colorsUsed = headerSize >= 40 ? dv.getUint32(infoOff + 32, true) : 0;

  // BI_RGB(0), BI_RLE8(1), BI_RLE4(2), BI_BITFIELDS(3), BI_ALPHABITFIELDS(6)
  if (![0, 1, 2, 3, 6].includes(compression)) {
    throw new Error(`Unsupported BMP compression: ${compression}`);
  }
  if ((compression === 1 || compression === 2) && bpp !== 4 && bpp !== 8) {
    throw new Error('RLE-compressed BMP must be 4 or 8 bpp');
  }

  let masks = readMasks(dv, infoOff, compression, headerSize);
  // All-zero masks (e.g. BI_RGB inside a V4/V5 header) mean "no bitfields".
  if (masks && (masks.r | masks.g | masks.b | masks.a) === 0) masks = null;
  // 16bpp BI_RGB defaults to RGB555.
  if (bpp === 16 && !masks && (compression === 0 || compression === 3)) {
    masks = { r: 0x7c00, g: 0x03e0, b: 0x001f, a: 0 };
  }
  // Bitfields only apply to 16/32bpp.
  if (masks && bpp !== 16 && bpp !== 32) masks = null;

  // Palette
  let palette: Uint32Array | null = null;
  if (bpp <= 8) {
    const n = colorsUsed || 1 << bpp;
    palette = new Uint32Array(n);
    const palOff = infoOff + headerSize;
    for (let i = 0; i < n; i++) {
      const o = palOff + i * 4;
      if (o + 3 >= buf.byteLength) break;
      const b = dv.getUint8(o), g = dv.getUint8(o + 1), r = dv.getUint8(o + 2);
      palette[i] = (255 << 24) | (r << 16) | (g << 8) | b;
    }
  }

  if (pixelOffset >= buf.byteLength) {
    throw new Error('BMP pixel data offset out of range');
  }

  const info: BmpInfo = {
    width, height, topDown, bpp, compression,
    palette, masks, pixelOffset, data: buf,
  };

  if (width <= 0 || height <= 0 || width > 65535 || height > 65535) {
    throw new Error('BMP has invalid dimensions');
  }

  const img = new ImageData(width, height);
  const px = new Uint32Array(img.data.buffer);

  const stride = Math.floor((bpp * width + 31) / 32) * 4;

  const put = (x: number, y: number, r: number, g: number, b: number, a: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    px[y * width + x] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  };

  if (compression === 1 || compression === 2) {
    decodeRLE(info, put, compression === 1 ? 8 : 4);
  } else {
    decodeRaw(info, stride, put);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(img, 0, 0);
  return createImageBitmap(canvas);
}

/** Writes one pixel; coordinates outside the image are ignored. */
type PutFn = (x: number, y: number, r: number, g: number, b: number, a: number) => void;

/** Decodes uncompressed BMP pixel rows (24/32bpp, palette 4/8bpp, and bitfield 16/32bpp). */
function decodeRaw(info: BmpInfo, stride: number, put: PutFn) {
  const { width, height, topDown, bpp, data, masks } = info;
  const dv = new DataView(data);
  const base = info.pixelOffset;
  const dataEnd = data.byteLength;
  // Bytes actually needed per row (excluding pad bytes).
  const rowBytes = bpp === 16 ? width * 2 : bpp === 24 ? width * 3 : bpp === 32 ? width * 4
    : bpp === 8 ? width : Math.ceil(width / 2);

  /** Returns false when the row would read past the buffer (tolerate short files). */
  const rowInBounds = (row: number) => base + row * stride + rowBytes <= dataEnd;

  if (masks) {
    const rs = shiftFor(masks.r), gs = shiftFor(masks.g), bs = shiftFor(masks.b), as = masks.a ? shiftFor(masks.a) : null;
    for (let row = 0; row < height; row++) {
      if (!rowInBounds(row)) break;
      const y = topDown ? row : height - 1 - row;
      const lineOff = base + row * stride;
      for (let x = 0; x < width; x++) {
        let v = 0;
        if (bpp === 16) v = dv.getUint16(lineOff + x * 2, true);
        else v = dv.getUint32(lineOff + x * 4, true);
        const a = as ? Math.round(((v >>> as.shift) & as.scale) / as.scale * 255) : 255;
        const r = Math.round(((v >>> rs.shift) & rs.scale) / rs.scale * 255);
        const g = Math.round(((v >>> gs.shift) & gs.scale) / gs.scale * 255);
        const b = Math.round(((v >>> bs.shift) & bs.scale) / bs.scale * 255);
        put(x, y, r, g, b, a);
      }
    }
    return;
  }

  if (bpp === 24 || bpp === 32) {
    const bpr = bpp / 8;
    for (let row = 0; row < height; row++) {
      if (!rowInBounds(row)) break;
      const y = topDown ? row : height - 1 - row;
      const lineOff = base + row * stride;
      for (let x = 0; x < width; x++) {
        const o = lineOff + x * bpr;
        const b = dv.getUint8(o), g = dv.getUint8(o + 1), r = dv.getUint8(o + 2);
        // The 4th byte of 32bpp BI_RGB is undefined per spec (often 0);
        // only bitfield masks may supply alpha, handled in the masks path.
        put(x, y, r, g, b, 255);
      }
    }
    return;
  }

  if (bpp === 8 && info.palette) {
    for (let row = 0; row < height; row++) {
      if (!rowInBounds(row)) break;
      const y = topDown ? row : height - 1 - row;
      const lineOff = base + row * stride;
      for (let x = 0; x < width; x++) {
        const idx = dv.getUint8(lineOff + x);
        const c = info.palette[idx] ?? info.palette[0];
        put(x, y, (c >> 16) & 255, (c >> 8) & 255, c & 255, 255);
      }
    }
    return;
  }

  if (bpp === 4 && info.palette) {
    for (let row = 0; row < height; row++) {
      if (!rowInBounds(row)) break;
      const y = topDown ? row : height - 1 - row;
      const lineOff = base + row * stride;
      for (let x = 0; x < width; x++) {
        const byte = dv.getUint8(lineOff + (x >> 1));
        const idx = x & 1 ? byte & 15 : byte >> 4;
        const c = info.palette[idx] ?? info.palette[0];
        put(x, y, (c >> 16) & 255, (c >> 8) & 255, c & 255, 255);
      }
    }
    return;
  }

  throw new Error(`Unsupported BMP bit depth: ${bpp}`);
}

/** Decodes RLE-compressed BMP data (BI_RLE8 or BI_RLE4). */
function decodeRLE(info: BmpInfo, put: PutFn, bpp: 4 | 8) {
  const { height, data, palette } = info;
  const dv = new DataView(data);
  let off = info.pixelOffset;
  let x = 0, y = 0;
  const end = () => off >= data.byteLength;
  const u8 = () => (off < data.byteLength ? dv.getUint8(off++) : 0);

  const plot = (px: number, py: number, idx: number) => {
    const c = palette?.[idx] ?? 0;
    put(px, py, (c >> 16) & 255, (c >> 8) & 255, c & 255, 255);
  };

  while (!end()) {
    const count = u8();
    if (count === 0) {
      if (end()) break;
      const cmd = u8();
      if (cmd === 0) { // end of line
        x = 0; y++;
      } else if (cmd === 1) { // end of bitmap
        break;
      } else if (cmd === 2) { // delta
        x += u8();
        y += u8();
      } else { // absolute mode
        const n = cmd;
        const avail = Math.max(0, data.byteLength - off);
        if (bpp === 8) {
          const take = Math.min(n, avail);
          for (let i = 0; i < take; i++) {
            plot(x + i, height - 1 - y, dv.getUint8(off + i));
          }
          off += n;
          if (n & 1) off++;
        } else {
          const take = Math.min(n, avail * 2);
          for (let i = 0; i < take; i++) {
            const byte = dv.getUint8(off + (i >> 1));
            const idx = i & 1 ? byte & 15 : byte >> 4;
            plot(x + i, height - 1 - y, idx);
          }
          off += Math.ceil(n / 2);
          if (Math.ceil(n / 2) & 1) off++;
        }
        x += n;
      }
    } else {
      // encoded run
      const idxByte = u8();
      if (bpp === 8) {
        for (let i = 0; i < count; i++) plot(x + i, height - 1 - y, idxByte);
      } else {
        for (let i = 0; i < count; i++) {
          const idx = i & 1 ? idxByte & 15 : idxByte >> 4;
          plot(x + i, height - 1 - y, idx);
        }
      }
      x += count;
    }
  }
}
