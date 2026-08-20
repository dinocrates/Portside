// CSV export for the 2D gantry lab — same metadata-header-then-sample-table
// shape as the 1D lab's src/analysis/export-csv.ts, with the gantry's
// two-axis column set instead of one.

import type { GantryOrchestrator } from '../orchestrator';
import type { GantrySnapshot } from '../model/snapshot';

const COLUMNS: string[] = [
  'time_s',
  'x_m',
  'vx_mps',
  'ax_mps2',
  'commanded_ax_mps2',
  'y_m',
  'vy_mps',
  'ay_mps2',
  'commanded_ay_mps2',
  'run_state',
  'active_phase_id',
];

function cell(sample: GantrySnapshot, column: string): string {
  switch (column) {
    case 'run_state':
      return sample.runState;
    case 'active_phase_id':
      return sample.activePhaseId ?? '';
    default: {
      const value = (sample as unknown as Record<string, unknown>)[column];
      return value === undefined || value === null ? '' : String(value);
    }
  }
}

export function buildGantryCsv(orchestrator: GantryOrchestrator): string {
  const samples = orchestrator.getRecordedSamples();
  const scenario = orchestrator.scenario;

  const metadata = [
    `# Portside Motion Lab — Overhead Gantry run export`,
    `# scenario_id,${scenario.id}`,
    `# scenario_version,${scenario.version}`,
    `# mode,${orchestrator.getMode()}`,
    `# seed,${orchestrator.getSeed()}`,
    `# run_state,${orchestrator.getSnapshot().runState}`,
    `# exported_at,${new Date().toISOString()}`,
    `#`,
  ];

  const header = COLUMNS.join(',');
  const rows = samples.map((sample) => COLUMNS.map((col) => cell(sample, col)).join(','));

  return [...metadata, header, ...rows].join('\n');
}

export function gantryCsvFilename(orchestrator: GantryOrchestrator): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${orchestrator.scenario.id}_${timestamp}.csv`;
}
