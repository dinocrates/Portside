// The application state owner (spec §11.5: "Application state owns UI
// mode and selected run"). This is the one place that ties the engine, a
// controller, the fixed-step accumulator, and the recorder together into
// something a UI can drive. It has no DOM dependency — every UI module
// (run-controls, manual-controls, profile-editor, results-panel) and the
// Phaser scene are thin views over this class, and it's fully unit
// testable headlessly (see tests/unit/orchestrator.test.ts).
//
// Manual and automated control are deliberately symmetric here (spec
// design principle 2): both go through the same start/pause/resume/step/
// reset lifecycle and the same `engine.step()` call in `advanceOneStep`.

import { DeterministicEngine } from '../sim/engine';
import { FixedStepAccumulator } from '../sim/physics/integrator';
import { DEFAULT_PHYSICS_DT_S, DEFAULT_SAMPLE_RATE_HZ, DEFAULT_TOLERANCES } from '../sim/model/parameters';
import type { RunState } from '../sim/model/state';
import type { SimulationSnapshot } from '../sim/model/snapshot';
import type { ScenarioConfig } from '../scenarios/schema';
import { ManualController, type ManualDirection } from '../controllers/manual-controller';
import {
  ProfileController,
  totalProgrammedTime_s,
  validateProfile,
  type MotionPhase,
  type MotionProfile,
  type PhaseValidationError,
} from '../controllers/profile-controller';
import type { Controller } from '../controllers/controller-types';
import { Recorder } from '../analysis/recorder';

export type UiMode = 'manual' | 'automated';

/** The recorded sample whose time_s is closest to `time_s`. Assumes samples are time-ordered (true by construction — Recorder only appends). */
function findNearestSample(
  samples: readonly SimulationSnapshot[],
  time_s: number,
): SimulationSnapshot | null {
  if (samples.length === 0) return null;
  // Samples are few enough per run (hundreds, at 20-30 Hz) that a linear
  // scan is simpler than a binary search and not a real cost.
  let nearest = samples[0]!;
  let bestDelta = Math.abs(nearest.time_s - time_s);
  for (const sample of samples) {
    const delta = Math.abs(sample.time_s - time_s);
    if (delta < bestDelta) {
      nearest = sample;
      bestDelta = delta;
    }
  }
  return nearest;
}

/** A default, already-valid three-phase template (spec §6.3) — a starting point for editing, not a revealed answer. */
export function createDefaultProfileTemplate(scenario: ScenarioConfig): MotionProfile {
  const a = scenario.limits.maxAcceleration_mps2 / 2;
  return [
    { id: 'phase-1', name: 'Accelerate', duration_s: 1, trolleyAcceleration_mps2: a },
    { id: 'phase-2', name: 'Cruise', duration_s: 1, trolleyAcceleration_mps2: 0 },
    { id: 'phase-3', name: 'Decelerate', duration_s: 1, trolleyAcceleration_mps2: -a },
  ];
}

export class RunOrchestrator {
  readonly scenario: ScenarioConfig;

  private engine = new DeterministicEngine();
  private accumulator: FixedStepAccumulator;
  private recorder = new Recorder(DEFAULT_SAMPLE_RATE_HZ);
  private manualController = new ManualController();
  private profileController: ProfileController | null = null;

  private mode: UiMode = 'manual';
  private profile: MotionProfile;
  private profileUsedForRun: MotionProfile | null = null;
  private snapshot: SimulationSnapshot;
  private started = false;
  private paused = false;
  private lastFeedback = '';
  private seed: string;

  // Replay (spec §6.1): scrubbing through a *completed* run's recorded
  // snapshots without rerunning physics. `replayTime_s` is the cursor
  // position; it only has meaning once `isReplaying` is true.
  private isReplaying = false;
  private replayTime_s = 0;

  private listeners = new Set<() => void>();

