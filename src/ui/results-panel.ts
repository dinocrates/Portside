// Results panel (spec §7.1, §7.2, §9.3): factual pass/fail plus every
// requirement's individual status — never a single collapsed score
// ("Do not collapse these into a single score. Students need an
// engineering diagnosis.").

import type { RunOrchestrator } from '../app/app-state';
import { escapeHtml } from './dom-utils';

export function mountResultsPanel(container: HTMLElement, orchestrator: RunOrchestrator): void {
  function render(): void {
    const snapshot = orchestrator.getSnapshot();
    if (snapshot.runState !== 'complete' && snapshot.runState !== 'failed') {
      container.hidden = true;
      container.innerHTML = '';
      return;
    }

    container.hidden = false;
    const results = snapshot.requirementResults ?? [];
    const verdict = snapshot.runState === 'complete' ? 'Delivered — run complete' : 'Run failed';
    const verdictClass = snapshot.runState === 'complete' ? 'verdict-pass' : 'verdict-fail';

    const rows = results
      .map(
        (r) => `
          <li class="${r.satisfied ? 'requirement-pass' : 'requirement-fail'}">
            <span class="requirement-icon" aria-hidden="true">${r.satisfied ? '✓' : '✗'}</span>
            <span class="requirement-text">
              <strong>${escapeHtml(r.description)}</strong>
              ${r.detail ? `<br><span class="requirement-detail">${escapeHtml(r.detail)}</span>` : ''}
            </span>
          </li>
        `,
      )
      .join('');

    container.innerHTML = `
      <h2 class="${verdictClass}">${verdict}</h2>
      <dl class="results-summary">
        <div><dt>Total time</dt><dd>${snapshot.time_s.toFixed(2)} s</dd></div>
        <div><dt>Final position</dt><dd>${snapshot.trolley_x_m.toFixed(2)} m</dd></div>
        <div><dt>Final speed</dt><dd>${snapshot.trolley_v_mps.toFixed(2)} m/s</dd></div>
      </dl>
      <ul class="requirement-list">${rows}</ul>
    `;
  }

  orchestrator.onChange(render);
  render();
}
