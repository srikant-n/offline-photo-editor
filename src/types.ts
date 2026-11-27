/** Dimensions of the output canvas plus the background color used where no content covers. */
export interface CanvasSize {
  width: number;
  height: number;
  /** CSS color used to fill areas not covered by the image. */
  background: string;
}

/** Axis-aligned rectangle in source-image pixel coordinates used for cropping. */
export interface CropRect {
  /** Crop rectangle in source-image pixel coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation of the crop rect about its center, degrees (y-down, clockwise+). */
  angle?: number;
}

/** Allowed quarter-turn rotation values (multiples of 90 degrees). */
export type Rotate90 = 0 | 90 | 180 | 270;

/** Discrete transform operations applied to the source image. */
export interface TransformState {
  /** Clockwise quarter-turns. */
  rotate90: Rotate90;
  flipH: boolean;
  flipV: boolean;
}

/** Tone, color, and detail adjustments applied to the source image. */
export interface AdjustmentState {
  /** Exposure in EV stops, -3..3 */
  exposure: number;
  /** -100..100 */
  brightness: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  saturation: number;
  vibrance: number;
  /** Warm/cool, -100 (cool) .. 100 (warm) */
  temperature: number;
  /** 0..100 unsharp amount */
  sharpness: number;
}

/** Blend modes supported for compositing layers, matching CSS global-composite-operation names. */
export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
  | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference'
  | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

/** Kinds of layers supported in the layer stack. */
export type LayerType = 'image' | 'raster' | 'text' | 'shape';

/** Drop-shadow parameters for text layers. */
export interface TextShadow {
  color: string;
  blur: number;
  dx: number;
  dy: number;
}

/** Typography and style properties for text layers. */
export interface TextProps {
  content: string;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
  align: 'left' | 'center' | 'right';
  /** Letter spacing in px. */
  letterSpacing: number;
  /** Line height multiplier. */
  lineHeight: number;
  /** Wrap width in px; defaults to a standard width when unset. */
  wrapWidth?: number;
  shadow?: TextShadow;
  bgColor?: string;
  bgOpacity?: number;
}

/** Vector shape properties for shape layers. */
export interface ShapeProps {
  kind: 'rect' | 'ellipse' | 'line' | 'arrow';
  color: string;
  strokeWidth: number;
  /** Optional fill color; undefined = stroke only (except rect/ellipse default fill?). */
  fill?: string;
}

/** A single layer in the compositing stack, bottom→top. */
export interface Layer {
  id: string;
  type: LayerType;
  name: string;
  visible: boolean;
  /** 0..1 */
  opacity: number;
  blendMode: BlendMode;
  /** Reserved for future rotate/scale of individual layers. */
  rotation?: number;
  scale?: number;
  /** Placement rect in output-image px (top-left + dims). */
  x: number; y: number; w: number; h: number;
  /** Raster content — the layer's own canvas (undefined until drawn). */
  canvas?: HTMLCanvasElement;
  text?: TextProps;
  shape?: ShapeProps;
}

/** The complete editor state: source image plus all edits and canvas settings. */
export interface Document {
  /** Decoded source image (GPU-friendly). */
  source: ImageBitmap;
  sourceName: string;
  canvas: CanvasSize;
  /** When true, canvas auto-sizes to the transformed image bounds. */
  canvasAuto: boolean;
  crop?: CropRect;
  /** Arbitrary straighten angle in degrees (-45..45). */
  straighten: number;
  transform: TransformState;
  adjustments: AdjustmentState;
  /**
   * Composite layers, bottom→top. Index 0 is the pseudo image layer
   * (type 'image', locked): the adjusted source rendered via the GL/2D
   * pipeline. Raster/text/shape layers sit on top in array order.
   */
  layers: Layer[];
}

/** Editor tool modes selectable from the tool rail. */
export type ToolMode =
  | 'select' | 'crop' | 'transform' | 'adjust'
  | 'text' | 'brush' | 'shape' | 'eyedropper' | 'preset';

/** Geometry parameters used by the renderer to compute output-image dimensions (draft-aware). */
export interface GeoParams {
  crop?: CropRect;
  straighten: number;
  transform: TransformState;
  outW: number;
  outH: number;
  background: string;
}