  constructor(scenario: ScenarioConfig, seed = 'run') {
    this.scenario = scenario;
    this.accumulator = new FixedStepAccumulator({
      fixedDt_s: DEFAULT_PHYSICS_DT_S,
      maxAcceptedFrameGap_s: DEFAULT_TOLERANCES.maxAcceptedFrameGap_s,
    });
    this.profile = createDefaultProfileTemplate(scenario);
    this.seed = seed;
    this.snapshot = this.engine.reset(scenario, seed);
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitChange(): void {
    for (const listener of this.listeners) listener();
  }

  // --- Read state ---------------------------------------------------

  /** The engine's authoritative live state — always the physics truth, never affected by replay scrubbing. */
  getSnapshot(): SimulationSnapshot {
    return this.snapshot;
  }

  /** What the scene/live-strip should actually render: the live snapshot normally, or the recorded sample nearest the replay cursor while replaying (spec §13.4: "Moving the replay cursor updates the scene to the corresponding recorded sample"). */
  getDisplaySnapshot(): SimulationSnapshot {
    if (this.isReplayingNow()) {
      return findNearestSample(this.recorder.getSamples(), this.replayTime_s) ?? this.snapshot;
    }
    return this.snapshot;
  }

  isReplayingNow(): boolean {
    return this.isReplaying;
  }

  getReplayTime_s(): number {
    return this.replayTime_s;
  }

  canReplay(): boolean {
    return this.isTerminal() && this.recorder.getSamples().length > 0;
  }

  getReplayBounds(): { min_s: number; max_s: number } | null {
    const samples = this.recorder.getSamples();
    if (samples.length === 0) return null;
    return { min_s: samples[0]!.time_s, max_s: samples[samples.length - 1]!.time_s };
  }

  startReplay(): void {
    if (!this.canReplay()) return;
    this.isReplaying = true;
    this.replayTime_s = this.getReplayBounds()!.min_s;
    this.emitChange();
  }

  /** Move the shared replay cursor (spec §9.2: "the shared cursor updates the scene replay"). Clamped to the recorded range. */
  scrubTo(time_s: number): void {
    if (!this.isReplaying) return;
    const bounds = this.getReplayBounds();
    if (!bounds) return;
    this.replayTime_s = Math.min(bounds.max_s, Math.max(bounds.min_s, time_s));
    this.emitChange();
  }

  exitReplay(): void {
    if (!this.isReplaying) return;
    this.isReplaying = false;
    this.emitChange();
  }

  getSeed(): string {
    return this.seed;
  }

  /** The exact profile that produced the current/most recent automated run — distinct from `getProfile()`, which may have been edited since (spec §6.3: editing and rerunning must never reuse stale state, so the *run record* pins the profile that was actually executed). */
  getProfileUsedForRun(): MotionProfile | null {
    return this.profileUsedForRun;
  }

  getMode(): UiMode {
    return this.mode;
  }

  hasStarted(): boolean {
    return this.started;
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** The state the UI should display. The engine contract has no concept of "paused" (AGENTS.md: pause is app-level, not physics-level) — this overlays it. */
  getDisplayRunState(): RunState {
    if (this.paused && this.snapshot.runState === 'running') return 'paused';
    return this.snapshot.runState;
  }

  getRecordedSamples(): readonly SimulationSnapshot[] {
    return this.recorder.getSamples();
  }

  getProfile(): MotionProfile {
    return this.profile;
  }

  validateCurrentProfile(): PhaseValidationError[] {
    return validateProfile(this.profile, this.scenario);
  }

  totalProfileTime_s(): number {
    return totalProgrammedTime_s(this.profile);
  }

  /** A brief, transient message for invalid/no-op commands (spec §6.2: "concise feedback... do not alter state"). */
  getLastFeedback(): string {
    return this.lastFeedback;
  }

  canStart(): boolean {
    if (this.snapshot.runState !== 'ready') return false;
    if (this.mode === 'automated') {
      return this.profile.length > 0 && this.validateCurrentProfile().length === 0;
    }
    return true;
  }

  isRunEndedWithoutSuccess(): boolean {
    return this.snapshot.runState === 'failed';
  }

  // --- Mode / profile editing ----------------------------------------

  setMode(mode: UiMode): void {
    if (this.started && this.snapshot.runState === 'running') return; // can't switch mode mid-run
    this.mode = mode;
    this.emitChange();
  }

  setProfile(profile: MotionProfile): void {
    this.profile = profile;
    this.emitChange();
  }

  addPhase(phase: MotionPhase): void {
    this.setProfile([...this.profile, phase]);
  }

  removePhase(id: string): void {
    this.setProfile(this.profile.filter((p) => p.id !== id));
  }

  duplicatePhase(id: string): void {
    const index = this.profile.findIndex((p) => p.id === id);
    if (index === -1) return;
    const source = this.profile[index]!;
    const copy: MotionPhase = { ...source, id: `${source.id}-copy-${Date.now()}` };
    const next = [...this.profile];
    next.splice(index + 1, 0, copy);
    this.setProfile(next);
  }

  reorderPhase(id: string, direction: -1 | 1): void {
    const index = this.profile.findIndex((p) => p.id === id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= this.profile.length) return;
    const next = [...this.profile];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    this.setProfile(next);
  }

  updatePhase(id: string, patch: Partial<Pick<MotionPhase, 'name' | 'duration_s' | 'trolleyAcceleration_mps2' | 'note'>>): void {
    this.setProfile(this.profile.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  // --- Manual input ----------------------------------------------------

  setManualDirection(direction: ManualDirection): void {
    if (this.mode !== 'manual') return;
    this.manualController.setDirection(direction);
  }

  /** Space / vertical hoist keys — always a documented no-op for this scenario (spec §4.1: vertical motion not in the first release). */
  requestUnavailableCommand(label: string): void {
    this.lastFeedback = `${label} isn't part of this scenario.`;
    this.emitChange();
  }

  // --- Lifecycle: start / pause / resume / step / reset ----------------

  start(): void {
    if (!this.canStart()) return;
    this.seed = `run-${Date.now()}`;
    this.snapshot = this.engine.reset(this.scenario, this.seed);
    this.accumulator.reset();
    this.recorder.reset();
    this.paused = false;
    this.started = true;
    this.lastFeedback = '';
    this.isReplaying = false;

    if (this.mode === 'manual') {
      this.profileUsedForRun = null;
      this.manualController.reset(this.snapshot, this.scenario);
    } else {
      this.profileUsedForRun = this.profile;
      this.profileController = new ProfileController(this.profile);
      this.profileController.reset(this.snapshot, this.scenario);
    }

    this.recorder.sample(this.snapshot);
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

  /** Advance exactly one displayed analysis interval while paused (spec §6.1). */
  step(): void {
    if (!this.started || !this.paused) return;
    this.advanceFor(1 / DEFAULT_SAMPLE_RATE_HZ);
    this.emitChange();
  }

  reset(): void {
    this.seed = `run-${Date.now()}`;
    this.snapshot = this.engine.reset(this.scenario, this.seed);
    this.accumulator.reset();
    this.recorder.reset();
    this.manualController.setDirection('none');
    this.profileController = null;
    this.profileUsedForRun = null;
    this.started = false;
    this.paused = false;
    this.lastFeedback = '';
    this.isReplaying = false;
    this.emitChange();
  }

  // --- Frame tick (called once per rendered frame) ---------------------

  /** Called every rendered frame (e.g. from CraneScene.update). No-op unless a run is active, unpaused, and not yet terminal. */
  tick(frameDt_s: number): void {
    if (!this.started || this.paused || this.isTerminal()) return;
    const steps = this.accumulator.addFrameTime(frameDt_s);
    for (let i = 0; i < steps; i++) {
      this.advanceOneStep();
      if (this.isTerminal()) break;
    }
    if (steps > 0) this.emitChange();
  }

  private isTerminal(): boolean {
    return this.snapshot.runState === 'complete' || this.snapshot.runState === 'failed';
  }

  private activeController(): Controller {
    return this.mode === 'manual' ? this.manualController : this.profileController!;
  }

  private advanceOneStep(): void {
    const command = this.activeController().command(this.snapshot, DEFAULT_PHYSICS_DT_S);
    let next = this.engine.step(command, DEFAULT_PHYSICS_DT_S);
    if (this.mode === 'automated' && this.profileController) {
      // The engine has no concept of "phases" (that's controller-owned
      // state, correctly outside the physics core — see ADR-0001), so the
      // orchestrator is the integration point that overlays it onto the
      // snapshot. The profile always starts synchronized with the engine
      // reset (both at t=0), so run time_s doubles as elapsed profile time.
      next = { ...next, activePhaseId: this.profileController.activePhaseId(next.time_s) };
    }
    this.snapshot = next;
    if (this.isTerminal()) {
      this.recorder.sampleTerminal(this.snapshot);
    } else {
      this.recorder.sampleIfDue(this.snapshot);
    }
  }

  private advanceFor(duration_s: number): void {
    const steps = Math.max(1, Math.round(duration_s / DEFAULT_PHYSICS_DT_S));
    for (let i = 0; i < steps; i++) {
      this.advanceOneStep();
      if (this.isTerminal()) break;
    }
  }
}
