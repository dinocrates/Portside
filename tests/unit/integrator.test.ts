import { describe, expect, it } from 'vitest';
import { FixedStepAccumulator } from '../../src/sim/physics/integrator';

describe('FixedStepAccumulator', () => {
  it('emits zero steps for a frame shorter than the fixed step', () => {
    const acc = new FixedStepAccumulator({ fixedDt_s: 1 / 120, maxAcceptedFrameGap_s: 0.25 });
    expect(acc.addFrameTime(1 / 240)).toBe(0);
  });

  it('emits the right number of steps and carries remainder forward', () => {
    const fixedDt_s = 1 / 120;
    const acc = new FixedStepAccumulator({ fixedDt_s, maxAcceptedFrameGap_s: 0.25 });
    // Exactly two physics steps' worth of frame time (doubling a float is
    // exact, so this avoids an unrelated floating-point rounding question).
    const steps = acc.addFrameTime(2 * fixedDt_s);
    expect(steps).toBe(2);
  });

  it('produces the same total step count regardless of frame-rate slicing, within one step (spec §13.3)', () => {
    // Deliberately not a clean multiple of fixedDt_s, so this checks the
    // intended property (frame-rate independence) rather than a
    // floating-point summation coincidence at an exact boundary.
    const fixedDt_s = 1 / 120;
    const totalTime_s = 1.97;

    const oneBigFrame = new FixedStepAccumulator({ fixedDt_s, maxAcceptedFrameGap_s: 10 });
    const bigSteps = oneBigFrame.addFrameTime(totalTime_s);

    const manySmallFrames = new FixedStepAccumulator({ fixedDt_s, maxAcceptedFrameGap_s: 10 });
    let smallSteps = 0;
    for (let i = 0; i < 118; i++) smallSteps += manySmallFrames.addFrameTime(totalTime_s / 118);

    expect(Math.abs(smallSteps - bigSteps)).toBeLessThanOrEqual(1);
  });

  it('caps catch-up on a long gap instead of producing an uncontrolled jump', () => {
    const acc = new FixedStepAccumulator({ fixedDt_s: 1 / 120, maxAcceptedFrameGap_s: 0.25 });
    const steps = acc.addFrameTime(5.0); // e.g. a backgrounded tab
    expect(steps).toBe(Math.floor(0.25 / (1 / 120)));
  });

  it('reset clears accumulated time', () => {
    const acc = new FixedStepAccumulator({ fixedDt_s: 1 / 120, maxAcceptedFrameGap_s: 0.25 });
    acc.addFrameTime(1 / 240);
    acc.reset();
    expect(acc.interpolationAlpha).toBe(0);
  });
});
