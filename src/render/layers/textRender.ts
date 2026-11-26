import type { TextProps } from '../../types';

let measureCanvas: HTMLCanvasElement | null = null;
function measureCtx(): CanvasRenderingContext2D {
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas');
    measureCanvas.width = 8;
    measureCanvas.height = 8;
  }
  return measureCanvas.getContext('2d')!;
}

/** Build a CSS font shorthand from text props. */
export function fontString(t: TextProps): string {
  const style = t.italic ? 'italic ' : '';
  const weight = t.bold ? '700' : '400';
  const families = t.fontFamily.split(',').map((f) => {
    const p = f.trim();
    return /^[\w-]+$/.test(p) ? p : `"${p.replace(/"/g, '')}"`;
  });
  return `${style}${weight} ${t.fontSize}px ${families.join(', ')}`;
}

/** Chromium supports ctx.letterSpacing; other engines get a manual fallback. */
function nativeLetterSpacing(ctx: CanvasRenderingContext2D): boolean {
  return 'letterSpacing' in ctx;
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number) {
  if (nativeLetterSpacing(ctx)) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
  }
}

/** Advance width of a string honoring letterSpacing. */
export function measureLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  letterSpacing: number,
): number {
  if (letterSpacing === 0 || nativeLetterSpacing(ctx)) {
    setLetterSpacing(ctx, letterSpacing);
    return ctx.measureText(line).width;
  }
  if (line.length === 0) return 0;
  let w = 0;
  for (const ch of line) w += ctx.measureText(ch).width;
  return w + letterSpacing * (line.length - 1);
}

/** Draw a single line at (x, y-baseline) honoring letterSpacing + align offset already applied. */
function drawLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  letterSpacing: number,
) {
  if (letterSpacing === 0 || nativeLetterSpacing(ctx)) {
    setLetterSpacing(ctx, letterSpacing);
    ctx.fillText(line, x, y);
    return;
  }
  let cx = x;
  for (const ch of line) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + letterSpacing;
  }
}

/** Word-wrap `text` to `maxWidth` px using the context's current font. */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  letterSpacing = 0,
): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) { out.push(''); continue; }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${line} ${words[i]}`;
      if (measureLine(ctx, candidate, letterSpacing) <= maxWidth) {
        line = candidate;
      } else {
        out.push(line);
        line = words[i];
      }
    }
    out.push(line);
  }
  return out;
}

export interface TextLayout {
  lines: string[];
  /** Natural text-block size in px (excludes shadow/bg padding). */
  w: number;
  h: number;
  lineHeightPx: number;
}

/** Measure wrapped lines for the given text props. */
export function layoutText(t: TextProps, maxWidth = t.wrapWidth ?? 480): TextLayout {
  const ctx = measureCtx();
  ctx.font = fontString(t);
  const lines = wrapText(ctx, t.content, Math.max(1, maxWidth), t.letterSpacing);
  let w = 0;
  for (const l of lines) w = Math.max(w, measureLine(ctx, l, t.letterSpacing));
  const lineHeightPx = t.fontSize * (t.lineHeight > 0 ? t.lineHeight : 1.2);
  const h = Math.max(lineHeightPx, lines.length * lineHeightPx);
  return { lines, w: Math.ceil(w), h: Math.ceil(h), lineHeightPx };
}

export interface RasterizedText {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

/** Rasterize a text layer's props to a canvas sized to the text bounds. */
export function rasterizeText(t: TextProps, maxWidth = t.wrapWidth ?? 480): RasterizedText {
  const layout = layoutText(t, maxWidth);
  const pad = t.shadow
    ? Math.ceil(t.shadow.blur + Math.max(Math.abs(t.shadow.dx), Math.abs(t.shadow.dy)))
    : 0;
  const w = Math.max(1, layout.w + pad * 2);
  const h = Math.max(1, layout.h + pad * 2);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.font = fontString(t);
  ctx.fillStyle = t.color;
  ctx.textBaseline = 'alphabetic';

  if (t.bgColor && (t.bgOpacity ?? 1) > 0) {
    ctx.save();
    ctx.globalAlpha = t.bgOpacity ?? 1;
    ctx.fillStyle = t.bgColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.fillStyle = t.color;
  }

  if (t.shadow) {
    ctx.shadowColor = t.shadow.color;
    ctx.shadowBlur = t.shadow.blur;
    ctx.shadowOffsetX = t.shadow.dx;
    ctx.shadowOffsetY = t.shadow.dy;
  }

  const lineH = layout.lineHeightPx;
  const ascent = ctx.measureText('Mg').actualBoundingBoxAscent || t.fontSize * 0.8;
  let baseY = pad + ascent;
  for (const line of layout.lines) {
    const lw = measureLine(ctx, line, t.letterSpacing);
    let x = pad;
    if (t.align === 'center') x += (layout.w - lw) / 2;
    else if (t.align === 'right') x += layout.w - lw;
    drawLine(ctx, line, x, baseY, t.letterSpacing);
    baseY += lineH;
  }

  return { canvas, w, h };
}
