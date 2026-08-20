import type { RunState } from '../../sim/model/state';
import type { RequirementResult } from '../../sim/model/snapshot';

export interface GantrySnapshot {
  time_s: number;
  runState: RunState;

  x_m: number;
  vx_mps: number;
  ax_mps2: number;
  commanded_ax_mps2: number;

  y_m: number;
  vy_mps: number;
  ay_mps2: number;
  commanded_ay_mps2: number;

  /** Present once the run has reached a terminal state — same convention as the 1D lab's SimulationSnapshot. */
  requirementResults?: RequirementResult[];
}
