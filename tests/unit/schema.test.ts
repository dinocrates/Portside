import { describe, expect, it } from 'vitest';
import { loadScenarioFromJson, ScenarioValidationError, validateScenario } from '../../src/scenarios/loader';
import fragileFreight from '../../src/scenarios/fragile-freight.json';
import tutorial from '../../src/scenarios/tutorial.json';

describe('scenario schema validation', () => {
  it('accepts the Fragile Freight Transfer scenario', () => {
    const scenario = validateScenario(fragileFreight);
    expect(scenario.id).toBe('fragile-freight-transfer');
    expect(scenario.limits.maxSpeed_mps).toBe(4.0);
    expect(scenario.geometry.targetX_m).toBe(30);
  });

  it('accepts the Controls Tutorial scenario, completable with generous tolerances', () => {
    const scenario = validateScenario(tutorial);
    expect(scenario.id).toBe('controls-tutorial');
    // Tutorial must have completion requirements (spec §10.2: "no failure
    // penalty" means generous tolerances, not "impossible to complete" —
    // an empty scoring array can never satisfy evaluateRequirements'
    // completion check, see src/sim/metrics.ts).
    expect(scenario.scoring.length).toBeGreaterThan(0);
  });

  it('rejects a scenario missing required fields, with a developer-readable message', () => {
    expect(() => validateScenario({ id: 'broken' })).toThrow(ScenarioValidationError);
  });

  it('rejects a scenario whose target lies outside the travel envelope', () => {
    const broken = {
      ...fragileFreight,
      geometry: { ...fragileFreight.geometry, targetX_m: 999 },
    };
    expect(() => validateScenario(broken)).toThrow(ScenarioValidationError);
  });

  it('rejects invalid JSON without executing it', () => {
    expect(() => loadScenarioFromJson('not json')).toThrow(ScenarioValidationError);
  });

  it('parses and validates a well-formed JSON string round-trip', () => {
    const scenario = loadScenarioFromJson(JSON.stringify(fragileFreight));
    expect(scenario.title).toBe('Fragile Freight Transfer');
  });
});
