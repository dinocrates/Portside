import { describe, expect, it } from 'vitest';
import { validateGantryScenario } from '../../src/gantry2d/scenario';
import { GantryOrchestrator } from '../../src/gantry2d/orchestrator';
import { DEFAULT_PHYSICS_DT_S } from '../../src/sim/model/parameters';
import overheadDemoJson from '../../src/gantry2d/scenarios/overhead-demo.json';

const scenario = validateGantryScenario(overheadDemoJson);
const dt = DEFAULT_PHYSICS_DT_S;

describe('Gantry scenario schema', () => {
  it('accepts the delivered demo scenario', () => {
    expect(scenario.id).toBe('overhead-gantry-demo');
    expect(scenario.geometry.targetX_m).toBe(8);
  });

  it('rejects a target outside the playfield envelope', () => {
    const broken = { ...overheadDemoJson, geometry: { ...overheadDemoJson.geometry, targetX_m: 999 } };
    expect(() => validateGantryScenario(broken)).toThrow();
  });

  it('rejects a degenerate envelope (max <= min)', () => {
    const broken = { ...overheadDemoJson, geometry: { ...overheadDemoJson.geometry, maxX_m: 0 } };
    expect(() => validateGantryScenario(broken)).toThrow();
  });
});

describe('GantryOrchestrator — lifecycle', () => {
  it('starts ready, not started', () => {
    const orch = new GantryOrchestrator(scenario);
    expect(orch.getSnapshot().runState).toBe('ready');
    expect(orch.hasStarted()).toBe(false);
    expect(orch.getSnapshot().x_m).toBe(scenario.geometry.initialX_m);
    expect(orch.getSnapshot().y_m).toBe(scenario.geometry.initialY_m);
  });

  it('does not advance physics before start()', () => {
    const orch = new GantryOrchestrator(scenario);
    orch.tick(1.0);
    expect(orch.getSnapshot().time_s).toBe(0);
  });

  it('reset returns to the initial state', () => {
    const orch = new GantryOrchestrator(scenario);
    orch.start();
    orch.setXDirection('positive');
    orch.tick(1.0);
    expect(orch.getSnapshot().time_s).toBeGreaterThan(0);

    orch.reset();
    expect(orch.getSnapshot().time_s).toBe(0);
    expect(orch.getSnapshot().runState).toBe('ready');
    expect(orch.hasStarted()).toBe(false);
  });
});

describe('GantryOrchestrator — two independent axes', () => {
  it('moves along X only when only X is held', () => {
    const orch = new GantryOrchestrator(scenario);
    orch.start();
    orch.setXDirection('positive');
    for (let i = 0; i < 60; i++) orch.tick(dt);
    expect(orch.getSnapshot().x_m).toBeGreaterThan(scenario.geometry.initialX_m);
    expect(orch.getSnapshot().y_m).toBe(scenario.geometry.initialY_m);
  });

  it('moves diagonally when both axes are held simultaneously', () => {
    const orch = new GantryOrchestrator(scenario);
    orch.start();
    orch.setXDirection('positive');
    orch.setYDirection('positive');
    for (let i = 0; i < 60; i++) orch.tick(dt);
    expect(orch.getSnapshot().x_m).toBeGreaterThan(scenario.geometry.initialX_m);
    expect(orch.getSnapshot().y_m).toBeGreaterThan(scenario.geometry.initialY_m);
  });

  it('holding a direction past reaching cruise speed does not spuriously fail the run', () => {
    // Same regression class as the 1D lab's manual-controller bug — proven
    // fixed there, verified here from the start rather than re-discovering it.
    const orch = new GantryOrchestrator(scenario);
    orch.start();
    orch.setXDirection('positive');
    const timeToStop_s = scenario.limits.maxSpeed_mps / scenario.limits.maxAcceleration_mps2;
    for (let i = 0; i < Math.round((timeToStop_s + 1.5) / dt); i++) orch.tick(dt);
    expect(orch.getSnapshot().runState).toBe('running');
    expect(orch.getSnapshot().vx_mps).toBeCloseTo(scenario.limits.maxSpeed_mps, 2);
    expect(orch.getSnapshot().ax_mps2).toBeCloseTo(0, 2);
  });

  it('never exceeds the playfield envelope on either axis', () => {
    const orch = new GantryOrchestrator(scenario);
    orch.start();
    orch.setXDirection('positive');
    orch.setYDirection('positive');
    for (let i = 0; i < Math.round(30 / dt); i++) orch.tick(dt);
    const s = orch.getSnapshot();
    expect(s.x_m).toBeLessThanOrEqual(scenario.geometry.maxX_m + 1e-6);
    expect(s.y_m).toBeLessThanOrEqual(scenario.geometry.maxY_m + 1e-6);
  });
});

