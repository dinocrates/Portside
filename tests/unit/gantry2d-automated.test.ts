import { describe, expect, it } from 'vitest';
import { validateGantryScenario } from '../../src/gantry2d/scenario';
import { GantryOrchestrator } from '../../src/gantry2d/orchestrator';
import { validateGantryProfile, type GantryMotionProfile } from '../../src/gantry2d/controllers/profile-controller';
import type { GantryScenarioConfig } from '../../src/gantry2d/scenario';
import { ReplayPlayer } from '../../src/analysis/replay';
import { DEFAULT_PHYSICS_DT_S } from '../../src/sim/model/parameters';
import overheadDemoJson from '../../src/gantry2d/scenarios/overhead-demo.json';

const scenario = validateGantryScenario(overheadDemoJson);
const dt = DEFAULT_PHYSICS_DT_S;

// Builds an exact two-axis automated profile that lands both axes on
// target at rest, by merging each axis's independent trapezoidal/
// triangular timing (same analytic approach as gantry2d.test.ts's
// holdTimeForDistance/driveToTarget, but expressed as discrete phases
// instead of a manual hold-and-release) into one shared phase timeline.
interface AxisLeg {
  end_s: number;
  accel: number;
}

// Breakpoints are floored to the physics dt grid — never rounded up. A
// profile-controller phase commands its constant acceleration for its
// *entire* duration (unlike the manual controller, it has no per-step
// "already at cruise speed" governor — see governedAxisCommand in
// manual-controller.ts), so a leg that runs even one dt past the exact
// analytic ramp time commands one extra full-accel step and genuinely
// overshoots the speed cap by a real (non-float) margin, which
// stepTrolley correctly flags as exceeded. Flooring guarantees each leg
// ends at or fractionally before the analytic optimum, leaving at most a
// few millimeters of position slack — negligible next to this scenario's
// 0.5 m target tolerance.
function axisPlan(distance_m: number, vMax: number, aMax: number, dtStep: number): AxisLeg[] {
  // Floor to the dt grid AND subtract one extra step as a safety margin:
  // cumulative float summation of many small phase durations (done again,
  // independently, inside GantryProfileController) doesn't reproduce the
  // exact same boundary this function computed, so a zero-margin floor
  // still occasionally lets the phase switch one step later than
  // intended — enough to overshoot the cap. One dt of margin (~1% of
  // maxSpeed here) safely absorbs that without visibly changing the
  // profile's shape.
  const floorToGrid = (t: number) => Math.max(0, Math.floor(t / dtStep) * dtStep - dtStep);
  const oneSideRampDistance_m = (vMax * vMax) / (2 * aMax);
  if (distance_m <= 2 * oneSideRampDistance_m) {
    const t = floorToGrid(Math.sqrt(distance_m / aMax));
    return [
      { end_s: t, accel: aMax },
      { end_s: 2 * t, accel: -aMax },
    ];
  }
  const rampTime_s = floorToGrid(vMax / aMax);
  const cruiseDistance_m = distance_m - 2 * oneSideRampDistance_m;
  const cruiseEnd_s = rampTime_s + floorToGrid(cruiseDistance_m / vMax);
  return [
    { end_s: rampTime_s, accel: aMax },
    { end_s: cruiseEnd_s, accel: 0 },
    { end_s: rampTime_s + cruiseEnd_s, accel: -aMax },
  ];
}

function accelAt(plan: AxisLeg[], t: number): number {
  for (const leg of plan) {
    if (t < leg.end_s - 1e-9) return leg.accel;
  }
  return 0;
}

function buildMergedProfile(s: GantryScenarioConfig): GantryMotionProfile {
  const vMax = s.limits.maxSpeed_mps;
  const aMax = s.limits.maxAcceleration_mps2;
  const distX = s.geometry.targetX_m - s.geometry.initialX_m;
  const distY = s.geometry.targetY_m - s.geometry.initialY_m;
  const planX = axisPlan(distX, vMax, aMax, dt);
  const planY = axisPlan(distY, vMax, aMax, dt);
  const breakpoints = Array.from(new Set([...planX.map((l) => l.end_s), ...planY.map((l) => l.end_s)])).sort((a, b) => a - b);

  const phases: GantryMotionProfile = [];
  let prev = 0;
  breakpoints.forEach((end_s, i) => {
    const mid = (prev + end_s) / 2;
    phases.push({
      id: `merged-${i}`,
      name: `Leg ${i + 1}`,
      duration_s: end_s - prev,
      ax_mps2: accelAt(planX, mid),
      ay_mps2: accelAt(planY, mid),
    });
    prev = end_s;
  });
  return phases;
}

