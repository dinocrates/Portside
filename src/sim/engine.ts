// The deterministic simulation engine. Spec §11.1 ("Custom deterministic
// physics core written as framework-independent TypeScript") and §11.4.
// MUST NOT import Phaser, DOM APIs, chart code, or storage code — see
// ADR-0001 and AGENTS.md rule 1.
//
// Scope (Milestone 0/1): horizontal trolley motion only. Vertical hoist,
// sway, and cargo-shift physics are Milestone 4 (spec §4.2); their state
// slices exist in `SimulationState` but this engine never populates them.
//
// Known simplification, flagged rather than hidden: spec §7.1 lists "all
// mandatory automated phases or commands have ended" as a completion
// condition, but `SimulationEngine.step` only receives one `ControlCommand`
// per call — it has no visibility into whether the controller that
// produced it (e.g. `ProfileController`) considers itself finished. The
// engine here completes a run purely on physical grounds (in position, at
// rest, no violations, held for the dwell time). Wiring in
// `controller.isFinished()` as an explicit completion gate is a follow-up,
// not yet implemented.

import type { ControlCommand } from './model/commands';
import type { ScenarioConfig } from '../scenarios/schema';
import { stepTrolley } from './physics/trolley';
import type { AttachmentState, SimulationState } from './model/state';
import type { RequirementResult, SimulationSnapshot } from './model/snapshot';
import { createMetricsTracker, evaluateRequirements, updateMetricsTracker, type RunMetricsTracker } from './metrics';

export interface SimulationEngine {
  reset(scenario: ScenarioConfig, seed: string): SimulationSnapshot;
  step(command: ControlCommand, dt_s: number): SimulationSnapshot;
  getSnapshot(): SimulationSnapshot;
}

function buildSnapshot(state: SimulationState, requirementResults?: RequirementResult[]): SimulationSnapshot {
  return {
    time_s: state.time_s,
    runState: state.runState,
    activePhaseId: state.activePhaseId,
    trolley_x_m: state.trolley.x_m,
    trolley_v_mps: state.trolley.vx_mps,
    trolley_a_mps2: state.trolley.ax_mps2,
    commanded_trolley_a_mps2: state.trolley.commandedAx_mps2,
    attachment: state.attachment,
    ...(requirementResults ? { requirementResults } : {}),
  };
}

export class DeterministicEngine implements SimulationEngine {
  private scenario: ScenarioConfig | null = null;
  private state: SimulationState | null = null;
  private tracker: RunMetricsTracker = createMetricsTracker();
  private lastSnapshot: SimulationSnapshot | null = null;
  private seed = '';

  reset(scenario: ScenarioConfig, seed: string): SimulationSnapshot {
    this.scenario = scenario;
    this.seed = seed;
    this.tracker = createMetricsTracker();

    const attachment: AttachmentState = 'attached'; // horizontal scenario starts with the container already attached (spec §2.2)

    this.state = {
      time_s: 0,
      runState: 'ready',
      trolley: {
        x_m: scenario.geometry.initialX_m,
        vx_mps: 0,
        ax_mps2: 0,
        commandedAx_mps2: 0,
      },
      attachment,
      activePhaseId: null,
    };

    this.lastSnapshot = buildSnapshot(this.state);
    return this.lastSnapshot;
  }

  step(command: ControlCommand, dt_s: number): SimulationSnapshot {
    if (!this.scenario || !this.state) {
      throw new Error('DeterministicEngine.step called before reset()');
    }
    if (dt_s < 0) throw new RangeError('dt_s must be non-negative');

    // Terminal states don't advance — a completed/failed run is immutable
    // until reset (spec §7 state diagram: only Reset leaves Complete/Failed).
    if (this.state.runState === 'complete' || this.state.runState === 'failed') {
      return this.lastSnapshot!;
    }

    const runningState: SimulationState =
      this.state.runState === 'ready' ? { ...this.state, runState: 'running' } : this.state;

    const trolleyLimits = {
      maxSpeed_mps: this.scenario.limits.maxSpeed_mps,
      maxAcceleration_mps2: this.scenario.limits.maxAcceleration_mps2,
      minX_m: this.scenario.geometry.trolleyMinX_m,
      maxX_m: this.scenario.geometry.trolleyMaxX_m,
    };
    const stepResult = stepTrolley(
      runningState.trolley,
      command.targetTrolleyAcceleration_mps2,
      dt_s,
      trolleyLimits,
    );

    let nextState: SimulationState = {
      ...runningState,
      time_s: runningState.time_s + dt_s,
      trolley: stepResult.state,
    };

    updateMetricsTracker(this.tracker, nextState);

    const atTarget =
      Math.abs(nextState.trolley.x_m - this.scenario.geometry.targetX_m) <=
      this.scenario.geometry.targetTolerance_m;
    const atRest = Math.abs(nextState.trolley.vx_mps) <= this.scenario.limits.finalSpeedTolerance_mps;
    this.tracker.dwellHeld_s = atTarget && atRest ? this.tracker.dwellHeld_s + dt_s : 0;

    const evaluation = evaluateRequirements(this.scenario, nextState, this.tracker, stepResult);

    if (evaluation.failed) {
      nextState = { ...nextState, runState: 'failed' };
    } else if (
      evaluation.completionConditionsMet &&
      this.tracker.dwellHeld_s >= this.scenario.limits.completionDwellTime_s
    ) {
      nextState = { ...nextState, runState: 'complete' };
    }

    this.state = nextState;
    const isTerminal = nextState.runState === 'complete' || nextState.runState === 'failed';
    this.lastSnapshot = buildSnapshot(nextState, isTerminal ? evaluation.results : undefined);
    return this.lastSnapshot;
  }

  getSnapshot(): SimulationSnapshot {
    if (!this.lastSnapshot) throw new Error('DeterministicEngine.getSnapshot called before reset()');
    return this.lastSnapshot;
  }
}
