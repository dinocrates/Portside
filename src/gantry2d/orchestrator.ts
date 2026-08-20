// Application state for the 2D gantry lab — the same role as
// RunOrchestrator plays for the 1D lab (spec §11.5): the one place that
// ties the engine, a controller, the fixed-step accumulator, and the
// recorder together into something a UI can drive, with no DOM
// dependency of its own. Manual and automated control are symmetric here
// (same design principle as the 1D lab): both go through the same
// start/pause/resume/reset lifecycle and the same `engine.step()` call.

import { FixedStepAccumulator } from '../sim/physics/integrator';
import { DEFAULT_PHYSICS_DT_S, DEFAULT_SAMPLE_RATE_HZ, DEFAULT_TOLERANCES } from '../sim/model/parameters';
import type { RunState } from '../sim/model/state';
import { GantryEngine } from './engine';
import { GantryManualController, type AxisDirection } from './manual-controller';
import {
  GantryProfileController,
  createDefaultGantryProfileTemplate,
  totalGantryProgrammedTime_s,
  validateGantryProfile,
  type GantryMotionPhase,
  type GantryMotionProfile,
  type GantryPhaseValidationError,
} from './controllers/profile-controller';
import type { GantryScenarioConfig } from './scenario';
import type { GantrySnapshot } from './model/snapshot';
import { Recorder } from '../analysis/recorder';
import { nearestIndex } from '../analysis/scales';

export type GantryUiMode = 'manual' | 'automated';

export class GantryOrchestrator {
  readonly scenario: GantryScenarioConfig;

  private engine = new GantryEngine();
  private accumulator: FixedStepAccumulator;
  private recorder = new Recorder<GantrySnapshot>(DEFAULT_SAMPLE_RATE_HZ);
  private manualController = new GantryManualController();
  private profileController: GantryProfileController | null = null;

  private mode: GantryUiMode = 'manual';
  private profile: GantryMotionProfile;
  private profileUsedForRun: GantryMotionProfile | null = null;
  private snapshot: GantrySnapshot;
  private started = false;
  private paused = false;
  private seed: string;

  // Replay (spec §6.1's pattern): scrubbing through a *completed* run's
  // recorded snapshots without rerunning physics.
  private isReplaying = false;
  private replayTime_s = 0;

  private listeners = new Set<() => void>();

