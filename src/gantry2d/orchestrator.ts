// Application state for the 2D gantry lab — the same role as
// RunOrchestrator plays for the 1D lab (spec §11.5), scoped down to what
// this lab actually has yet: manual control only, no automated profile,
// no recorder/replay/export/persistence. Those are straightforward to
// add later following the 1D lab's RunOrchestrator as a template; this
// is the core loop proven first.

import { FixedStepAccumulator } from '../sim/physics/integrator';
import { DEFAULT_PHYSICS_DT_S, DEFAULT_TOLERANCES } from '../sim/model/parameters';
import type { RunState } from '../sim/model/state';
import { GantryEngine } from './engine';
import { GantryManualController, type AxisDirection } from './manual-controller';
import type { GantryScenarioConfig } from './scenario';
import type { GantrySnapshot } from './model/snapshot';

export class GantryOrchestrator {
  readonly scenario: GantryScenarioConfig;

  private engine = new GantryEngine();
  private accumulator: FixedStepAccumulator;
  private manualController = new GantryManualController();

  private snapshot: GantrySnapshot;
  private started = false;
  private paused = false;

  private listeners = new Set<() => void>();

  constructor(scenario: GantryScenarioConfig) {
    this.scenario = scenario;
    this.accumulator = new FixedStepAccumulator({
      fixedDt_s: DEFAULT_PHYSICS_DT_S,
      maxAcceptedFrameGap_s: DEFAULT_TOLERANCES.maxAcceptedFrameGap_s,
    });
    this.snapshot = this.engine.reset(scenario);
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitChange(): void {
    for (const listener of this.listeners) listener();
  }

  getSnapshot(): GantrySnapshot {
    return this.snapshot;
  }

  hasStarted(): boolean {
    return this.started;
  }

  isPaused(): boolean {
    return this.paused;
  }

  getDisplayRunState(): RunState {
    if (this.paused && this.snapshot.runState === 'running') return 'paused';
    return this.snapshot.runState;
  }

  canStart(): boolean {
    return this.snapshot.runState === 'ready';
  }

  setXDirection(direction: AxisDirection): void {
    this.manualController.setXDirection(direction);
  }

  setYDirection(direction: AxisDirection): void {
    this.manualController.setYDirection(direction);
  }

  start(): void {
    if (!this.canStart()) return;
    this.snapshot = this.engine.reset(this.scenario);
    this.accumulator.reset();
    this.paused = false;
    this.started = true;
    this.manualController.reset(this.scenario);
    this.emitChange();
  }

  pause(): void {
    if (!this.started || this.paused) return;
    if (this.snapshot.runState !== 'running') return;
    this.paused = true;
    this.emitChange();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.emitChange();
  }

  reset(): void {
    this.snapshot = this.engine.reset(this.scenario);
    this.accumulator.reset();
    this.manualController.setXDirection('none');
    this.manualController.setYDirection('none');
    this.started = false;
    this.paused = false;
    this.emitChange();
  }

  private isTerminal(): boolean {
    return this.snapshot.runState === 'complete' || this.snapshot.runState === 'failed';
  }

  tick(frameDt_s: number): void {
    if (!this.started || this.paused || this.isTerminal()) return;
    const steps = this.accumulator.addFrameTime(frameDt_s);
    for (let i = 0; i < steps; i++) {
      const command = this.manualController.command(this.snapshot);
      this.snapshot = this.engine.step(command, DEFAULT_PHYSICS_DT_S);
      if (this.isTerminal()) break;
    }
    if (steps > 0) this.emitChange();
  }
}
