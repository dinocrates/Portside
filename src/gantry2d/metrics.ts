// Requirement evaluation for the 2D gantry lab — same factual,
// no-collapsed-score philosophy as the 1D lab (spec §7, §9.3), scaled
// down to a fixed set of requirements rather than a scenario-configurable
// list, since this lab doesn't have a scoring-config schema yet.

import type { GantryScenarioConfig } from './scenario';
import type { GantryState } from './model/state';
import type { RequirementResult } from '../sim/model/snapshot';
import type { TrolleyStepResult } from '../sim/physics/trolley';

export interface GantryRequirementEvaluation {
  results: RequirementResult[];
  failed: boolean;
  completionConditionsMet: boolean;
}

export function evaluateGantryRequirements(
  scenario: GantryScenarioConfig,
  state: GantryState,
  stepX: TrolleyStepResult,
  stepY: TrolleyStepResult,
): GantryRequirementEvaluation {
  const dx = state.axisX.x_m - scenario.geometry.targetX_m;
  const dy = state.axisY.x_m - scenario.geometry.targetY_m;
  const distanceToTarget_m = Math.hypot(dx, dy);
  const speed_mps = Math.hypot(state.axisX.vx_mps, state.axisY.vx_mps);

  const finalPositionOk = distanceToTarget_m <= scenario.geometry.targetTolerance_m;
  const finalSpeedOk = speed_mps <= scenario.limits.finalSpeedTolerance_mps;
  const speedOk = !stepX.velocityExceededSpeed && !stepY.velocityExceededSpeed;
  const accelerationOk = !stepX.commandExceededAcceleration && !stepY.commandExceededAcceleration;
  const envelopeOk = !stepX.hitEnvelope && !stepY.hitEnvelope;

  const results: RequirementResult[] = [
    {
      id: 'final-position',
      description: 'Claw must be within target tolerance of the prize.',
      satisfied: finalPositionOk,
      atTime_s: state.time_s,
      detail: `distance ${distanceToTarget_m.toFixed(3)} m, tolerance ${scenario.geometry.targetTolerance_m.toFixed(3)} m`,
    },
    {
      id: 'final-speed',
      description: 'Claw must be within final-speed tolerance of rest.',
      satisfied: finalSpeedOk,
      atTime_s: state.time_s,
      detail: `speed ${speed_mps.toFixed(3)} m/s, tolerance ${scenario.limits.finalSpeedTolerance_mps.toFixed(3)} m/s`,
    },
    {
      id: 'max-speed',
      description: 'Neither axis may exceed the configured maximum speed.',
      satisfied: speedOk,
      atTime_s: state.time_s,
    },
    {
      id: 'max-acceleration',
      description: 'Neither axis may exceed the configured maximum acceleration.',
      satisfied: accelerationOk,
      atTime_s: state.time_s,
    },
    {
      id: 'travel-envelope',
      description: 'The claw must remain within the playfield envelope on both axes.',
      satisfied: envelopeOk,
      atTime_s: state.time_s,
    },
  ];

  return {
    results,
    failed: !speedOk || !accelerationOk || !envelopeOk,
    completionConditionsMet: finalPositionOk && finalSpeedOk,
  };
}
