import { describe, expect, it } from 'vitest';
import { RunOrchestrator } from '../../src/app/app-state';
import { buildCsv, csvFilename } from '../../src/analysis/export-csv';
import { buildRunSummary, computeRunMetrics, jsonFilename } from '../../src/analysis/export-json';
import { validateScenario } from '../../src/scenarios/loader';
import { DEFAULT_PHYSICS_DT_S } from '../../src/sim/model/parameters';
import fragileFreightJson from '../../src/scenarios/fragile-freight.json';

const scenario = validateScenario(fragileFreightJson);
const dt = DEFAULT_PHYSICS_DT_S;

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

describe('computeRunMetrics', () => {
  it('returns null before any samples exist', () => {
    const orch = new RunOrchestrator(scenario, 'seed');
    expect(computeRunMetrics(orch)).toBeNull();
  });

  it('computes factual metrics matching the completed run', () => {
    const orch = new RunOrchestrator(scenario, 'seed');
    runToCompletion(orch);
    const metrics = computeRunMetrics(orch)!;
    expect(metrics.success).toBe(true);
    expect(metrics.finalPosition_m).toBeCloseTo(30, 1);
    expect(metrics.finalPositionError_m).toBeCloseTo(0, 1);
    expect(Math.abs(metrics.finalSpeed_mps)).toBeLessThan(0.05);
    expect(metrics.maxAbsSpeed_mps).toBeCloseTo(4.0, 1);
    expect(metrics.maxAbsAcceleration_mps2).toBeCloseTo(0.8, 1);
    expect(metrics.totalTime_s).toBeGreaterThan(12);
  });
});

describe('buildRunSummary', () => {
  it('includes scenario id/version, seed, profile, metrics, and requirement results', () => {
    const orch = new RunOrchestrator(scenario, 'seed');
    runToCompletion(orch);
    const summary = buildRunSummary(orch);

    expect(summary.scenarioId).toBe('fragile-freight-transfer');
    expect(summary.scenarioVersion).toBe(1);
    expect(summary.mode).toBe('automated');
    expect(summary.seed).toBeTruthy();
    expect(Array.isArray(summary.profile)).toBe(true);
    expect(summary.metrics?.success).toBe(true);
    expect(summary.requirementResults.length).toBeGreaterThan(0);
    expect(summary.requirementResults.every((r) => r.satisfied)).toBe(true);
  });

  it('is valid JSON with no student-identifying fields by default (spec §9.4)', () => {
    // Note: "name" legitimately appears as each motion phase's label (e.g.
    // "Accelerate") — that's profile data, not student identity. The
    // check is for actual PII field names, which the export never adds.
    const orch = new RunOrchestrator(scenario, 'seed');
    runToCompletion(orch);
    const json = JSON.stringify(buildRunSummary(orch));
    expect(() => JSON.parse(json)).not.toThrow();
    expect(json.toLowerCase()).not.toContain('studentname');
    expect(json.toLowerCase()).not.toContain('student_name');
    expect(json.toLowerCase()).not.toContain('email');
    expect(json.toLowerCase()).not.toContain('studentid');
  });
});

describe('buildCsv', () => {
  it('includes metadata header, scenario id, and a row per recorded sample', () => {
    const orch = new RunOrchestrator(scenario, 'seed');
    runToCompletion(orch);
    const csv = buildCsv(orch);
    const lines = csv.split('\n');

    expect(lines[1]).toContain('fragile-freight-transfer');
    const headerIndex = lines.findIndex((l) => l.startsWith('time_s,'));
    expect(headerIndex).toBeGreaterThan(0);

    const dataLines = lines.slice(headerIndex + 1);
    expect(dataLines.length).toBe(orch.getRecordedSamples().length);
  });

  it('agrees with the recorded samples for a given row', () => {
    const orch = new RunOrchestrator(scenario, 'seed');
    runToCompletion(orch);
    const csv = buildCsv(orch);
    const lines = csv.split('\n');
    const headerIndex = lines.findIndex((l) => l.startsWith('time_s,'));
    const firstDataRow = lines[headerIndex + 1]!.split(',');
    const firstSample = orch.getRecordedSamples()[0]!;

    expect(Number(firstDataRow[0])).toBeCloseTo(firstSample.time_s, 6);
    expect(Number(firstDataRow[1])).toBeCloseTo(firstSample.trolley_x_m, 6);
  });
});

describe('filenames', () => {
  it('include the scenario id and an ISO-like timestamp', () => {
    const orch = new RunOrchestrator(scenario, 'seed');
    expect(csvFilename(orch)).toMatch(/^fragile-freight-transfer_.*\.csv$/);
    expect(jsonFilename(orch)).toMatch(/^fragile-freight-transfer_.*\.summary\.json$/);
  });
});
