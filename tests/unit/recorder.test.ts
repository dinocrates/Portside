import { describe, expect, it } from 'vitest';
import { Recorder } from '../../src/analysis/recorder';
import type { SimulationSnapshot } from '../../src/sim/model/snapshot';

function snap(time_s: number, runState: SimulationSnapshot['runState'] = 'running'): SimulationSnapshot {
  return {
    time_s,
    runState,
    activePhaseId: null,
    trolley_x_m: time_s,
    trolley_v_mps: 1,
    trolley_a_mps2: 0,
    commanded_trolley_a_mps2: 0,
    attachment: 'attached',
  };
}

describe('Recorder', () => {
  it('records the forced first sample regardless of timing', () => {
    const r = new Recorder(30);
    r.sample(snap(0));
    expect(r.getSamples()).toHaveLength(1);
  });

  it('only records sampleIfDue once the interval has elapsed', () => {
    const r = new Recorder(30); // interval = 1/30 s
    r.sample(snap(0));
    r.sampleIfDue(snap(0.01)); // too soon
    expect(r.getSamples()).toHaveLength(1);
    r.sampleIfDue(snap(0.034)); // >= 1/30
    expect(r.getSamples()).toHaveLength(2);
  });

  it('always records a terminal snapshot even mid-interval', () => {
    const r = new Recorder(30);
    r.sample(snap(0));
    r.sampleTerminal(snap(0.005, 'complete'));
    expect(r.getSamples()).toHaveLength(2);
    expect(r.getSamples()[1]!.runState).toBe('complete');
  });

  it('does not double-record the same terminal snapshot object', () => {
    const r = new Recorder(30);
    const terminal = snap(1, 'failed');
    r.sample(snap(0));
    r.sampleTerminal(terminal);
    r.sampleTerminal(terminal);
    expect(r.getSamples()).toHaveLength(2);
  });

  it('reset clears recorded samples', () => {
    const r = new Recorder(30);
    r.sample(snap(0));
    r.sample(snap(1));
    r.reset();
    expect(r.getSamples()).toHaveLength(0);
  });

  it('rejects a non-positive sample rate', () => {
    expect(() => new Recorder(0)).toThrow(RangeError);
  });
});
