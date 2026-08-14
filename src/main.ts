import '../src/styles/app.css';
import { bootstrap } from './app/bootstrap';
import { RunOrchestrator } from './app/app-state';
import { validateScenario } from './scenarios/loader';
import fragileFreightJson from './scenarios/fragile-freight.json';
import { mountRunControls } from './ui/run-controls';
import { mountManualControls } from './ui/manual-controls';
import { mountProfileEditor } from './ui/profile-editor';
import { mountResultsPanel } from './ui/results-panel';
import { mountFeedbackMessage, mountLiveStrip } from './ui/live-strip';
import { mountAnalysisView } from './ui/analysis-view';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
}

const scenario = validateScenario(fragileFreightJson);
const orchestrator = new RunOrchestrator(scenario, `session-${Date.now()}`);

byId('scenario-title').textContent = scenario.title;
document.title = `${scenario.title} — Portside Motion Lab`;

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
