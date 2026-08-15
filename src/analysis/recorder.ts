// Fixed-rate sample recorder (spec §9.1, §8.2: "Record analysis samples at
// a lower fixed rate, recommended 20 or 30 Hz"). A SimulationSnapshot
// already matches the spec's recorded-sample field list field-for-field
// (spec §9.1), so recording is just "keep the snapshots that land on the
// sample-rate boundary" — no separate sample type needed.
//
// The recorder only ever reads snapshots; it never computes physics
// (spec §11.5: "Recorder owns immutable completed-run data").

import type { SimulationSnapshot } from '../sim/model/snapshot';

export class Recorder {
  private readonly sampleInterval_s: number;
  private samples: SimulationSnapshot[] = [];
  private nextSampleAt_s = 0;

  constructor(sampleRateHz: number) {
    if (sampleRateHz <= 0) throw new RangeError('sampleRateHz must be positive');
    this.sampleInterval_s = 1 / sampleRateHz;
  }

  reset(): void {
    this.samples = [];
    this.nextSampleAt_s = 0;
  }

  /** Force-record this snapshot regardless of timing (used for the run's first sample, t=0). */
  sample(snapshot: SimulationSnapshot): void {
    this.samples.push(snapshot);
    this.nextSampleAt_s = snapshot.time_s + this.sampleInterval_s;
  }

  /** Record this snapshot only if the sample interval has elapsed since the last recorded sample. */
  sampleIfDue(snapshot: SimulationSnapshot): void {
    if (snapshot.time_s + 1e-9 >= this.nextSampleAt_s) {
      this.sample(snapshot);
    }
  }

  /** Always record terminal snapshots (complete/failed), even mid-interval, so the run's final state is never missing from the record. */
  sampleTerminal(snapshot: SimulationSnapshot): void {
    const last = this.samples[this.samples.length - 1];
    if (last !== snapshot) this.samples.push(snapshot);
  }

  getSamples(): readonly SimulationSnapshot[] {
    return this.samples;
  }

  /** Bulk-load a previously-recorded sample set (spec §12.2: restoring the most recent completed run from local storage) — never re-derived from replay, just handed back exactly as recorded. */
  restore(samples: readonly SimulationSnapshot[]): void {
    this.samples = [...samples];
    const last = this.samples[this.samples.length - 1];
    this.nextSampleAt_s = last ? last.time_s + this.sampleInterval_s : 0;
  }
}