// X (7 m) and Y (3.5 m) need different travel distances but share the same
// speed/accel limits, so they need *different* hold durations to each land
// on target — X gets a trapezoidal profile (reaches cruise speed), Y a
// triangular one (never does). Same analytic approach as the 1D lab's
// e2e tutorial-completion test, just computed per axis and released
// independently.
function holdTimeForDistance(distance_m: number): number {
  const vMax = scenario.limits.maxSpeed_mps;
  const aMax = scenario.limits.maxAcceleration_mps2;
  const oneSideRampDistance_m = (vMax * vMax) / (2 * aMax);
  if (distance_m <= 2 * oneSideRampDistance_m) {
    return Math.sqrt(distance_m / aMax); // triangular: never reaches vMax
  }
  const rampTime_s = vMax / aMax;
  const cruiseDistance_m = distance_m - 2 * oneSideRampDistance_m;
  return rampTime_s + cruiseDistance_m / vMax;
}

function driveToTarget(orch: GantryOrchestrator): void {
  const holdX_s = holdTimeForDistance(scenario.geometry.targetX_m - scenario.geometry.initialX_m);
  const holdY_s = holdTimeForDistance(scenario.geometry.targetY_m - scenario.geometry.initialY_m);
  orch.setXDirection('positive');
  orch.setYDirection('positive');

  let xReleased = false;
  let yReleased = false;
  for (let i = 0; i < Math.round(15 / dt); i++) {
    orch.tick(dt);
    const t = orch.getSnapshot().time_s;
    if (!yReleased && t >= holdY_s) {
      orch.setYDirection('none');
      yReleased = true;
    }
    if (!xReleased && t >= holdX_s) {
      orch.setXDirection('none');
      xReleased = true;
    }
    if (orch.getSnapshot().runState !== 'running') break;
  }
}

describe('GantryOrchestrator — reaching the target', () => {
  it('completes when driven to the target and braked to rest on both axes', () => {
    const orch = new GantryOrchestrator(scenario);
    orch.start();
    driveToTarget(orch);

    const s = orch.getSnapshot();
    expect(s.runState).toBe('complete');
    expect(Math.hypot(s.x_m - scenario.geometry.targetX_m, s.y_m - scenario.geometry.targetY_m)).toBeLessThanOrEqual(
      scenario.geometry.targetTolerance_m,
    );
  });

  it('reports per-requirement results, not a collapsed score, on completion', () => {
    const orch = new GantryOrchestrator(scenario);
    orch.start();
    driveToTarget(orch);

    const results = orch.getSnapshot().requirementResults;
    expect(results).toBeDefined();
    expect(results!.length).toBeGreaterThanOrEqual(5);
    expect(results!.every((r) => r.satisfied)).toBe(true);
  });

  it('pause stops both axes; resume continues them', () => {
    const orch = new GantryOrchestrator(scenario);
    orch.start();
    orch.setXDirection('positive');
    orch.setYDirection('positive');
    orch.tick(dt);
    orch.pause();
    const paused = orch.getSnapshot();
    expect(orch.getDisplayRunState()).toBe('paused');

    orch.tick(1.0);
    expect(orch.getSnapshot().time_s).toBe(paused.time_s);

    orch.resume();
    orch.tick(dt);
    expect(orch.getSnapshot().time_s).toBeGreaterThan(paused.time_s);
  });
});
