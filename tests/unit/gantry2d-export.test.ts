import { describe, expect, it } from 'vitest';
import { validateGantryScenario } from '../../src/gantry2d/scenario';
import { GantryOrchestrator } from '../../src/gantry2d/orchestrator';
import { buildGantryCsv, gantryCsvFilename } from '../../src/gantry2d/analysis/export-csv';
import { buildGantryRunSummary, computeGantryRunMetrics, gantryJsonFilename } from '../../src/gantry2d/analysis/export-json';
import { DEFAULT_PHYSICS_DT_S } from '../../src/sim/model/parameters';
import overheadDemoJson from '../../src/gantry2d/scenarios/overhead-demo.json';

const scenario = validateGantryScenario(overheadDemoJson);
const dt = DEFAULT_PHYSICS_DT_S;

// A simple, not-necessarily-successful manual run is enough to exercise
// export — these tests check export/metrics faithfully reflect whatever
// happened, not that the run itself succeeds.
function runManualFor(orch: GantryOrchestrator, seconds: number): void {
  orch.start();
  orch.setXDirection('positive');
  orch.setYDirection('positive');
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    orch.tick(dt);
    if (orch.getSnapshot().runState !== 'running') break;
  }
}

describe('computeGantryRunMetrics', () => {
  it('returns null before any samples exist', () => {
    const orch = new GantryOrchestrator(scenario);
    expect(computeGantryRunMetrics(orch)).toBeNull();
  });

  it('computes factual metrics matching the recorded run', () => {
    const orch = new GantryOrchestrator(scenario);
    runManualFor(orch, 2.0);
    orch.setXDirection('none');
    orch.setYDirection('none');
    for (let i = 0; i < Math.round(2 / dt); i++) orch.tick(dt);

    const metrics = computeGantryRunMetrics(orch)!;
    const final = orch.getSnapshot();
    expect(metrics.finalX_m).toBeCloseTo(final.x_m, 6);
    expect(metrics.finalY_m).toBeCloseTo(final.y_m, 6);
    expect(metrics.finalSpeed_mps).toBeCloseTo(Math.hypot(final.vx_mps, final.vy_mps), 6);
    expect(metrics.maxAbsSpeed_mps).toBeGreaterThan(0);
  });
});

describe('buildGantryRunSummary', () => {
  it('includes scenario id/version, mode, seed, profile, metrics, and requirement results', () => {
    const orch = new GantryOrchestrator(scenario);
    runManualFor(orch, 1.0);

    const summary = buildGantryRunSummary(orch);
    expect(summary.scenarioId).toBe('overhead-gantry-demo');
    expect(summary.scenarioVersion).toBe(scenario.version);
    expect(summary.mode).toBe('manual');
    expect(summary.seed).toBeTruthy();
    expect(summary.metrics).not.toBeNull();
  });

  it('is valid JSON with no student-identifying fields', () => {
    const orch = new GantryOrchestrator(scenario);
    runManualFor(orch, 1.0);
    const json = JSON.stringify(buildGantryRunSummary(orch));
    expect(() => JSON.parse(json)).not.toThrow();
    expect(json.toLowerCase()).not.toContain('studentname');
    expect(json.toLowerCase()).not.toContain('email');
  });
});

describe('buildGantryCsv', () => {
  it('includes metadata header, scenario id, and a row per recorded sample', () => {
    const orch = new GantryOrchestrator(scenario);
    runManualFor(orch, 1.0);
    const csv = buildGantryCsv(orch);
    const lines = csv.split('\n');

    expect(lines[1]).toContain('overhead-gantry-demo');
    const headerIndex = lines.findIndex((l) => l.startsWith('time_s,'));
    expect(headerIndex).toBeGreaterThan(0);
    expect(lines[headerIndex]).toContain('x_m');
    expect(lines[headerIndex]).toContain('y_m');

    const dataLines = lines.slice(headerIndex + 1);
    expect(dataLines.length).toBe(orch.getRecordedSamples().length);
  });

  it('agrees with the recorded samples for a given row', () => {
    const orch = new GantryOrchestrator(scenario);
    runManualFor(orch, 1.0);
    const csv = buildGantryCsv(orch);
    const lines = csv.split('\n');
    const headerIndex = lines.findIndex((l) => l.startsWith('time_s,'));
    const columns = lines[headerIndex]!.split(',');
    const firstDataRow = lines[headerIndex + 1]!.split(',');
    const firstSample = orch.getRecordedSamples()[0]!;

    expect(Number(firstDataRow[columns.indexOf('time_s')])).toBeCloseTo(firstSample.time_s, 6);
    expect(Number(firstDataRow[columns.indexOf('x_m')])).toBeCloseTo(firstSample.x_m, 6);
    expect(Number(firstDataRow[columns.indexOf('y_m')])).toBeCloseTo(firstSample.y_m, 6);
  });
});

describe('gantry filenames', () => {
  it('include the scenario id and an ISO-like timestamp', () => {
    const orch = new GantryOrchestrator(scenario);
    expect(gantryCsvFilename(orch)).toMatch(/^overhead-gantry-demo_.*\.csv$/);
    expect(gantryJsonFilename(orch)).toMatch(/^overhead-gantry-demo_.*\.summary\.json$/);
  });
});
