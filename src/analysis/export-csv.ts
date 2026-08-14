// CSV export: metadata header followed by the recorded sample table (spec
// §9.4). Column names match the recorded-sample field list in spec §9.1
// exactly, so CSV values, graph values, and run-summary metrics are all
// reading the same underlying SimulationSnapshot fields (spec §13.4:
// "CSV values, graph values, and run-summary metrics agree for the same
// timestamp").

import type { RunOrchestrator } from '../app/app-state';
import type { SimulationSnapshot } from '../sim/model/snapshot';

// Column names match spec §9.1's recorded-sample field list verbatim. Most
// are already the exact property name on SimulationSnapshot (both use
// snake_case for the physical fields); `run_state` and `active_phase_id`
// are the two exceptions — SimulationSnapshot spells those `runState` /
// `activePhaseId` (consistent with the rest of the camelCase state/engine
// code) — so `cell()` special-cases just those two.
const COLUMNS: string[] = [
  'time_s',
  'trolley_x_m',
  'trolley_v_mps',
  'trolley_a_mps2',
  'commanded_trolley_a_mps2',
  'cable_length_m',
  'hoist_v_mps',
  'load_angle_rad',
  'load_angular_velocity_radps',
  'cargo_offset_m',
  'cargo_relative_velocity_mps',
  'cumulative_damage',
  'run_state',
  'active_phase_id',
];

function cell(sample: SimulationSnapshot, column: string): string {
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

export function buildCsv(orchestrator: RunOrchestrator): string {
  const samples = orchestrator.getRecordedSamples();
  const scenario = orchestrator.scenario;

  const metadata = [
    `# Portside Motion Lab run export`,
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

export function csvFilename(orchestrator: RunOrchestrator): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${orchestrator.scenario.id}_${timestamp}.csv`;
}

/** Trigger a browser download of the given text content. No student names are ever included unless a student types one into a note field. */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
