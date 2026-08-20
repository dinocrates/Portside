// The one documented physics-to-pixel transform for the overhead gantry
// lab (mirrors src/renderer/coordinate-transform.ts's role for the 1D
// lab — spec §8.1's discipline applies here too even though this lab
// isn't part of the numbered spec yet: never store physics values in
// pixels, derive pixels in exactly one place).
//
// Physics convention: X increases rightward on screen (unchanged from
// the 1D lab). Y increases "away/up" on screen — standard top-down map
// convention — so pixel Y is *inverted* relative to physics Y.

import type { GantryScenarioConfig } from '../scenario';

export const SCENE_WIDTH_PX = 960;
export const SCENE_HEIGHT_PX = 540;

const MARGIN_PX = 60;

export interface CoordinateTransform2D {
  toPixels(x_m: number, y_m: number): { x: number; y: number };
  readonly metersPerPixel: number;
  readonly fieldPixelRect: { left: number; top: number; width: number; height: number };
}

export function createCoordinateTransform2D(scenario: GantryScenarioConfig): CoordinateTransform2D {
  const { minX_m, maxX_m, minY_m, maxY_m } = scenario.geometry;
  const spanX_m = maxX_m - minX_m;
  const spanY_m = maxY_m - minY_m;

  const availableWidth_px = SCENE_WIDTH_PX - MARGIN_PX * 2;
  const availableHeight_px = SCENE_HEIGHT_PX - MARGIN_PX * 2;

  // Uniform scale on both axes — a claw machine field shouldn't stretch
  // non-uniformly — sized to whichever axis is the tighter fit.
  const scale_pxPerM = Math.min(availableWidth_px / spanX_m, availableHeight_px / spanY_m);

  const fieldWidth_px = spanX_m * scale_pxPerM;
  const fieldHeight_px = spanY_m * scale_pxPerM;
  const left_px = (SCENE_WIDTH_PX - fieldWidth_px) / 2;
  const top_px = (SCENE_HEIGHT_PX - fieldHeight_px) / 2;

  function toPixels(x_m: number, y_m: number): { x: number; y: number } {
    return {
      x: left_px + (x_m - minX_m) * scale_pxPerM,
      y: top_px + fieldHeight_px - (y_m - minY_m) * scale_pxPerM,
    };
  }

  return {
    toPixels,
    metersPerPixel: 1 / scale_pxPerM,
    fieldPixelRect: { left: left_px, top: top_px, width: fieldWidth_px, height: fieldHeight_px },
  };
}
