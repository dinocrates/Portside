// Manual controller (spec §6.2). Converts held-key state into a target
// acceleration/braking command that already respects the scenario's
// actuator limits — the engine treats this exactly like an automated
// command (AGENTS.md rule 5). Key-event wiring (keydown/keyup → this
// controller's held-direction state) belongs to the UI workstream in
// `src/ui`; this class only knows about direction state, not DOM events.

import { NEUTRAL_COMMAND, type ControlCommand } from '../sim/model/commands';
import type { ScenarioConfig } from '../scenarios/schema';
import type { SimulationSnapshot } from '../sim/model/snapshot';
import type { Controller } from './controller-types';
import { DEFAULT_TOLERANCES } from '../sim/model/parameters';

export type ManualDirection = 'none' | 'left' | 'right';

// A governed-cruise decision ("are we already at the cap?") needs the
// same epsilon tolerance as the physics layer's own limit comparisons
// (src/sim/physics/trolley.ts) — an *exact* `>=` against a value reached
// via ~hundreds of accumulated floating-point additions can land a
// hair under the true cap (e.g. 2.499999999999998 instead of 2.5),
// which would otherwise let one more full-acceleration step through and
// genuinely overshoot by a whole step's worth of velocity — not float
// noise, a real overshoot — and spuriously fail the run. Caught by a
// synthetic fixed-step unit test landing exactly on that boundary; real
// browser frame timing rarely lands exactly there, which is why this
// stayed latent until the 2D gantry lab's tests exposed it.
const CRUISE_EPS = DEFAULT_TOLERANCES.floatEquality;

export class ManualController implements Controller {
  private direction: ManualDirection = 'none';
  private scenario: ScenarioConfig | null = null;

  /** Called by the UI's key handler on every keydown/keyup that changes held direction. */
  setDirection(direction: ManualDirection): void {
    this.direction = direction;
  }

  reset(_snapshot: SimulationSnapshot, scenario: ScenarioConfig): void {
    this.scenario = scenario;
    this.direction = 'none';
  }

  command(snapshot: SimulationSnapshot, _dt_s: number): ControlCommand {
    if (!this.scenario) return NEUTRAL_COMMAND;

    // Braking uses the same actuator limit as accelerating — one physical
    // actuator, one magnitude — kept as a single name since spec §17's
    // "manual braking magnitude" is defined equal to maxAcceleration_mps2.
    const maxAccel = this.scenario.limits.maxAcceleration_mps2;
    const maxSpeed = this.scenario.limits.maxSpeed_mps;
    const vx = snapshot.trolley_v_mps;

    let targetTrolleyAcceleration_mps2: number;
    if (this.direction === 'left') {
      // Pressing the opposite direction commands braking before reversal (spec §6.2).
      if (vx > 0) {
        targetTrolleyAcceleration_mps2 = -maxAccel;
      } else if (vx <= -maxSpeed + CRUISE_EPS) {
        // Already governed at manual cruise speed — hold it, don't keep
        // commanding full accel. Continuing to push here doesn't move the
        // trolley any faster (the physics clamp already caps it), it only
        // makes every subsequent step read as an attempted overshoot,
        // which would spuriously fail the run's max-speed requirement —
        // see src/sim/physics/trolley.ts's velocityExceededSpeed check.
        targetTrolleyAcceleration_mps2 = 0;
      } else {
        targetTrolleyAcceleration_mps2 = -maxAccel;
      }
    } else if (this.direction === 'right') {
      if (vx < 0) {
        targetTrolleyAcceleration_mps2 = maxAccel;
      } else if (vx >= maxSpeed - CRUISE_EPS) {
        targetTrolleyAcceleration_mps2 = 0; // governed cruise — see the mirrored comment above
      } else {
        targetTrolleyAcceleration_mps2 = maxAccel;
      }
    } else {
      // Released: brake toward zero velocity, not an instant stop.
      if (Math.abs(vx) < 1e-9) {
        targetTrolleyAcceleration_mps2 = 0;
      } else {
        targetTrolleyAcceleration_mps2 = vx > 0 ? -maxAccel : maxAccel;
      }
    }

    return {
      targetTrolleyAcceleration_mps2,
      targetHoistAcceleration_mps2: 0,
      attachmentCommand: 'none',
    };
  }

  // Manual mode has no automatic "done" condition (spec §6.1) — the run
  // ends via explicit Stop/Reset from the shared run controls, not here.
  isFinished(_snapshot: SimulationSnapshot): boolean {
    return false;
  }
}