function runAutomatedToCompletion(orch: GantryOrchestrator): void {
  orch.setMode('automated');
  orch.setProfile(buildMergedProfile(scenario));
  orch.start();
  const totalSteps = Math.round(15 / dt);
  for (let i = 0; i < totalSteps; i++) {
    orch.tick(dt);
    if (orch.getSnapshot().runState !== 'running') break;
  }
}

describe('validateGantryProfile', () => {
  it('accepts a profile within limits', () => {
    const profile: GantryMotionProfile = [{ id: 'a', name: 'Accelerate', duration_s: 1, ax_mps2: 0.5, ay_mps2: 0.5 }];
    expect(validateGantryProfile(profile, scenario)).toHaveLength(0);
  });

  it('rejects a non-positive duration', () => {
    const profile: GantryMotionProfile = [{ id: 'a', name: 'Bad', duration_s: 0, ax_mps2: 0, ay_mps2: 0 }];
    const errors = validateGantryProfile(profile, scenario);
    expect(errors.some((e) => e.field === 'duration_s')).toBe(true);
  });

  it('rejects an X or Y acceleration magnitude beyond the scenario limit', () => {
    const profile: GantryMotionProfile = [
      { id: 'a', name: 'Too fast', duration_s: 1, ax_mps2: 999, ay_mps2: 0 },
      { id: 'b', name: 'Also too fast', duration_s: 1, ax_mps2: 0, ay_mps2: -999 },
    ];
    const errors = validateGantryProfile(profile, scenario);
    expect(errors.some((e) => e.phaseIndex === 0 && e.field === 'ax_mps2')).toBe(true);
    expect(errors.some((e) => e.phaseIndex === 1 && e.field === 'ay_mps2')).toBe(true);
  });
});

describe('GantryOrchestrator — profile editing', () => {
  it('starts with a valid default profile template', () => {
    const orch = new GantryOrchestrator(scenario);
    expect(orch.getProfile().length).toBeGreaterThan(0);
    expect(orch.validateCurrentProfile()).toHaveLength(0);
  });

  it('add/update/duplicate/reorder/remove all mutate the profile and notify listeners', () => {
    const orch = new GantryOrchestrator(scenario);
    let changeCount = 0;
    orch.onChange(() => changeCount++);

    orch.setProfile([]);
    orch.addPhase({ id: 'p1', name: 'One', duration_s: 1, ax_mps2: 0, ay_mps2: 0 });
    orch.addPhase({ id: 'p2', name: 'Two', duration_s: 2, ax_mps2: 0.1, ay_mps2: 0.2 });
    expect(orch.getProfile().map((p) => p.id)).toEqual(['p1', 'p2']);

    orch.updatePhase('p1', { duration_s: 5 });
    expect(orch.getProfile()[0]!.duration_s).toBe(5);

    orch.duplicatePhase('p1');
    // Profile is now [p1, p1-copy, p2] — duplicate inserts right after its source.
    expect(orch.getProfile()).toHaveLength(3);
    expect(orch.getProfile()[1]!.duration_s).toBe(5);
    expect(orch.getProfile()[2]!.id).toBe('p2');

    orch.reorderPhase('p2', -1);
    // p2 moves up one slot: [p1, p2, p1-copy].
    expect(orch.getProfile()[1]!.id).toBe('p2');

    orch.removePhase('p2');
    expect(orch.getProfile().find((p) => p.id === 'p2')).toBeUndefined();

    expect(changeCount).toBeGreaterThan(0);
  });

  it('canStart is false in automated mode when the profile is invalid', () => {
    const orch = new GantryOrchestrator(scenario);
    orch.setMode('automated');
    orch.setProfile([{ id: 'bad', name: 'Bad', duration_s: -1, ax_mps2: 0, ay_mps2: 0 }]);
    expect(orch.canStart()).toBe(false);
  });

  it('totalProfileTime_s sums phase durations', () => {
    const orch = new GantryOrchestrator(scenario);
    orch.setProfile([
      { id: 'a', name: 'A', duration_s: 1.5, ax_mps2: 0, ay_mps2: 0 },
      { id: 'b', name: 'B', duration_s: 2.5, ax_mps2: 0, ay_mps2: 0 },
    ]);
    expect(orch.totalProfileTime_s()).toBeCloseTo(4.0, 6);
  });
});

