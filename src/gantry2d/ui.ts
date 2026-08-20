// Minimal DOM UI for the overhead gantry lab — run controls, manual
// directional controls (keyboard + on-screen button equivalents, spec
// §12.1's accessibility rule applied here too even though this lab isn't
// part of the numbered spec yet), a live telemetry strip, and a results
// panel. Deliberately condensed into one module for this first pass —
// the 1D lab's src/ui/* split into one-file-per-concern once there was
// enough surface area to justify it; this can split the same way later.

import type { GantryOrchestrator } from './orchestrator';
import type { AxisDirection } from './manual-controller';

const X_KEYS: Record<string, AxisDirection> = {
  ArrowLeft: 'negative',
  a: 'negative',
  A: 'negative',
  ArrowRight: 'positive',
  d: 'positive',
  D: 'positive',
};
const Y_KEYS: Record<string, AxisDirection> = {
  ArrowUp: 'positive',
  w: 'positive',
  W: 'positive',
  ArrowDown: 'negative',
  s: 'negative',
  S: 'negative',
};

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in gantry.html`);
  return el;
}

export function mountGantryUi(sceneContainer: HTMLElement, orchestrator: GantryOrchestrator): void {
  byId('gantry-title').textContent = orchestrator.scenario.title;
  byId('gantry-brief').textContent = orchestrator.scenario.brief;

  const startBtn = document.querySelector<HTMLButtonElement>('[data-action="start"]')!;
  const pauseResumeBtn = document.querySelector<HTMLButtonElement>('[data-action="pause-resume"]')!;
  const resetBtn = document.querySelector<HTMLButtonElement>('[data-action="reset"]')!;
  const liveStrip = byId('gantry-live-strip');
  const resultsPanel = byId('gantry-results');
  const manualControls = byId('gantry-manual-controls');

  manualControls.innerHTML = `
    <p class="hint">Click the scene, then use the arrow keys or WASD — hold two at once to move diagonally.</p>
    <div class="dpad" role="group" aria-label="Claw directional controls">
      <button type="button" data-dir="up">▲ Up (W)</button>
      <div class="dpad-row">
        <button type="button" data-dir="left">◀ Left (A)</button>
        <button type="button" data-dir="right">Right (D) ▶</button>
      </div>
      <button type="button" data-dir="down">▼ Down (S)</button>
    </div>
  `;

  startBtn.addEventListener('click', () => orchestrator.start());
  pauseResumeBtn.addEventListener('click', () => {
    if (orchestrator.isPaused()) orchestrator.resume();
    else orchestrator.pause();
  });
  resetBtn.addEventListener('click', () => {
    const midRun = orchestrator.hasStarted() && orchestrator.getSnapshot().runState === 'running';
    if (midRun && !window.confirm('Reset the current run? Unsaved progress will be lost.')) return;
    orchestrator.reset();
  });

  // --- Manual directional controls: keyboard + on-screen buttons ---
  const dpadButtons = Array.from(manualControls.querySelectorAll<HTMLButtonElement>('[data-dir]'));
  function setDirFor(dir: string, active: boolean): void {
    if (dir === 'left' || dir === 'right') {
      orchestrator.setXDirection(active ? (dir === 'left' ? 'negative' : 'positive') : 'none');
    } else {
      orchestrator.setYDirection(active ? (dir === 'up' ? 'positive' : 'negative') : 'none');
    }
  }
  for (const button of dpadButtons) {
    const dir = button.dataset.dir!;
    button.addEventListener('mousedown', () => setDirFor(dir, true));
    button.addEventListener('mouseup', () => setDirFor(dir, false));
    button.addEventListener('mouseleave', () => setDirFor(dir, false));
    button.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        setDirFor(dir, true);
      },
      { passive: false },
    );
    button.addEventListener('touchend', () => setDirFor(dir, false));
  }

  sceneContainer.tabIndex = 0;
  sceneContainer.setAttribute('aria-label', 'Overhead gantry scene. Click here, then use arrow keys or WASD to move the claw.');

  function release(): void {
    orchestrator.setXDirection('none');
    orchestrator.setYDirection('none');
  }

  sceneContainer.addEventListener('keydown', (e) => {
    if (X_KEYS[e.key]) {
      e.preventDefault();
      orchestrator.setXDirection(X_KEYS[e.key]!);
      return;
    }
    if (Y_KEYS[e.key]) {
      e.preventDefault();
      orchestrator.setYDirection(Y_KEYS[e.key]!);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      orchestrator.pause();
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      const midRun = orchestrator.hasStarted() && orchestrator.getSnapshot().runState === 'running';
      if (midRun && !window.confirm('Reset the current run? Unsaved progress will be lost.')) return;
      orchestrator.reset();
    }
  });
  sceneContainer.addEventListener('keyup', (e) => {
    if (X_KEYS[e.key]) orchestrator.setXDirection('none');
    if (Y_KEYS[e.key]) orchestrator.setYDirection('none');
  });

  // Element-level blur only clears held direction (doesn't also pause) —
  // see the 1D lab's src/ui/manual-controls.ts for why: pausing here too
  // would race the Pause button's own click handler. Window-level blur
  // and tab-hidden genuinely pause, since those mean "not looking at this at all."
  sceneContainer.addEventListener('blur', release);
  window.addEventListener('blur', () => {
    release();
    orchestrator.pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      release();
      orchestrator.pause();
    }
  });

  // Pressing Start moves focus to that button — refocus the scene so
  // keyboard control works immediately (same fix as the 1D lab needed).
  let wasStarted = false;

  function render(): void {
    const display = orchestrator.getDisplayRunState();
    const s = orchestrator.getSnapshot();

    startBtn.disabled = !orchestrator.canStart();
    pauseResumeBtn.disabled = !(display === 'running' || display === 'paused');
    pauseResumeBtn.textContent = display === 'paused' ? 'Resume' : 'Pause';

    liveStrip.textContent =
      `t = ${s.time_s.toFixed(2)} s   ` +
      `x = ${s.x_m.toFixed(2)} m   y = ${s.y_m.toFixed(2)} m   ` +
      `vx = ${s.vx_mps.toFixed(2)} m/s   vy = ${s.vy_mps.toFixed(2)} m/s   ` +
      `state = ${display}`;

    if (s.runState !== 'complete' && s.runState !== 'failed') {
      resultsPanel.hidden = true;
      resultsPanel.innerHTML = '';
    } else {
      resultsPanel.hidden = false;
      const verdict = s.runState === 'complete' ? 'Delivered — run complete' : 'Run failed';
      const verdictClass = s.runState === 'complete' ? 'verdict-pass' : 'verdict-fail';
      const rows = (s.requirementResults ?? [])
        .map(
          (r) => `
            <li class="${r.satisfied ? 'requirement-pass' : 'requirement-fail'}">
              <span class="requirement-icon" aria-hidden="true">${r.satisfied ? '✓' : '✗'}</span>
              <span class="requirement-text"><strong>${escapeHtml(r.description)}</strong>${r.detail ? `<br><span class="requirement-detail">${escapeHtml(r.detail)}</span>` : ''}</span>
            </li>`,
        )
        .join('');
      resultsPanel.innerHTML = `<h2 class="${verdictClass}">${verdict}</h2><ul class="requirement-list">${rows}</ul>`;
    }

    const isStarted = orchestrator.hasStarted();
    if (isStarted && !wasStarted) sceneContainer.focus();
    wasStarted = isStarted;
  }

  orchestrator.onChange(render);
  render();
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
