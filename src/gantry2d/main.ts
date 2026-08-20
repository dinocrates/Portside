import '../styles/app.css';
import './gantry.css';
import { bootstrap } from './bootstrap';
import { GantryOrchestrator } from './orchestrator';
import { validateGantryScenario } from './scenario';
import overheadDemoJson from './scenarios/overhead-demo.json';
import { mountGantryUi } from './ui';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in gantry.html`);
  return el;
}

const scenario = validateGantryScenario(overheadDemoJson);
const orchestrator = new GantryOrchestrator(scenario);

document.title = `${scenario.title} — Portside Motion Lab`;

const sceneContainer = byId('gantry-scene-container');
bootstrap(sceneContainer, orchestrator);

mountGantryUi(sceneContainer, orchestrator);
