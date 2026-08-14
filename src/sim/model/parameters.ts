// Centralized numerical tolerances. Spec §8.8: "Do not scatter unexplained
// epsilon constants through the codebase." Everything that needs an
// epsilon imports it from here. Per-scenario limits (max speed, max
// acceleration, target tolerance, etc.) live in ScenarioConfig — this file
// is for tolerances that are properties of the simulation itself, not of
// any one scenario.

export interface SimulationTolerances {
  /** Generic position comparison tolerance, used where a scenario doesn't supply its own (m). */
  positionComparison_m: number;
  /** Speed below which the trolley is considered "at rest" (m/s). */
  velocityAtRest_mps: number;
  /** Angle below which suspended load is considered "at rest" (rad). */
  angleAtRest_rad: number;
  /** Floating-point equality tolerance for tests (dimensionless). */
  floatEquality: number;
  /** Contact tolerance for collision checks (m). */
  collisionContact_m: number;
  /** Longest single browser-frame gap the fixed-step accumulator will catch up on before pausing instead (s). */
  maxAcceptedFrameGap_s: number;
}

export const DEFAULT_TOLERANCES: Readonly<SimulationTolerances> = Object.freeze({
  positionComparison_m: 0.01,
  velocityAtRest_mps: 0.02,
  angleAtRest_rad: 0.01,
  floatEquality: 1e-9,
  collisionContact_m: 0.02,
  maxAcceptedFrameGap_s: 0.25,
});

/** Recommended fixed physics step (spec §8.2, §17). */
export const DEFAULT_PHYSICS_DT_S = 1 / 120;

/** Recommended analysis sample rate (spec §8.2, §17): one sample every N physics steps at 120 Hz physics / 30 Hz sampling. */
export const DEFAULT_SAMPLE_RATE_HZ = 30;
