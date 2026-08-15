import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO_ID, getScenarioJson, resolveScenarioId, SCENARIO_REGISTRY } from '../../src/scenarios/registry';
import { validateScenario } from '../../src/scenarios/loader';

describe('scenario registry', () => {
  it('lists both initial scenarios (spec §10.2)', () => {
    const ids = SCENARIO_REGISTRY.map((s) => s.id);
    expect(ids).toContain('controls-tutorial');
    expect(ids).toContain('fragile-freight-transfer');
  });

  it('every registered scenario actually validates against the schema', () => {
    for (const entry of SCENARIO_REGISTRY) {
      expect(() => validateScenario(entry.json)).not.toThrow();
    }
  });

  it('resolveScenarioId accepts a known id', () => {
    expect(resolveScenarioId('controls-tutorial')).toBe('controls-tutorial');
  });

  it('resolveScenarioId falls back to the default for null, empty, or unknown input', () => {
    expect(resolveScenarioId(null)).toBe(DEFAULT_SCENARIO_ID);
    expect(resolveScenarioId('')).toBe(DEFAULT_SCENARIO_ID);
    expect(resolveScenarioId('not-a-real-scenario')).toBe(DEFAULT_SCENARIO_ID);
    expect(resolveScenarioId('<script>alert(1)</script>')).toBe(DEFAULT_SCENARIO_ID);
  });

  it('getScenarioJson returns the matching entry, and falls back for an unknown id', () => {
    const tutorial = validateScenario(getScenarioJson('controls-tutorial'));
    expect(tutorial.id).toBe('controls-tutorial');

    const fallback = validateScenario(getScenarioJson('nonsense'));
    expect(fallback.id).toBe(DEFAULT_SCENARIO_ID);
  });
});
