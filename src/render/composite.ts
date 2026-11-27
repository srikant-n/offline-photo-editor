import type { BlendMode, Document, Layer } from '../types';

/** Maps each BlendMode to the equivalent Canvas2D globalCompositeOperation. */
const BLEND_MAP: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
};

/** Converts a BlendMode to the matching Canvas2D globalCompositeOperation. */
export function blendModeToComposite(mode: BlendMode): GlobalCompositeOperation {
  return BLEND_MAP[mode] ?? 'source-over';
}

/** Options controlling how {@link compositeLayers} draws the layer stack. */
export interface CompositeOptions {
  /** Render the pre-adjustment base and skip all layers (before/after). */
  before?: boolean;
  /**
   * Pixels-per-output-px scale for layer placement. The base canvas is drawn
   * at its natural size; layer x/y/w/h are in output-image px and are
   * multiplied by `scale`.
   */
  scale?: number;
  /** Hide all non-image layers (e.g. while cropping). */
  hideLayers?: boolean;
  /**
   * In-progress brush stroke: drawn at its layer's position in stack order,
   * replacing that layer's stored canvas for this frame.
   */
  liveStroke?: { layerId: string; canvas: HTMLCanvasElement };
}

/**
 * Composite the document onto `out`: base image pass first, then each
 * visible layer[1..n] in array order (later = higher) with its opacity and
 * blend mode. Shared by the viewport, export, and eyedropper sampling.
 */
export function compositeLayers(
  base: CanvasImageSource,
  doc: Document,
  out: CanvasRenderingContext2D,
  opts: CompositeOptions = {},
): void {
  const s = opts.scale ?? 1;
  out.globalAlpha = 1;
  out.globalCompositeOperation = 'source-over';
  out.drawImage(base, 0, 0);
  if (opts.before || opts.hideLayers) return;

  const live = opts.liveStroke;
  for (let i = 1; i < doc.layers.length; i++) {
    const layer = doc.layers[i];
    if (!layer.visible) continue;
    const canvas = live && live.layerId === layer.id ? live.canvas : layer.canvas;
    if (!canvas) continue;
    out.globalAlpha = layer.opacity;
    out.globalCompositeOperation = blendModeToComposite(layer.blendMode);
    out.drawImage(canvas, layer.x * s, layer.y * s, layer.w * s, layer.h * s);
  }
  out.globalAlpha = 1;
  out.globalCompositeOperation = 'source-over';
}

/** Hit-test helper: is output-space point (x,y) inside a layer's rect? */
export function layerContains(layer: Layer, x: number, y: number): boolean {
  return x >= layer.x && x <= layer.x + layer.w && y >= layer.y && y <= layer.y + layer.h;
}
