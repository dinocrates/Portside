// Compact live strip (spec §5.2): time, position, velocity, acceleration,
// and status, as accessible DOM text — not baked into the canvas, so it
// reads correctly with a screen reader and stays sharp at any zoom level
// (spec §12.1: "usable at 200% browser zoom").

import type { RunOrchestrator } from '../app/app-state';

export function mountLiveStrip(container: HTMLElement, orchestrator: RunOrchestrator): void {
  function render(): void {
    // getDisplaySnapshot() so the strip's numbers track the replay cursor
    // while scrubbing, not just the (frozen) final live state.
    const s = orchestrator.getDisplaySnapshot();
    const replaying = orchestrator.isReplayingNow() ? '  (replay)' : '';
    container.textContent =
      `t = ${s.time_s.toFixed(2)} s   ` +
      `x = ${s.trolley_x_m.toFixed(2)} m   ` +
      `v = ${s.trolley_v_mps.toFixed(2)} m/s   ` +
      `a = ${s.trolley_a_mps2.toFixed(2)} m/s²   ` +
      `state = ${orchestrator.getDisplayRunState()}${replaying}`;
  }

  orchestrator.onChange(render);
  render();
}

/** A restrained live region for transient feedback messages (spec §6.2, §12.1). */
export function mountFeedbackMessage(container: HTMLElement, orchestrator: RunOrchestrator): void {
  let lastShown = '';
  function render(): void {
    const message = orchestrator.getLastFeedback();
    if (message && message !== lastShown) {
      container.textContent = message;
      lastShown = message;
      window.setTimeout(() => {
        if (container.textContent === message) container.textContent = '';
      }, 2500);
    }
  }

  orchestrator.onChange(render);
}
