// Manual mode: on-screen buttons plus keyboard wiring (spec §6.2).
// Keyboard listeners are attached to the scene container element itself
// (not `window`), so Left/Right/Up/Down/Space only intercept — and only
// prevent page scroll — while that region actually has focus, per spec:
// "Arrow keys must prevent page scrolling only while the simulation
// control region has focus."

import type { RunOrchestrator } from '../app/app-state';
import { confirmReset } from './run-controls';

type Direction = 'left' | 'right';

const DIRECTION_KEYS: Record<string, Direction> = {
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
};

const VERTICAL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'w', 'W', 's', 'S']);

export function mountManualControls(
  panel: HTMLElement,
  sceneContainer: HTMLElement,
  orchestrator: RunOrchestrator,
): void {
  panel.innerHTML = `
    <p class="hint">Click the scene, then use ◀ / A and ▶ / D. Escape pauses, R resets.</p>
    <div class="manual-buttons" role="group" aria-label="Manual trolley controls">
      <button type="button" data-dir="left">◀ Left (A)</button>
      <button type="button" data-dir="right">Right (D) ▶</button>
    </div>
  `;

  const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-dir]'));

  function press(direction: Direction): void {
    orchestrator.setManualDirection(direction);
  }
  function release(): void {
    orchestrator.setManualDirection('none');
  }

  for (const button of buttons) {
    const direction = button.dataset.dir as Direction;
    button.addEventListener('mousedown', () => press(direction));
    button.addEventListener('mouseup', release);
    button.addEventListener('mouseleave', release);
    button.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        press(direction);
      },
      { passive: false },
    );
    button.addEventListener('touchend', release);
  }

  sceneContainer.tabIndex = 0;
  sceneContainer.setAttribute(
    'aria-label',
    'Crane scene. Click here, then use the arrow keys or A/D to move the trolley in manual mode.',
  );

  sceneContainer.addEventListener('keydown', (e) => {
    const direction = DIRECTION_KEYS[e.key];
    if (direction) {
      if (orchestrator.getMode() === 'manual') {
        e.preventDefault();
        press(direction);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      orchestrator.pause();
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      confirmReset(orchestrator);
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      orchestrator.requestUnavailableCommand('Attach/release');
      return;
    }
    if (VERTICAL_KEYS.has(e.key)) {
      e.preventDefault();
      orchestrator.requestUnavailableCommand('Vertical hoist motion');
    }
  });

  sceneContainer.addEventListener('keyup', (e) => {
    if (DIRECTION_KEYS[e.key]) release();
  });

  // Loss of focus clears held-key state and pauses the run — "a stuck key
  // cannot continue a run" (spec §6.2, §12.2). Two distinct cases, both
  // handled: the whole window/tab losing focus (alt-tab, switching apps),
  // and — just as real — the scene *element* losing focus on this same
  // page, e.g. a student holding an arrow key while clicking Pause/Reset
  // with the other hand. Without the element-level listener, that keyup
  // would fire on whatever element focus moved to (not a descendant of
  // sceneContainer), never reach this module's keyup handler, and leave
  // the manual controller's direction stuck at the last-pressed key.
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
  // Element-level blur clears the held direction only — it deliberately
  // does NOT also call orchestrator.pause() the way the window-level
  // handlers below do. Reason: focus moving to another on-page control
  // (e.g. clicking the Pause/Resume toggle itself) fires this blur BEFORE
  // that control's own click handler runs. If this handler paused too,
  // clicking "Pause" for the first time would race its own toggle logic —
  // blur pauses, then the click reads "already paused" and calls
  // resume() instead, silently undoing the click. Clearing the stuck
  // direction is enough to make the physics stop accelerating; the
  // explicit pause/resume/step/reset controls remain responsible for
  // their own, unambiguous state transitions.
  sceneContainer.addEventListener('blur', () => {
    release();
  });

  function render(): void {
    const disableButtons = orchestrator.getMode() !== 'manual';
    for (const button of buttons) button.disabled = disableButtons;
  }

  orchestrator.onChange(render);
  render();
}
