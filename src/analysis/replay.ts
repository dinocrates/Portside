// Drives real-time autoplay through a completed run's recorded snapshots
// (spec §6.1: "Replay replays a completed run from recorded snapshots
// without rerunning physics"). Manual dragging goes straight through
// `RunOrchestrator.scrubTo` — this class only adds the "play automatically
// at 1x" behavior on top, and is driven by an externally supplied
// `tick(deltaMs)` (e.g. from the Phaser scene's update loop or a
// `requestAnimationFrame` loop) so it stays framework-independent and
// testable with fake time.

import type { RunOrchestrator } from '../app/app-state';

export class ReplayPlayer {
  private playing = false;

  constructor(private readonly orchestrator: RunOrchestrator) {}

  isPlaying(): boolean {
    return this.playing;
  }

  play(): void {
    if (!this.orchestrator.canReplay()) return;
    if (!this.orchestrator.isReplayingNow()) this.orchestrator.startReplay();

    const bounds = this.orchestrator.getReplayBounds();
    if (bounds && this.orchestrator.getReplayTime_s() >= bounds.max_s) {
      this.orchestrator.scrubTo(bounds.min_s); // restart from the beginning if already at the end
    }
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  /** Call once per rendered frame. No-op unless currently playing. */
  tick(deltaMs: number): void {
    if (!this.playing) return;
    const bounds = this.orchestrator.getReplayBounds();
    if (!bounds) {
      this.playing = false;
      return;
    }
    const next = this.orchestrator.getReplayTime_s() + deltaMs / 1000;
    if (next >= bounds.max_s) {
      this.orchestrator.scrubTo(bounds.max_s);
      this.playing = false;
    } else {
      this.orchestrator.scrubTo(next);
    }
  }
}
