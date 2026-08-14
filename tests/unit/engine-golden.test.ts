// Golden-vector tests (spec §14.2): these fixtures are the contract
// between physics, UI, and testing agents. Each fixture drives the real
// DeterministicEngine + ProfileController through a fixed-step loop, the
// same way the app's game loop will, and checks the outcome against a
// hand-computed expectation.

import { describe, expect, it } from 'vitest';
import { DeterministicEngine } from '../../src/sim/engine';
import { ProfileController, type MotionPhase } from '../../src/controllers/profile-controller';
import { validateScenario } from '../../src/scenarios/loader';
import { DEFAULT_PHYSICS_DT_S } from '../../src/sim/model/parameters';
import fragileFreight from '../../src/scenarios/fragile-freight.json';

import trapezoidalSuccess from '../fixtures/golden-vectors/trapezoidal-success.json';
import speedLimitViolation from '../fixtures/golden-vectors/speed-limit-violation.json';
import noDecelerationOvershoot from '../fixtures/golden-vectors/no-deceleration-overshoot.json';

interface GoldenFixture {
  description: string;
  scenarioId: string;
  scenarioVersion: number;
  seed: string;
  simulateFor_s: number;
  profile: MotionPhase[];
  expected: {
    runState: 'complete' | 'failed';
    x_m?: number;
    vx_mps?: number;
    positionTolerance_m?: number;
    velocityTolerance_mps?: number;
    requirements: Record<string, boolean>;
  };
}

const scenariosById: Record<string, unknown> = {
  'fragile-freight-transfer': fragileFreight,
};

function runFixture(fixture: GoldenFixture) {
  const scenarioJson = scenariosById[fixture.scenarioId];
  if (!scenarioJson) throw new Error(`Unknown scenario id in fixture: ${fixture.scenarioId}`);
  const scenario = validateScenario(scenarioJson);
  expect(scenario.version).toBe(fixture.scenarioVersion);

  const engine = new DeterministicEngine();
  const controller = new ProfileController(fixture.profile);

  let snapshot = engine.reset(scenario, fixture.seed);
  controller.reset(snapshot, scenario);

  const dt_s = DEFAULT_PHYSICS_DT_S;
  const steps = Math.ceil(fixture.simulateFor_s / dt_s);
  for (let i = 0; i < steps; i++) {
    const command = controller.command(snapshot, dt_s);
    snapshot = engine.step(command, dt_s);
  }

  return snapshot;
}

describe('golden vectors — Fragile Freight Transfer', () => {
  it.each([
    ['trapezoidal-success', trapezoidalSuccess as GoldenFixture],
    ['speed-limit-violation', speedLimitViolation as GoldenFixture],
    ['no-deceleration-overshoot', noDecelerationOvershoot as GoldenFixture],
  ])('%s', (_name, fixture) => {
    const snapshot = runFixture(fixture);

    expect(snapshot.runState).toBe(fixture.expected.runState);

    if (fixture.expected.x_m !== undefined) {
      expect(snapshot.trolley_x_m).toBeCloseTo(fixture.expected.x_m, 1);
    }
    if (fixture.expected.vx_mps !== undefined) {
      expect(Math.abs(snapshot.trolley_v_mps)).toBeLessThanOrEqual(
        fixture.expected.velocityTolerance_mps ?? 0.05,
      );
    }

    expect(snapshot.requirementResults, 'terminal snapshot should carry requirement results').toBeDefined();
    const byId = new Map(snapshot.requirementResults!.map((r) => [r.id, r]));

    for (const [id, expectedSatisfied] of Object.entries(fixture.expected.requirements)) {
      const result = byId.get(id);
      expect(result, `expected requirement "${id}" to be present in results`).toBeDefined();
      expect(result!.satisfied, `requirement "${id}": ${result?.detail ?? ''}`).toBe(expectedSatisfied);
    }
  });
});
