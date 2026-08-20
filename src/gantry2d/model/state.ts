// State model for the 2D overhead gantry lab — a separate, related
// assignment from the ship-to-shore trolley lab (src/sim), not a
// modification of it: a genuine two-axis "claw machine" / bridge-crane
// mechanic viewed from above, X and Y each independently controllable.
//
// Deliberately reuses TrolleyState and RunState from the existing 1D sim
// rather than inventing parallel types — a single axis of "position,
// velocity, acceleration, commanded acceleration, all clamped to limits"
// is exactly what TrolleyState already is, and the run lifecycle
// (ready/running/paused/complete/failed) is identical. Only the *shape*
// of the aggregate state (two axes instead of one) is new.

import type { RunState, TrolleyState } from '../../sim/model/state';

export interface GantryState {
  time_s: number;
  runState: RunState;
  axisX: TrolleyState;
  axisY: TrolleyState;
}
