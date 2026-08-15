import '../src/styles/app.css';
import { bootstrap } from './app/bootstrap';
import { RunOrchestrator } from './app/app-state';
import { validateScenario } from './scenarios/loader';
import { getScenarioJson, resolveScenarioId } from './scenarios/registry';
import { mountRunControls } from './ui/run-controls';
import { mountManualControls } from './ui/manual-controls';
import { mountProfileEditor } from './ui/profile-editor';
import { mountResultsPanel } from './ui/results-panel';
import { mountFeedbackMessage, mountLiveStrip } from './ui/live-strip';
import { mountAnalysisView } from './ui/analysis-view';
import { mountScenarioSwitcher } from './ui/scenario-switcher';
import { loadDraft, loadLastRun, saveDraft, saveLastRun } from './app/persistence';
import type { SimulationSnapshot } from './sim/model/snapshot';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
}

const scenarioId = resolveScenarioId(new URLSearchParams(window.location.search).get('scenario'));
const scenario = validateScenario(getScenarioJson(scenarioId));
const orchestrator = new RunOrchestrator(scenario, `session-${Date.now()}`);

byId('scenario-title').textContent = scenario.title;
byId('scenario-brief').textContent = scenario.brief;
document.title = `${scenario.title} — Portside Motion Lab`;
mountScenarioSwitcher(byId('scenario-switcher'), scenarioId);

// Restore local draft / most recent completed run before mounting UI, so
// the first render already reflects them (spec §12.2).
const draft = loadDraft(scenario.id);
if (draft) orchestrator.restoreDraft(draft);
const lastRun = loadLastRun(scenario.id);
if (lastRun) orchestrator.restoreCompletedRun(lastRun);

const sceneContainer = byId('scene-container');
bootstrap(sceneContainer, orchestrator);

mountRunControls(byId('run-controls'), orchestrator);
mountManualControls(byId('manual-controls-panel'), sceneContainer, orchestrator);
mountProfileEditor(byId('profile-editor-panel'), orchestrator);
mountResultsPanel(byId('results-panel'), orchestrator);
mountLiveStrip(byId('live-strip'), orchestrator);
mountFeedbackMessage(byId('feedback-message'), orchestrator);
mountAnalysisView(byId('analysis-view'), orchestrator);

// Progressive disclosure (spec design principle 4): show only the panel
// for the active mode.
function syncModePanels(): void {
  const manualPanel = byId('manual-controls-panel');
  const profilePanel = byId('profile-editor-panel');
  const isManual = orchestrator.getMode() === 'manual';
  manualPanel.hidden = !isManual;
  profilePanel.hidden = isManual;
}
orchestrator.onChange(syncModePanels);
syncModePanels();

// Pressing the on-screen Start button moves focus to that button, which
// would otherwise strand the keydown listener bound to #scene-container
// (spec §6.2: arrow keys only act "while the simulation control region
// has focus" — attached to the element on purpose, not `window`). Move
// focus to the scene automatically so a manual run is immediately
// controllable without an extra click.
let wasStarted = false;
orchestrator.onChange(() => {
  const isStarted = orchestrator.hasStarted();
  if (isStarted && !wasStarted && orchestrator.getMode() === 'manual') {
    sceneContainer.focus();
  }
  wasStarted = isStarted;
});

// Autosave (spec §12.2): the draft profile on every edit, and the most
// recent completed run once it actually reaches a terminal state.
let lastSavedRunSamples: readonly SimulationSnapshot[] | null = null;
orchestrator.onChange(() => {
  saveDraft(scenario.id, { mode: orchestrator.getMode(), profile: orchestrator.getProfile() });

  const snapshot = orchestrator.getSnapshot();
  const terminal = snapshot.runState === 'complete' || snapshot.runState === 'failed';
  const samples = orchestrator.getRecordedSamples();
  if (terminal && samples !== lastSavedRunSamples) {
    saveLastRun(scenario.id, {
      mode: orchestrator.getMode(),
      profileUsedForRun: orchestrator.getProfileUsedForRun(),
      seed: orchestrator.getSeed(),
      finalSnapshot: snapshot,
      samples: [...samples],
    });
    lastSavedRunSamples = samples;
  }
});
