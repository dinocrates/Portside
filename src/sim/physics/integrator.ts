// Fixed-step accumulator (spec §8.2). Converts variable browser frame time
// into zero or more fixed physics steps, so physics results never depend
// on frame rate (spec §13.3, "Physics results are independent of rendering
// frame rate"). This is consumed by the app/game loop, which calls
// `engine.step(command, fixedDt_s)` once per emitted step — it is not
// used inside the engine itself, since `SimulationEngine.step` already
// takes an explicit `dt_s` per the frozen contract (spec §11.4).

export interface FixedStepAccumulatorOptions {
  fixedDt_s: number;
  /** Longest single frame gap to catch up on; longer gaps are dropped (spec §8.2: "pause rather than simulating an uncontrolled time jump"). */
  maxAcceptedFrameGap_s: number;
}

export class FixedStepAccumulator {
  private accumulated_s = 0;
  private readonly fixedDt_s: number;
  private readonly maxAcceptedFrameGap_s: number;

  constructor(options: FixedStepAccumulatorOptions) {
    if (options.fixedDt_s <= 0) throw new RangeError('fixedDt_s must be positive');
    this.fixedDt_s = options.fixedDt_s;
    this.maxAcceptedFrameGap_s = options.maxAcceptedFrameGap_s;
  }

  /**
   * Feed one rendered-frame's elapsed time. Returns the number of fixed
   * physics steps that should now be executed. A gap longer than
   * `maxAcceptedFrameGap_s` (e.g. a backgrounded tab) is clamped so the
   * simulation doesn't try to "catch up" through an unbounded number of
   * steps — the caller should treat this as a pause, not a fast-forward.
   */
  addFrameTime(frameDt_s: number): number {
    if (frameDt_s < 0) throw new RangeError('frameDt_s must be non-negative');
    const clamped = Math.min(frameDt_s, this.maxAcceptedFrameGap_s);
    this.accumulated_s += clamped;

    const steps = Math.floor(this.accumulated_s / this.fixedDt_s);
    this.accumulated_s -= steps * this.fixedDt_s;
    return steps;
  }

  /** Fraction (0..1) of a physics step accumulated but not yet consumed — usable for render interpolation (spec §8.2). */
  get interpolationAlpha(): number {
    return this.accumulated_s / this.fixedDt_s;
  }

  reset(): void {
    this.accumulated_s = 0;
  }
}
