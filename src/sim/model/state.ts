// Core simulation state. SI units only — never pixels. See spec §8.1 and
// AGENTS.md rule 2. This file is contract-owned by the integration lead
// (see AGENTS.md); other workstreams read it, they don't change its shape
// without a reviewed contract change.

/** Lifecycle state of a run, per spec §7 (state diagram). */
export type RunState = 'ready' | 'running' | 'paused' | 'complete' | 'failed';

/** Horizontal trolley state (spec §8.3). Always present. */
export interface TrolleyState {
  x_m: number;
  vx_mps: number;
  ax_mps2: number;
  commandedAx_mps2: number;
}

/**
 * Vertical hoist state (spec §8.4), expressed as cable length — the
 * implementation team's preferred representation because it integrates
 * naturally with the sway model. Reserved for Milestone 4; absent while
 * `scenario.features.verticalMotion` is false.
 */
export interface HoistState {
  cableLength_m: number;
  cableSpeed_mps: number;
  cableAcceleration_mps2: number;
}

/**
 * Suspended-load sway state (spec §8.5), a damped pendulum from the moving
 * trolley. Reserved for Milestone 4; absent while `scenario.features.sway`
 * is false.
 */
export interface SwayState {
  theta_rad: number;
  omega_radps: number;
  alpha_radps2: number;
}

/** Internal cargo-shift state (spec §8.6). Reserved for Milestone 4. */
export type CargoContactState = 'fixed' | 'sliding' | 'impacted';

export interface CargoState {
  cargoOffset_m: number;
  cargoRelativeVelocity_mps: number;
  cargoState: CargoContactState;
  cumulativeDamage: number;
}

export type AttachmentState = 'detached' | 'attaching' | 'attached' | 'releasing' | 'fault';

/**
 * The full authoritative simulation state at one instant. `hoist`, `sway`,
 * and `cargo` are optional because the first kinematics release only models
 * horizontal trolley motion (spec §4.1) — later milestones populate them
 * once the corresponding scenario feature flag is enabled.
 */
export interface SimulationState {
  time_s: number;
  runState: RunState;
  trolley: TrolleyState;
  hoist?: HoistState;
  sway?: SwayState;
  cargo?: CargoState;
  attachment: AttachmentState;
  /** Id of the automated profile phase currently active, if any. */
  activePhaseId: string | null;
}
