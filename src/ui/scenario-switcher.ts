// Scenario switcher: plain links (real navigation, works without JS,
// naturally keyboard/screen-reader accessible) — see the registry module
// for why switching is a page load rather than an in-page swap.

import { SCENARIO_REGISTRY } from '../scenarios/registry';
import { escapeHtml } from './dom-utils';

export function mountScenarioSwitcher(container: HTMLElement, currentScenarioId: string): void {
  container.innerHTML = SCENARIO_REGISTRY.map((entry) => {
    const isCurrent = entry.id === currentScenarioId;
    return `<a
      href="?scenario=${encodeURIComponent(entry.id)}"
      class="scenario-link${isCurrent ? ' scenario-link-active' : ''}"
      ${isCurrent ? 'aria-current="page"' : ''}
    >${escapeHtml(entry.title)}</a>`;
  }).join('');
}
