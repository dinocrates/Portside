// JSON run-summary export (spec §9.4): scenario ID, scenario version,
// profile, seed, metrics, and requirement results. Factual metrics only —
// spec §9.3: "Report factual metrics, not a mysterious composite score."

import type { RunOrchestrator } from '../app/app-state';
import type { RequirementResult } from '../sim/model/snapshot';

export interface RunMetrics {
  success: boolean;
  totalTime_s: number;
  finalPosition_m: number;
  finalPositionError_m: number;
  finalSpeed_mps: number;
  maxAbsSpeed_mps: number;
  maxAbsAcceleration_mps2: number;
}

/** Computed directly from the recorded samples — the same values the graphs and CSV export show, per spec §13.4's "agree for the same timestamp" requirement. */
export function computeRunMetrics(orchestrator: RunOrchestrator): RunMetrics | null {
  const samples = orchestrator.getRecordedSamples();
  if (samples.length === 0) return null;
  const final = samples[samples.length - 1]!;

  let maxAbsSpeed = 0;
  let maxAbsAcceleration = 0;
  for (const s of samples) {
    maxAbsSpeed = Math.max(maxAbsSpeed, Math.abs(s.trolley_v_mps));
    maxAbsAcceleration = Math.max(maxAbsAcceleration, Math.abs(s.trolley_a_mps2));
  }

  return {
    success: final.runState === 'complete',
    totalTime_s: final.time_s,
    finalPosition_m: final.trolley_x_m,
    finalPositionError_m: final.trolley_x_m - orchestrator.scenario.geometry.targetX_m,
    finalSpeed_mps: final.trolley_v_mps,
    maxAbsSpeed_mps: maxAbsSpeed,
    maxAbsAcceleration_mps2: maxAbsAcceleration,
  };
}

export interface RunSummaryExport {
  scenarioId: string;
  scenarioVersion: number;
  mode: string;
  seed: string;
  exportedAt: string;
  profile: unknown;
  metrics: RunMetrics | null;
  requirementResults: RequirementResult[];
}

export function buildRunSummary(orchestrator: RunOrchestrator): RunSummaryExport {
  return {
    scenarioId: orchestrator.scenario.id,
    scenarioVersion: orchestrator.scenario.version,
    mode: orchestrator.getMode(),
    seed: orchestrator.getSeed(),
    exportedAt: new Date().toISOString(),
    profile: orchestrator.getProfileUsedForRun(),
    metrics: computeRunMetrics(orchestrator),
    requirementResults: orchestrator.getSnapshot().requirementResults ?? [],
  };
}

export function jsonFilename(orchestrator: RunOrchestrator): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${orchestrator.scenario.id}_${timestamp}.summary.json`;
}
