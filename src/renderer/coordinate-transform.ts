// The one documented physics-to-pixel transform (spec §8.1: "Renderer
// coordinates are derived from physics coordinates through one documented
// transform" — never store physics values in pixels, and never derive
// pixels anywhere but here). Spec §5.5: logical scene is 960x540 (16:9).
//
// Vertical placement is fixed-row for now (Milestone 0/1 scope: no hoist
// motion), not derived from `y_m` — there's nothing to transform yet.
// Milestone 4 adds a real y_m -> pixel mapping alongside cable length.

import type { ScenarioConfig } from '../scenarios/schema';

export const SCENE_WIDTH_PX = 960;
export const SCENE_HEIGHT_PX = 540;

const HORIZONTAL_MARGIN_PX = 60;

// Vertical scene rows (rail height, container drop, ground line) are no
// longer fixed constants here — once real crane art landed (Milestone 3),
// CraneScene derives them from the art's own measured proportions instead
// (see CRANE_GROUND_Y_PX / CRANE_RAIL_FRACTION in crane-scene.ts), so the
// trolley/spreader/container line up with whatever the structure sprite
// actually looks like rather than an independent guess.

export interface CoordinateTransform {
  /** Convert an authoritative physics x (meters, spec §8.1 convention: positive ship→shore) to a scene-pixel x. */
  xToPixels(x_m: number): number;
  readonly metersPerPixel: number;
}

export function createCoordinateTransform(scenario: ScenarioConfig): CoordinateTransform {
  const minX_m = scenario.geometry.trolleyMinX_m;
  const span_m = scenario.geometry.trolleyMaxX_m - minX_m;
  const span_px = SCENE_WIDTH_PX - HORIZONTAL_MARGIN_PX * 2;
  const metersPerPixel = span_m / span_px;

  function xToPixels(x_m: number): number {
    const fraction = (x_m - minX_m) / span_m;
    return HORIZONTAL_MARGIN_PX + fraction * span_px;
  }

  return { xToPixels, metersPerPixel };
}
