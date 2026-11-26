/**
 * Sample the composite render at an output-image-space point.
 * `src` is the already-composited canvas (e.g. the viewport composite
 * canvas); `outW/outH` are the output-image dims the canvas represents.
 */
export function samplePixel(
  src: HTMLCanvasElement,
  imgX: number,
  imgY: number,
  outW: number,
  outH: number,
): string | null {
  const px = Math.floor((imgX / outW) * src.width);
  const py = Math.floor((imgY / outH) * src.height);
  if (px < 0 || py < 0 || px >= src.width || py >= src.height) return null;
  const ctx = src.getContext('2d');
  if (!ctx) return null;
  const d = ctx.getImageData(px, py, 1, 1).data;
  const hex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${hex(d[0])}${hex(d[1])}${hex(d[2])}`;
}