  constructor(scenario: GantryScenarioConfig, seed = 'run') {
    this.scenario = scenario;
    this.accumulator = new FixedStepAccumulator({
      fixedDt_s: DEFAULT_PHYSICS_DT_S,
      maxAcceptedFrameGap_s: DEFAULT_TOLERANCES.maxAcceptedFrameGap_s,
    });
    this.profile = createDefaultGantryProfileTemplate(scenario);
    this.seed = seed;
    this.snapshot = this.engine.reset(scenario);
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitChange(): void {
    for (const listener of this.listeners) listener();
  }

  // --- Read state ---------------------------------------------------

  getSnapshot(): GantrySnapshot {
    return this.snapshot;
  }

  /** What the scene/live-strip should actually render: the live snapshot normally, or the recorded sample nearest the replay cursor while replaying. */
  getDisplaySnapshot(): GantrySnapshot {
    if (this.isReplayingNow()) {
      const samples = this.recorder.getSamples();
      if (samples.length === 0) return this.snapshot;
      const idx = nearestIndex(
        samples.map((s) => s.time_s),
        this.replayTime_s,
      );
      return samples[idx] ?? this.snapshot;
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

  /** The exact profile that produced the current/most recent automated run — distinct from `getProfile()`, which may have been edited since. */
  getProfileUsedForRun(): GantryMotionProfile | null {
    return this.profileUsedForRun;
  }

  getMode(): GantryUiMode {
    return this.mode;
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

  getRecordedSamples(): readonly GantrySnapshot[] {
    return this.recorder.getSamples();
  }

  getProfile(): GantryMotionProfile {
    return this.profile;
  }

  validateCurrentProfile(): GantryPhaseValidationError[] {
    return validateGantryProfile(this.profile, this.scenario);
  }

  totalProfileTime_s(): number {
    return totalGantryProgrammedTime_s(this.profile);
  }

  canStart(): boolean {
    if (this.snapshot.runState !== 'ready') return false;
    if (this.mode === 'automated') {
      return this.profile.length > 0 && this.validateCurrentProfile().length === 0;
    }
    return true;
  }

  // --- Mode / profile editing ----------------------------------------

  setMode(mode: GantryUiMode): void {
    if (this.started && this.snapshot.runState === 'running') return;
    this.mode = mode;
    this.emitChange();
  }

  setProfile(profile: GantryMotionProfile): void {
    this.profile = profile;
    this.emitChange();
  }

  addPhase(phase: GantryMotionPhase): void {
    this.setProfile([...this.profile, phase]);
  }

  removePhase(id: string): void {
    this.setProfile(this.profile.filter((p) => p.id !== id));
  }

  duplicatePhase(id: string): void {
    const index = this.profile.findIndex((p) => p.id === id);
    if (index === -1) return;
    const source = this.profile[index]!;
    const copy: GantryMotionPhase = { ...source, id: `${source.id}-copy-${Date.now()}` };
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

  updatePhase(id: string, patch: Partial<Pick<GantryMotionPhase, 'name' | 'duration_s' | 'ax_mps2' | 'ay_mps2' | 'note'>>): void {
    this.setProfile(this.profile.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  // --- Manual input ----------------------------------------------------

  setXDirection(direction: AxisDirection): void {
    if (this.mode !== 'manual') return;
    this.manualController.setXDirection(direction);
  }

  setYDirection(direction: AxisDirection): void {
    if (this.mode !== 'manual') return;
    this.manualController.setYDirection(direction);
  }

  // --- Lifecycle: start / pause / resume / reset ------------------------

  start(): void {
    if (!this.canStart()) return;
    this.seed = `run-${Date.now()}`;
    this.snapshot = this.engine.reset(this.scenario);
    this.accumulator.reset();
    this.recorder.reset();
    this.paused = false;
    this.started = true;
    this.isReplaying = false;

    if (this.mode === 'manual') {
      this.profileUsedForRun = null;
      this.manualController.reset(this.scenario);
    } else {
      this.profileUsedForRun = this.profile;
      this.profileController = new GantryProfileController(this.profile);
      this.profileController.reset();
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

  reset(): void {
    this.seed = `run-${Date.now()}`;
    this.snapshot = this.engine.reset(this.scenario);
    this.accumulator.reset();
    this.recorder.reset();
    this.manualController.setXDirection('none');
    this.manualController.setYDirection('none');
    this.profileController = null;
    this.profileUsedForRun = null;
    this.started = false;
    this.paused = false;
    this.isReplaying = false;
    this.emitChange();
  }

  // --- Restoring persisted state (spec §12.2's pattern) ------------------

  /** Apply a previously-saved draft (mode + in-progress profile edits). Only meaningful before any run has started this session. */
  restoreDraft(draft: { mode: GantryUiMode; profile: GantryMotionProfile }): void {
    this.mode = draft.mode;
    this.profile = draft.profile;
    this.emitChange();
  }

  /** Hydrate the orchestrator to show a previously-completed run (results, charts, replay) without rerunning physics. */
  restoreCompletedRun(run: {
    mode: GantryUiMode;
    profileUsedForRun: GantryMotionProfile | null;
    seed: string;
    finalSnapshot: GantrySnapshot;
    samples: readonly GantrySnapshot[];
  }): void {
    if (run.finalSnapshot.runState !== 'complete' && run.finalSnapshot.runState !== 'failed') return;
    this.mode = run.mode;
    this.profileUsedForRun = run.profileUsedForRun;
    this.seed = run.seed;
    this.snapshot = run.finalSnapshot;
    this.recorder.restore(run.samples);
    this.started = true;
    this.paused = false;
    this.isReplaying = false;
    this.emitChange();
  }

  // --- Frame tick (called once per rendered frame) -----------------------

  private isTerminal(): boolean {
    return this.snapshot.runState === 'complete' || this.snapshot.runState === 'failed';
  }

  tick(frameDt_s: number): void {
    if (!this.started || this.paused || this.isTerminal()) return;
    const steps = this.accumulator.addFrameTime(frameDt_s);
    for (let i = 0; i < steps; i++) {
      this.advanceOneStep();
      if (this.isTerminal()) break;
    }
    if (steps > 0) this.emitChange();
  }

  private advanceOneStep(): void {
    const command =
      this.mode === 'manual' ? this.manualController.command(this.snapshot) : this.profileController!.command(this.snapshot);
    let next = this.engine.step(command, DEFAULT_PHYSICS_DT_S);
    if (this.mode === 'automated' && this.profileController) {
      // The engine has no concept of "phases" (controller-owned state,
      // correctly outside the physics core) — the orchestrator overlays
      // it onto the snapshot, same integration point as the 1D lab.
      next = { ...next, activePhaseId: this.profileController.activePhaseId(next.time_s) };
    }
    this.snapshot = next;
    if (this.isTerminal()) {
      this.recorder.sampleTerminal(this.snapshot);
    } else {
      this.recorder.sampleIfDue(this.snapshot);
    }
  }
}
