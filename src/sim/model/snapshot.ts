// The read-only value handed from the engine to everything downstream
// (renderer, recorder, UI). Spec §9.1 (recorded sample fields) and §11.4/
// §11.5 (renderer and analysis own only interpolation/derived views, never
// physics). Treat every SimulationSnapshot as immutable.

import type { AttachmentState, CargoContactState, RunState } from './state';

/** One violated or satisfied requirement, evaluated against scenario scoring config (spec §7.1, §7.2, §9.3). */
export interface RequirementResult {
  id: string;
  description: string;
  satisfied: boolean;
  /** Optional human-readable detail, e.g. "reached 4.3 m/s, limit 4.0 m/s". */
  detail?: string;
  /** Simulation time the requirement was evaluated or violated, if applicable. */
  atTime_s?: number;
}

/**
 * A fully self-describing simulation sample. Field names and units mirror
 * spec §9.1 exactly so the recorder, CSV export, and this type never drift
 * apart.
 */
export interface SimulationSnapshot {
  time_s: number;
  runState: RunState;
  activePhaseId: string | null;

  trolley_x_m: number;
  trolley_v_mps: number;
  trolley_a_mps2: number;
  commanded_trolley_a_mps2: number;

  cable_length_m?: number;
  hoist_v_mps?: number;

  load_angle_rad?: number;
  load_angular_velocity_radps?: number;

  cargo_offset_m?: number;
  cargo_relative_velocity_mps?: number;
  cargo_state?: CargoContactState;
  cumulative_damage?: number;

  attachment: AttachmentState;

  /**
   * Present once the run has reached a terminal state (`complete` or
   * `failed`). Absent while running — students should not see the verdict
   * mid-run.
   */
  requirementResults?: RequirementResult[];
}
