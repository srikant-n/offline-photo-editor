export interface CanvasSize {
  width: number;
  height: number;
  /** CSS color used to fill areas not covered by the image. */
  background: string;
}

export interface CropRect {
  /** Crop rectangle in source-image pixel coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation of the crop rect about its center, degrees (y-down, clockwise+). */
  angle?: number;
}

export type Rotate90 = 0 | 90 | 180 | 270;

export interface TransformState {
  /** Clockwise quarter-turns. */
  rotate90: Rotate90;
  flipH: boolean;
  flipV: boolean;
}

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
}

export type ToolMode = 'select' | 'crop' | 'transform' | 'adjust';

/** Geometry parameters used by the renderer (draft-aware). */
export interface GeoParams {
  crop?: CropRect;
  straighten: number;
  transform: TransformState;
  outW: number;
  outH: number;
  background: string;
}
