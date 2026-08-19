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

  it('holding a direction past reaching cruise speed does not spuriously fail the run (regression)', () => {
    // Bug: the manual controller used to keep commanding full acceleration
    // even after the physics clamp had already capped velocity at
    // maxSpeed_mps. Every subsequent step's *unclamped* integration
    // attempt then read as "exceeded max speed" (src/sim/physics/trolley.ts),
    // which failed the run — even though the actual clamped velocity never
    // exceeded the limit. A student holding the key at cruise (completely
    // normal per spec §6.2, "accelerates toward the scenario's allowed
    // manual speed") should never see their run fail for that alone.
    const orch = new RunOrchestrator(scenario, 'test-seed');
    orch.start();
    orch.setManualDirection('right');
    // 8s at aMax=0.8 reaches vMax=4.0 around t=5s; keep holding well past that.
    for (let i = 0; i < Math.round(8 / dt); i++) orch.tick(dt);

    expect(orch.getSnapshot().runState).toBe('running');
    expect(orch.getSnapshot().trolley_v_mps).toBeCloseTo(scenario.limits.maxSpeed_mps, 2);
    expect(orch.getSnapshot().trolley_a_mps2).toBeCloseTo(0, 2); // governed cruise, not still pushing at aMax
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

  it('records activePhaseId on samples and pins the profile actually used for the run', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    orch.setMode('automated');
    const profile = [
      { id: 'accelerate', name: 'Accelerate', duration_s: 5.0, trolleyAcceleration_mps2: 0.8 },
      { id: 'cruise', name: 'Cruise', duration_s: 2.5, trolleyAcceleration_mps2: 0.0 },
      { id: 'decelerate', name: 'Decelerate', duration_s: 5.0, trolleyAcceleration_mps2: -0.8 },
    ];
    orch.setProfile(profile);
    orch.start();
    expect(orch.getProfileUsedForRun()).toEqual(profile);

    for (let i = 0; i < Math.round(1 / dt); i++) orch.tick(dt); // 1s in -> should be mid "accelerate"
    expect(orch.getSnapshot().activePhaseId).toBe('accelerate');

    for (let i = 0; i < Math.round(6 / dt); i++) orch.tick(dt); // 7s in -> should be mid "cruise"
    expect(orch.getSnapshot().activePhaseId).toBe('cruise');

    // Editing the draft profile afterward must not retroactively change what the run record says was used.
    orch.setProfile([{ id: 'edited', name: 'Edited', duration_s: 1, trolleyAcceleration_mps2: 0 }]);
    expect(orch.getProfileUsedForRun()).toEqual(profile);
  });
});

describe('RunOrchestrator — replay', () => {
  function runToCompletion(orch: RunOrchestrator): void {
    orch.setMode('automated');
    orch.setProfile([
      { id: 'accelerate', name: 'Accelerate', duration_s: 5.0, trolleyAcceleration_mps2: 0.8 },
      { id: 'cruise', name: 'Cruise', duration_s: 2.5, trolleyAcceleration_mps2: 0.0 },
      { id: 'decelerate', name: 'Decelerate', duration_s: 5.0, trolleyAcceleration_mps2: -0.8 },
    ]);
    orch.start();
    const totalSteps = Math.ceil(13.5 / dt);
    for (let i = 0; i < totalSteps; i++) orch.tick(dt);
  }

  it('cannot replay before a run reaches a terminal state', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    expect(orch.canReplay()).toBe(false);
    orch.startReplay();
    expect(orch.isReplayingNow()).toBe(false);
  });

  it('replay does not affect the live engine snapshot, only the display snapshot', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    runToCompletion(orch);
    expect(orch.canReplay()).toBe(true);

    const liveFinal = orch.getSnapshot();
    orch.startReplay();
    orch.scrubTo(2.0);

    expect(orch.getSnapshot()).toBe(liveFinal); // untouched
    expect(orch.getDisplaySnapshot().time_s).toBeCloseTo(2.0, 1);
    expect(orch.getDisplaySnapshot().trolley_x_m).toBeLessThan(liveFinal.trolley_x_m);
  });

  it('scrubTo clamps to the recorded range', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    runToCompletion(orch);
    orch.startReplay();

    orch.scrubTo(-5);
    expect(orch.getReplayTime_s()).toBeCloseTo(0, 6);

    orch.scrubTo(999);
    const bounds = orch.getReplayBounds()!;
    expect(orch.getReplayTime_s()).toBeCloseTo(bounds.max_s, 6);
  });

  it('exitReplay returns display snapshot to the live engine state', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    runToCompletion(orch);
    orch.startReplay();
    orch.scrubTo(1.0);
    orch.exitReplay();
    expect(orch.getDisplaySnapshot()).toBe(orch.getSnapshot());
  });

  it('reset exits replay', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    runToCompletion(orch);
    orch.startReplay();
    orch.reset();
    expect(orch.isReplayingNow()).toBe(false);
    expect(orch.canReplay()).toBe(false);
  });
});