describe('GantryOrchestrator — automated mode', () => {
  it('drives both axes to the target using a dual-axis phase profile and reports the active phase id', () => {
    const orch = new GantryOrchestrator(scenario);
    orch.setMode('automated');
    orch.setProfile(buildMergedProfile(scenario));
    orch.start();
    orch.tick(dt);
    expect(orch.getSnapshot().activePhaseId).toBe('merged-0');
  });

  it('completes when the merged profile lands both axes on target at rest', () => {
    const orch = new GantryOrchestrator(scenario);
    runAutomatedToCompletion(orch);
    const s = orch.getSnapshot();
    expect(s.runState).toBe('complete');
    expect(Math.hypot(s.x_m - scenario.geometry.targetX_m, s.y_m - scenario.geometry.targetY_m)).toBeLessThanOrEqual(
      scenario.geometry.targetTolerance_m,
    );
  });

  it('pins the profile used for the run separately from later edits to the draft profile', () => {
    const orch = new GantryOrchestrator(scenario);
    const profile = buildMergedProfile(scenario);
    orch.setMode('automated');
    orch.setProfile(profile);
    orch.start();
    orch.setProfile([{ id: 'edited-after-start', name: 'x', duration_s: 1, ax_mps2: 0, ay_mps2: 0 }]);

    expect(orch.getProfileUsedForRun()).toEqual(profile);
    expect(orch.getProfile()[0]!.id).toBe('edited-after-start');
  });
});

describe('GantryOrchestrator — recorder + replay', () => {
  it('records samples during a run and exposes them via getRecordedSamples', () => {
    const orch = new GantryOrchestrator(scenario);
    orch.start();
    orch.setXDirection('positive');
    for (let i = 0; i < 60; i++) orch.tick(dt);
    expect(orch.getRecordedSamples().length).toBeGreaterThan(1);
  });

  it('is not replayable before a run reaches a terminal state', () => {
    const orch = new GantryOrchestrator(scenario);
    orch.start();
    expect(orch.canReplay()).toBe(false);
  });

  it('is replayable after completion, with bounds spanning the recorded run', () => {
    const orch = new GantryOrchestrator(scenario);
    runAutomatedToCompletion(orch);
    expect(orch.canReplay()).toBe(true);
    const bounds = orch.getReplayBounds()!;
    expect(bounds.min_s).toBe(0);
    expect(bounds.max_s).toBeCloseTo(orch.getSnapshot().time_s, 6);
  });

  it('scrubTo clamps to the recorded bounds and getDisplaySnapshot returns the nearest sample', () => {
    const orch = new GantryOrchestrator(scenario);
    runAutomatedToCompletion(orch);
    orch.startReplay();
    orch.scrubTo(-100);
    expect(orch.getReplayTime_s()).toBe(0);

    const bounds = orch.getReplayBounds()!;
    orch.scrubTo(bounds.max_s + 100);
    expect(orch.getReplayTime_s()).toBeCloseTo(bounds.max_s, 6);

    orch.scrubTo(bounds.max_s / 2);
    const display = orch.getDisplaySnapshot();
    expect(Math.abs(display.time_s - bounds.max_s / 2)).toBeLessThan(1 / 30 + 1e-6);
  });

  it('works with the shared ReplayPlayer (structural interface, not a gantry-specific copy)', () => {
    const orch = new GantryOrchestrator(scenario);
    runAutomatedToCompletion(orch);
    const player = new ReplayPlayer(orch);

    player.play();
    expect(orch.isReplayingNow()).toBe(true);
    player.tick(1000);
    expect(orch.getReplayTime_s()).toBeCloseTo(1.0, 6);
  });

  it('reports per-requirement results, not a collapsed score, on completion', () => {
    const orch = new GantryOrchestrator(scenario);
    runAutomatedToCompletion(orch);
    const results = orch.getSnapshot().requirementResults;
    expect(results).toBeDefined();
    expect(results!.length).toBeGreaterThanOrEqual(5);
  });
});

describe('GantryOrchestrator — draft and completed-run restoration', () => {
  it('restoreDraft applies a saved mode and profile', () => {
    const orch = new GantryOrchestrator(scenario);
    const profile: GantryMotionProfile = [{ id: 'x', name: 'X', duration_s: 3, ax_mps2: 0.2, ay_mps2: -0.1 }];
    orch.restoreDraft({ mode: 'automated', profile });
    expect(orch.getMode()).toBe('automated');
    expect(orch.getProfile()).toEqual(profile);
  });

  it('restoreCompletedRun hydrates a terminal snapshot and recorded samples without rerunning physics', () => {
    const source = new GantryOrchestrator(scenario);
    runAutomatedToCompletion(source);
    const finalSnapshot = source.getSnapshot();
    const samples = source.getRecordedSamples();

    const target = new GantryOrchestrator(scenario);
    target.restoreCompletedRun({
      mode: 'automated',
      profileUsedForRun: source.getProfileUsedForRun(),
      seed: source.getSeed(),
      finalSnapshot,
      samples,
    });

    expect(target.getSnapshot()).toEqual(finalSnapshot);
    expect(target.getRecordedSamples()).toEqual(samples);
    expect(target.hasStarted()).toBe(true);
    expect(target.canReplay()).toBe(true);
  });
});
