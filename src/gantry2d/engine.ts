// Deterministic engine for the 2D overhead gantry lab. Same discipline as
// the 1D lab's engine (ADR-0001): no Phaser/DOM imports, pure state in,
// snapshot out. Each axis is advanced with the existing, already-tested
// `stepTrolley` (src/sim/physics/trolley.ts) — a bounded 1D kinematics
// integrator that has no idea it's being used for a crane at all, which
// is exactly why it's safe to reuse verbatim for two independent axes
// here rather than writing new integration code.

import { stepTrolley } from '../sim/physics/trolley';
import type { GantryControlCommand } from './model/commands';
import type { GantryState } from './model/state';
import type { GantrySnapshot } from './model/snapshot';
import type { GantryScenarioConfig } from './scenario';
import { evaluateGantryRequirements } from './metrics';

function buildSnapshot(state: GantryState, requirementResults?: GantrySnapshot['requirementResults']): GantrySnapshot {
  return {
    time_s: state.time_s,
    runState: state.runState,
    x_m: state.axisX.x_m,
    vx_mps: state.axisX.vx_mps,
    ax_mps2: state.axisX.ax_mps2,
    commanded_ax_mps2: state.axisX.commandedAx_mps2,
    y_m: state.axisY.x_m,
    vy_mps: state.axisY.vx_mps,
    ay_mps2: state.axisY.ax_mps2,
    commanded_ay_mps2: state.axisY.commandedAx_mps2,
    ...(requirementResults ? { requirementResults } : {}),
  };
}

export class GantryEngine {
  private scenario: GantryScenarioConfig | null = null;
  private state: GantryState | null = null;
  private lastSnapshot: GantrySnapshot | null = null;
  private dwellHeld_s = 0;

  reset(scenario: GantryScenarioConfig): GantrySnapshot {
    this.scenario = scenario;
    this.dwellHeld_s = 0;
    this.state = {
      time_s: 0,
      runState: 'ready',
      axisX: { x_m: scenario.geometry.initialX_m, vx_mps: 0, ax_mps2: 0, commandedAx_mps2: 0 },
      axisY: { x_m: scenario.geometry.initialY_m, vx_mps: 0, ax_mps2: 0, commandedAx_mps2: 0 },
    };
    this.lastSnapshot = buildSnapshot(this.state);
    return this.lastSnapshot;
  }

  step(command: GantryControlCommand, dt_s: number): GantrySnapshot {
    if (!this.scenario || !this.state) throw new Error('GantryEngine.step called before reset()');
    if (dt_s < 0) throw new RangeError('dt_s must be non-negative');

    if (this.state.runState === 'complete' || this.state.runState === 'failed') {
      return this.lastSnapshot!;
    }

    const runningState: GantryState =
      this.state.runState === 'ready' ? { ...this.state, runState: 'running' } : this.state;

    const limits = {
      maxSpeed_mps: this.scenario.limits.maxSpeed_mps,
      maxAcceleration_mps2: this.scenario.limits.maxAcceleration_mps2,
      minX_m: this.scenario.geometry.minX_m,
      maxX_m: this.scenario.geometry.maxX_m,
    };
    const stepX = stepTrolley(runningState.axisX, command.targetAxAccel_mps2, dt_s, limits);

    const limitsY = { ...limits, minX_m: this.scenario.geometry.minY_m, maxX_m: this.scenario.geometry.maxY_m };
    const stepY = stepTrolley(runningState.axisY, command.targetAyAccel_mps2, dt_s, limitsY);

    let nextState: GantryState = {
      ...runningState,
      time_s: runningState.time_s + dt_s,
      axisX: stepX.state,
      axisY: stepY.state,
    };

    const evaluation = evaluateGantryRequirements(this.scenario, nextState, stepX, stepY);
    this.dwellHeld_s = evaluation.completionConditionsMet ? this.dwellHeld_s + dt_s : 0;

    if (evaluation.failed) {
      nextState = { ...nextState, runState: 'failed' };
    } else if (this.dwellHeld_s >= this.scenario.limits.completionDwellTime_s) {
      nextState = { ...nextState, runState: 'complete' };
    }

    this.state = nextState;
    const isTerminal = nextState.runState === 'complete' || nextState.runState === 'failed';
    this.lastSnapshot = buildSnapshot(nextState, isTerminal ? evaluation.results : undefined);
    return this.lastSnapshot;
  }

  getSnapshot(): GantrySnapshot {
    if (!this.lastSnapshot) throw new Error('GantryEngine.getSnapshot called before reset()');
    return this.lastSnapshot;
  }
}
