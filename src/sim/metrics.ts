// Run metrics tracking and requirement evaluation. Spec §9.3 ("report
// factual metrics, not a mysterious composite score") and §7 (completion /
// failure conditions, each with a concrete identified cause).
//
// Scope note (Milestone 0/1): only the horizontal-trolley-relevant
// requirement kinds are evaluated here. `finalAngle`, `maxCargoOffset`,
// `maxCargoDamage`, and `noCollision` are recognized by the schema for
// forward compatibility but are no-ops (always satisfied) until sway,
// cargo-shift, and collision physics land in Milestone 4 — enabling a
// scenario's corresponding feature flag without the physics behind it yet
// would silently under-simulate rather than fail loudly, so this file
// treats them as "not yet modeled" rather than pretending to check them.

import type { RequirementConfig, ScenarioConfig } from '../scenarios/schema';
import type { SimulationState } from './model/state';
import type { RequirementResult } from './model/snapshot';

export interface RunMetricsTracker {
  maxAbsSpeed_mps: number;
  maxAbsAcceleration_mps2: number;
  /** Seconds the completion conditions (position/speed at target, at rest) have held continuously. */
  dwellHeld_s: number;
}

export function createMetricsTracker(): RunMetricsTracker {
  return { maxAbsSpeed_mps: 0, maxAbsAcceleration_mps2: 0, dwellHeld_s: 0 };
}

export function updateMetricsTracker(tracker: RunMetricsTracker, state: SimulationState): void {
  tracker.maxAbsSpeed_mps = Math.max(tracker.maxAbsSpeed_mps, Math.abs(state.trolley.vx_mps));
  tracker.maxAbsAcceleration_mps2 = Math.max(
    tracker.maxAbsAcceleration_mps2,
    Math.abs(state.trolley.ax_mps2),
  );
}

function evaluateOne(
  req: RequirementConfig,
  scenario: ScenarioConfig,
  state: SimulationState,
  tracker: RunMetricsTracker,
  stepViolations: { commandExceededAcceleration: boolean; velocityExceededSpeed: boolean; hitEnvelope: boolean },
): RequirementResult {
  const base = { id: req.id, description: req.description, atTime_s: state.time_s };

  switch (req.kind) {
    case 'finalPosition': {
      const tolerance = req.value ?? scenario.geometry.targetTolerance_m;
      const error_m = Math.abs(state.trolley.x_m - scenario.geometry.targetX_m);
      return {
        ...base,
        satisfied: error_m <= tolerance,
        detail: `error ${error_m.toFixed(3)} m, tolerance ${tolerance.toFixed(3)} m`,
      };
    }
    case 'finalSpeed': {
      const tolerance = req.value ?? scenario.limits.finalSpeedTolerance_mps;
      const speed_mps = Math.abs(state.trolley.vx_mps);
      return {
        ...base,
        satisfied: speed_mps <= tolerance,
        detail: `speed ${speed_mps.toFixed(3)} m/s, tolerance ${tolerance.toFixed(3)} m/s`,
      };
    }
    case 'maxSpeed': {
      return {
        ...base,
        satisfied: !stepViolations.velocityExceededSpeed,
        detail: stepViolations.velocityExceededSpeed
          ? `commanded motion exceeded ${scenario.limits.maxSpeed_mps.toFixed(3)} m/s`
          : undefined,
      };
    }
    case 'maxAcceleration': {
      return {
        ...base,
        satisfied: !stepViolations.commandExceededAcceleration,
        detail: stepViolations.commandExceededAcceleration
          ? `commanded ${state.trolley.commandedAx_mps2.toFixed(3)} m/s², limit ${scenario.limits.maxAcceleration_mps2.toFixed(3)} m/s²`
          : undefined,
      };
    }
    case 'cycleTime': {
      const limit = req.value ?? scenario.limits.maxCycleTime_s;
      return {
        ...base,
        satisfied: limit === undefined || state.time_s <= limit,
        detail: limit !== undefined ? `elapsed ${state.time_s.toFixed(2)} s, limit ${limit.toFixed(2)} s` : undefined,
      };
    }
    // Not yet modeled (Milestone 4) — always satisfied so an enabled
    // feature flag never masquerades as a passed physics check.
    case 'finalAngle':
    case 'maxCargoOffset':
    case 'maxCargoDamage':
    case 'noCollision':
    case 'profileEndedMoving':
      return { ...base, satisfied: true, detail: 'not modeled before Milestone 4' };
  }
}

/**
 * Requirement kinds that fail a run the instant they're violated (spec
 * §7.2 — "acceleration limit exceeded", "speed limit exceeded", etc. are
 * concrete, immediate causes, not conditions you can recover from within
 * the same run).
 */
const FAILURE_TRIGGER_KINDS = new Set<RequirementConfig['kind']>([
  'maxSpeed',
  'maxAcceleration',
  'maxCargoOffset',
  'maxCargoDamage',
  'noCollision',
  'cycleTime',
]);

/** Requirement kinds that must ALL hold simultaneously, for the dwell time, to complete a run (spec §7.1). */
const COMPLETION_KINDS = new Set<RequirementConfig['kind']>(['finalPosition', 'finalSpeed', 'finalAngle']);

export interface RequirementEvaluation {
  results: RequirementResult[];
  /** True if any continuous limit was violated this step — the run should fail immediately. */
  failed: boolean;
  /** True if every completion-relevant requirement (position/speed/angle) is currently satisfied. */
  completionConditionsMet: boolean;
}

/**
 * Evaluate every scenario requirement plus the always-present travel
 * envelope check against current state. `stepViolations` carries this
 * step's raw clamp-triggering events from `stepTrolley` so limit
 * violations can be reported even though the physical state itself is
 * always kept safely in range.
 */
export function evaluateRequirements(
  scenario: ScenarioConfig,
  state: SimulationState,
  tracker: RunMetricsTracker,
  stepViolations: { commandExceededAcceleration: boolean; velocityExceededSpeed: boolean; hitEnvelope: boolean },
): RequirementEvaluation {
  let failed = false;
  let completionConditionsMet = true;
  let sawCompletionRequirement = false;

  const results = scenario.scoring.map((req) => {
    const result = evaluateOne(req, scenario, state, tracker, stepViolations);
    if (!result.satisfied && FAILURE_TRIGGER_KINDS.has(req.kind)) failed = true;
    if (COMPLETION_KINDS.has(req.kind)) {
      sawCompletionRequirement = true;
      if (!result.satisfied) completionConditionsMet = false;
    }
    return result;
  });

  results.push({
    id: 'travel-envelope',
    description: 'Trolley must remain within the crane travel envelope.',
    satisfied: !stepViolations.hitEnvelope,
    atTime_s: state.time_s,
    detail: stepViolations.hitEnvelope ? `position clamped at x=${state.trolley.x_m.toFixed(3)} m` : undefined,
  });
  if (stepViolations.hitEnvelope) failed = true;

  // A scenario with no position/speed requirements at all (e.g. the
  // tutorial) has nothing to "complete" against — never auto-complete it.
  if (!sawCompletionRequirement) completionConditionsMet = false;

  return { results, failed, completionConditionsMet };
}
