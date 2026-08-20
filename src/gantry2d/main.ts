import '../styles/app.css';
import './gantry.css';
import { bootstrap } from './bootstrap';
import { GantryOrchestrator } from './orchestrator';
import { validateGantryScenario } from './scenario';
import overheadDemoJson from './scenarios/overhead-demo.json';
import { mountGantryUi } from './ui';
import { mountGantryProfileEditor } from './ui/profile-editor';
import { mountGantryAnalysisView } from './ui/analysis-view';
import { loadGantryDraft, loadGantryLastRun, saveGantryDraft, saveGantryLastRun } from './persistence';
import type { GantrySnapshot } from './model/snapshot';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in gantry.html`);
  return el;
}

const scenario = validateGantryScenario(overheadDemoJson);
const orchestrator = new GantryOrchestrator(scenario, `session-${Date.now()}`);

document.title = `${scenario.title} — Portside Motion Lab`;

// Restore local draft / most recent completed run before mounting UI, so
// the first render already reflects them (same spec §12.2 pattern as the
// 1D lab).
const draft = loadGantryDraft(scenario.id);
if (draft) orchestrator.restoreDraft(draft);
const lastRun = loadGantryLastRun(scenario.id);
if (lastRun) orchestrator.restoreCompletedRun(lastRun);

const sceneContainer = byId('gantry-scene-container');
bootstrap(sceneContainer, orchestrator);

mountGantryUi(sceneContainer, orchestrator);
mountGantryProfileEditor(byId('gantry-profile-editor'), orchestrator);
mountGantryAnalysisView(byId('gantry-analysis-view'), orchestrator);

// Autosave: the draft profile on every edit, and the most recent
// completed run once it actually reaches a terminal state.
let lastSavedRunSamples: readonly GantrySnapshot[] | null = null;
orchestrator.onChange(() => {
  saveGantryDraft(scenario.id, { mode: orchestrator.getMode(), profile: orchestrator.getProfile() });

  const snapshot = orchestrator.getSnapshot();
  const terminal = snapshot.runState === 'complete' || snapshot.runState === 'failed';
  const samples = orchestrator.getRecordedSamples();
  if (terminal && samples !== lastSavedRunSamples) {
    saveGantryLastRun(scenario.id, {
      mode: orchestrator.getMode(),
      profileUsedForRun: orchestrator.getProfileUsedForRun(),
      seed: orchestrator.getSeed(),
      finalSnapshot: snapshot,
      samples: [...samples],
    });
    lastSavedRunSamples = samples;
  }
});
