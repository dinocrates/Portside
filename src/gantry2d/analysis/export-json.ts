// JSON run-summary export for the 2D gantry lab — same shape and
// philosophy as the 1D lab's src/analysis/export-json.ts ("report factual
// metrics, not a mysterious composite score"), with two-axis metrics.

import type { GantryOrchestrator } from '../orchestrator';
import type { RequirementResult } from '../../sim/model/snapshot';

export interface GantryRunMetrics {
  success: boolean;
  totalTime_s: number;
  finalX_m: number;
  finalY_m: number;
  finalPositionError_m: number;
  finalSpeed_mps: number;
  maxAbsSpeed_mps: number;
  maxAbsAxAcceleration_mps2: number;
  maxAbsAyAcceleration_mps2: number;
}

/** Computed directly from the recorded samples — the same values the graphs and CSV export show. */
export function computeGantryRunMetrics(orchestrator: GantryOrchestrator): GantryRunMetrics | null {
  const samples = orchestrator.getRecordedSamples();
  if (samples.length === 0) return null;
  const final = samples[samples.length - 1]!;

  let maxAbsSpeed = 0;
  let maxAbsAx = 0;
  let maxAbsAy = 0;
  for (const s of samples) {
    maxAbsSpeed = Math.max(maxAbsSpeed, Math.hypot(s.vx_mps, s.vy_mps));
    maxAbsAx = Math.max(maxAbsAx, Math.abs(s.ax_mps2));
    maxAbsAy = Math.max(maxAbsAy, Math.abs(s.ay_mps2));
  }

  const { targetX_m, targetY_m } = orchestrator.scenario.geometry;

  return {
    success: final.runState === 'complete',
    totalTime_s: final.time_s,
    finalX_m: final.x_m,
    finalY_m: final.y_m,
    finalPositionError_m: Math.hypot(final.x_m - targetX_m, final.y_m - targetY_m),
    finalSpeed_mps: Math.hypot(final.vx_mps, final.vy_mps),
    maxAbsSpeed_mps: maxAbsSpeed,
    maxAbsAxAcceleration_mps2: maxAbsAx,
    maxAbsAyAcceleration_mps2: maxAbsAy,
  };
}

export interface GantryRunSummaryExport {
  scenarioId: string;
  scenarioVersion: number;
  mode: string;
  seed: string;
  exportedAt: string;
  profile: unknown;
  metrics: GantryRunMetrics | null;
  requirementResults: RequirementResult[];
}

export function buildGantryRunSummary(orchestrator: GantryOrchestrator): GantryRunSummaryExport {
  return {
    scenarioId: orchestrator.scenario.id,
    scenarioVersion: orchestrator.scenario.version,
    mode: orchestrator.getMode(),
    seed: orchestrator.getSeed(),
    exportedAt: new Date().toISOString(),
    profile: orchestrator.getProfileUsedForRun(),
    metrics: computeGantryRunMetrics(orchestrator),
    requirementResults: orchestrator.getSnapshot().requirementResults ?? [],
  };
}

export function gantryJsonFilename(orchestrator: GantryOrchestrator): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${orchestrator.scenario.id}_${timestamp}.summary.json`;
}
