import { decodeBMP } from './bmp';

/** Result of decoding an image file: an ImageBitmap plus its intrinsic dimensions and source name. */
export interface DecodedImage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  name: string;
}

/** Checks whether a buffer starts with the BMP 'BM' magic bytes. */
function isBMP(buf: ArrayBuffer): boolean {
  return buf.byteLength >= 2 && new DataView(buf).getUint16(0, true) === 0x4d42;
}

/**
 * Decode an image Blob/File into an ImageBitmap.
 * Handles BMP explicitly (including misnamed/unlabeled BMPs) and delegates
 * everything else to createImageBitmap with EXIF orientation applied.
 */
export async function decodeImageBlob(blob: Blob, name = ''): Promise<DecodedImage> {
  const type = blob.type.toLowerCase();
  const looksBMP = /\.bmp$/i.test(name) || type === 'image/bmp' || type === 'image/x-ms-bmp';

  if (looksBMP) {
    return decodeBMPImage(await blob.arrayBuffer(), name);
  }

  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    return { bitmap, width: bitmap.width, height: bitmap.height, name };
  } catch (err) {
    // Last resort: maybe it's a BMP the browser can't sniff.
    const buf = await blob.arrayBuffer();
    if (isBMP(buf)) return decodeBMPImage(buf, name);
    throw err;
  }
}

/** Decodes a BMP buffer into an ImageBitmap via the custom BMP decoder. */
async function decodeBMPImage(buf: ArrayBuffer, name: string): Promise<DecodedImage> {
  const bitmap = await decodeBMP(buf);
  return { bitmap, width: bitmap.width, height: bitmap.height, name };
}
