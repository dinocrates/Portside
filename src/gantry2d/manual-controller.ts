// Manual controller for the 2D gantry — two independent axis directions
// (X and Y can be held simultaneously for diagonal motion, claw-machine
// style), each governed the same way as the 1D lab's manual controller:
// accelerate toward the limit, then hold (command zero), never keep
// pushing at the actuator limit once already at cruise speed. That
// "governed cruise" behavior was a real bug found and fixed in the 1D
// lab (see src/controllers/manual-controller.ts) — applied here from the
// start rather than re-discovering it.

import type { GantryControlCommand } from './model/commands';
import type { GantryScenarioConfig } from './scenario';
import type { GantrySnapshot } from './model/snapshot';
import { DEFAULT_TOLERANCES } from '../sim/model/parameters';

export type AxisDirection = 'none' | 'negative' | 'positive';

// See the identical comment in src/controllers/manual-controller.ts: an
// *exact* >= against a cap reached via ~hundreds of accumulated float
// additions can land a hair under it, letting one more full-accel step
// through and genuinely overshooting — this epsilon is what closes that.
const CRUISE_EPS = DEFAULT_TOLERANCES.floatEquality;

function governedAxisCommand(
  direction: AxisDirection,
  v_mps: number,
  maxAccel: number,
  maxSpeed: number,
): number {
  if (direction === 'positive') {
    if (v_mps < 0) return maxAccel; // braking before reversal
    if (v_mps >= maxSpeed - CRUISE_EPS) return 0; // governed cruise — see file header
    return maxAccel;
  }
  if (direction === 'negative') {
    if (v_mps > 0) return -maxAccel;
    if (v_mps <= -maxSpeed + CRUISE_EPS) return 0;
    return -maxAccel;
  }
  // Released: brake toward zero, not an instant stop.
  if (Math.abs(v_mps) < 1e-9) return 0;
  return v_mps > 0 ? -maxAccel : maxAccel;
}

export class GantryManualController {
  private xDirection: AxisDirection = 'none';
  private yDirection: AxisDirection = 'none';
  private scenario: GantryScenarioConfig | null = null;

  setXDirection(direction: AxisDirection): void {
    this.xDirection = direction;
  }

  setYDirection(direction: AxisDirection): void {
    this.yDirection = direction;
  }

  reset(scenario: GantryScenarioConfig): void {
    this.scenario = scenario;
    this.xDirection = 'none';
    this.yDirection = 'none';
  }

  command(snapshot: GantrySnapshot): GantryControlCommand {
    if (!this.scenario) return { targetAxAccel_mps2: 0, targetAyAccel_mps2: 0 };
    const maxAccel = this.scenario.limits.maxAcceleration_mps2;
    const maxSpeed = this.scenario.limits.maxSpeed_mps;
    return {
      targetAxAccel_mps2: governedAxisCommand(this.xDirection, snapshot.vx_mps, maxAccel, maxSpeed),
      targetAyAccel_mps2: governedAxisCommand(this.yDirection, snapshot.vy_mps, maxAccel, maxSpeed),
    };
  }
}
