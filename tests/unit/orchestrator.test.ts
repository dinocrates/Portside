import { describe, expect, it } from 'vitest';
import { RunOrchestrator } from '../../src/app/app-state';
import { validateScenario } from '../../src/scenarios/loader';
import { DEFAULT_PHYSICS_DT_S } from '../../src/sim/model/parameters';
import fragileFreightJson from '../../src/scenarios/fragile-freight.json';

const scenario = validateScenario(fragileFreightJson);
const dt = DEFAULT_PHYSICS_DT_S;

describe('RunOrchestrator — lifecycle', () => {
  it('starts ready, in manual mode, not started', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    expect(orch.getSnapshot().runState).toBe('ready');
    expect(orch.getMode()).toBe('manual');
    expect(orch.hasStarted()).toBe(false);
    expect(orch.canStart()).toBe(true);
  });

  it('does not advance physics before start() is called', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    orch.tick(dt * 10);
    expect(orch.getSnapshot().time_s).toBe(0);
  });

  it('reset returns to the initial ready state', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    orch.start();
    orch.setManualDirection('right');
    orch.tick(1.0);
    expect(orch.getSnapshot().time_s).toBeGreaterThan(0);

    orch.reset();
    expect(orch.getSnapshot().time_s).toBe(0);
    expect(orch.getSnapshot().runState).toBe('ready');
    expect(orch.hasStarted()).toBe(false);
  });
});

describe('RunOrchestrator — manual mode', () => {
  it('moves the trolley right while the key is held, and records samples', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    orch.start();
    orch.setManualDirection('right');
    for (let i = 0; i < 240; i++) orch.tick(dt); // 2 seconds
    const snapshot = orch.getSnapshot();
    expect(snapshot.trolley_x_m).toBeGreaterThan(0);
    expect(snapshot.trolley_v_mps).toBeGreaterThan(0);
    expect(orch.getRecordedSamples().length).toBeGreaterThan(1);
  });

  it('blocks a mode switch once a run is actually moving', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    orch.start();
    orch.setManualDirection('right');
    for (let i = 0; i < 5; i++) orch.tick(dt);
    expect(orch.getSnapshot().runState).toBe('running');

    orch.setMode('automated');
    expect(orch.getMode()).toBe('manual');
  });

  it('pause stops the clock; resume continues it', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    orch.start();
    orch.setManualDirection('right');
    orch.tick(dt); // gets into 'running'
    orch.pause();
    const pausedTime = orch.getSnapshot().time_s;
    expect(orch.getDisplayRunState()).toBe('paused');

    orch.tick(1.0); // should be ignored while paused
    expect(orch.getSnapshot().time_s).toBe(pausedTime);

    orch.resume();
    orch.tick(dt);
    expect(orch.getSnapshot().time_s).toBeGreaterThan(pausedTime);
  });

  it('step advances exactly one sample interval while paused', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    orch.start();
    orch.setManualDirection('right');
    orch.tick(dt);
    orch.pause();
    const before = orch.getSnapshot().time_s;
    orch.step();
    expect(orch.getSnapshot().time_s).toBeCloseTo(before + 1 / 30, 9);
  });

  it('an unavailable command sets feedback without altering state', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    orch.start();
    const before = orch.getSnapshot();
    orch.requestUnavailableCommand('Hoist');
    expect(orch.getLastFeedback()).toContain('Hoist');
    expect(orch.getSnapshot()).toBe(before);
  });
});

describe('RunOrchestrator — automated mode', () => {
  it('completes the same trapezoidal profile the golden fixture proves, end to end', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    orch.setMode('automated');
    orch.setProfile([
      { id: 'accelerate', name: 'Accelerate', duration_s: 5.0, trolleyAcceleration_mps2: 0.8 },
      { id: 'cruise', name: 'Cruise', duration_s: 2.5, trolleyAcceleration_mps2: 0.0 },
      { id: 'decelerate', name: 'Decelerate', duration_s: 5.0, trolleyAcceleration_mps2: -0.8 },
    ]);
    expect(orch.canStart()).toBe(true);
    orch.start();

    const totalSteps = Math.ceil(13.5 / dt);
    for (let i = 0; i < totalSteps; i++) orch.tick(dt);

    expect(orch.getSnapshot().runState).toBe('complete');
    expect(orch.getSnapshot().trolley_x_m).toBeCloseTo(30, 1);
    expect(Math.abs(orch.getSnapshot().trolley_v_mps)).toBeLessThan(0.05);
  });

  it('canStart is false for an invalid profile, and start() is a no-op', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    orch.setMode('automated');
    orch.setProfile([{ id: 'bad', name: 'Bad', duration_s: -1, trolleyAcceleration_mps2: 0 }]);
    expect(orch.canStart()).toBe(false);

    orch.start();
    expect(orch.hasStarted()).toBe(false);
    expect(orch.getSnapshot().runState).toBe('ready');
  });

  it('phase editing helpers add/duplicate/reorder/remove correctly', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    orch.setMode('automated');
    const initialLength = orch.getProfile().length;

    orch.duplicatePhase(orch.getProfile()[0]!.id);
    expect(orch.getProfile()).toHaveLength(initialLength + 1);
    expect(orch.getProfile()[1]!.name).toBe(orch.getProfile()[0]!.name);

    const firstId = orch.getProfile()[0]!.id;
    orch.reorderPhase(firstId, 1);
    expect(orch.getProfile()[1]!.id).toBe(firstId);

    orch.removePhase(firstId);
    expect(orch.getProfile().find((p) => p.id === firstId)).toBeUndefined();
  });
});
