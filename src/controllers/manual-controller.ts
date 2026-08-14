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

export type ManualDirection = 'none' | 'left' | 'right';

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

    const brakingMagnitude = this.scenario.limits.maxAcceleration_mps2;
    const vx = snapshot.trolley_v_mps;

    let targetTrolleyAcceleration_mps2: number;
    if (this.direction === 'left') {
      // Pressing the opposite direction commands braking before reversal (spec §6.2).
      targetTrolleyAcceleration_mps2 = vx > 0 ? -brakingMagnitude : -this.scenario.limits.maxAcceleration_mps2;
    } else if (this.direction === 'right') {
      targetTrolleyAcceleration_mps2 = vx < 0 ? brakingMagnitude : this.scenario.limits.maxAcceleration_mps2;
    } else {
      // Released: brake toward zero velocity, not an instant stop.
      if (Math.abs(vx) < 1e-9) {
        targetTrolleyAcceleration_mps2 = 0;
      } else {
        targetTrolleyAcceleration_mps2 = vx > 0 ? -brakingMagnitude : brakingMagnitude;
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