describe('RunOrchestrator — restoring persisted state (spec §12.2)', () => {
  it('restoreDraft applies the saved mode and profile', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    const profile = [{ id: 'x', name: 'Custom', duration_s: 2, trolleyAcceleration_mps2: 0.3 }];
    orch.restoreDraft({ mode: 'automated', profile });
    expect(orch.getMode()).toBe('automated');
    expect(orch.getProfile()).toEqual(profile);
  });

  it('restoreCompletedRun hydrates a terminal run without touching the live engine', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    const profile = [
      { id: 'accelerate', name: 'Accelerate', duration_s: 5.0, trolleyAcceleration_mps2: 0.8 },
      { id: 'cruise', name: 'Cruise', duration_s: 2.5, trolleyAcceleration_mps2: 0.0 },
      { id: 'decelerate', name: 'Decelerate', duration_s: 5.0, trolleyAcceleration_mps2: -0.8 },
    ];
    const finalSnapshot = {
      time_s: 12.69,
      runState: 'complete' as const,
      activePhaseId: null,
      trolley_x_m: 30,
      trolley_v_mps: 0,
      trolley_a_mps2: 0,
      commanded_trolley_a_mps2: 0,
      attachment: 'attached' as const,
      requirementResults: [{ id: 'final-position', description: 'x', satisfied: true }],
    };
    const samples = [finalSnapshot];

    orch.restoreCompletedRun({ mode: 'automated', profileUsedForRun: profile, seed: 'restored-seed', finalSnapshot, samples });

    expect(orch.getSnapshot()).toEqual(finalSnapshot);
    expect(orch.getRecordedSamples()).toEqual(samples);
    expect(orch.getProfileUsedForRun()).toEqual(profile);
    expect(orch.getSeed()).toBe('restored-seed');
    expect(orch.hasStarted()).toBe(true);
    expect(orch.canReplay()).toBe(true);
    // A restored run is a past result, not a live one — Start requires an
    // explicit Reset first, same as any other completed run.
    expect(orch.canStart()).toBe(false);
  });

  it('restoreCompletedRun refuses a non-terminal snapshot (defensive — should never happen with well-formed persisted data)', () => {
    const orch = new RunOrchestrator(scenario, 'test-seed');
    const notTerminal = {
      time_s: 1,
      runState: 'running' as const,
      activePhaseId: null,
      trolley_x_m: 1,
      trolley_v_mps: 1,
      trolley_a_mps2: 0,
      commanded_trolley_a_mps2: 0,
      attachment: 'attached' as const,
    };
    orch.restoreCompletedRun({ mode: 'manual', profileUsedForRun: null, seed: 's', finalSnapshot: notTerminal, samples: [notTerminal] });
    expect(orch.hasStarted()).toBe(false);
    expect(orch.getSnapshot().runState).toBe('ready');
  });
});
