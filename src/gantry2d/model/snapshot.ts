import type { RunState } from '../../sim/model/state';
import type { RequirementResult } from '../../sim/model/snapshot';

export interface GantrySnapshot {
  time_s: number;
  runState: RunState;
  /** Set by GantryOrchestrator, not the engine, when an automated profile is active — same overlay pattern as the 1D lab's SimulationSnapshot.activePhaseId (ADR-0001: the engine has no concept of controller-owned "phases"). */
  activePhaseId?: string | null;

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
