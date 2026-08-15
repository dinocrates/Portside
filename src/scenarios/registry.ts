// Scenario registry (spec §10.2: "Initial scenarios" — Controls Tutorial
// and Fragile Freight Transfer). Scenario switching is a full page
// navigation via a `?scenario=` query param rather than an in-page SPA
// swap: simpler, and it sidesteps a whole class of teardown bugs (the
// Phaser game instance, the replay autoplay's requestAnimationFrame loop,
// etc. would all need explicit disposal on an in-page switch). A page
// load is a completely acceptable cost for "start a different lab
// activity" in a classroom tool.

import tutorialJson from './tutorial.json';
import fragileFreightJson from './fragile-freight.json';

export interface ScenarioRegistryEntry {
  id: string;
  title: string;
  json: unknown;
}

export const SCENARIO_REGISTRY: ScenarioRegistryEntry[] = [
  { id: 'controls-tutorial', title: 'Controls Tutorial', json: tutorialJson },
  { id: 'fragile-freight-transfer', title: 'Fragile Freight Transfer', json: fragileFreightJson },
];

export const DEFAULT_SCENARIO_ID = 'fragile-freight-transfer';

/** Falls back to the default for anything unrecognized — never trusts the query string blindly. */
export function resolveScenarioId(requestedId: string | null): string {
  if (requestedId && SCENARIO_REGISTRY.some((s) => s.id === requestedId)) return requestedId;
  return DEFAULT_SCENARIO_ID;
}

export function getScenarioJson(id: string): unknown {
  const entry = SCENARIO_REGISTRY.find((s) => s.id === id);
  return entry ? entry.json : SCENARIO_REGISTRY.find((s) => s.id === DEFAULT_SCENARIO_ID)!.json;
}
