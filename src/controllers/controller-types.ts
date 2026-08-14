// Controller contract (spec §11.4). Manual input and an automated profile
// are interchangeable implementations of this interface — the engine and
// renderer never know which one produced a given ControlCommand.

import type { ControlCommand } from '../sim/model/commands';
import type { ScenarioConfig } from '../scenarios/schema';
import type { SimulationSnapshot } from '../sim/model/snapshot';

export interface Controller {
  reset(snapshot: SimulationSnapshot, scenario: ScenarioConfig): void;
  command(snapshot: SimulationSnapshot, dt_s: number): ControlCommand;
  isFinished(snapshot: SimulationSnapshot): boolean;
}
