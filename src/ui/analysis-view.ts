// Analysis view (spec §5.2): aligned graphs, replay controls, and export —
// shown once a run reaches a terminal state. Owns the Replay/scrubber
// shared run controls (spec §6.1) and the CSV/JSON export buttons (§9.4).
// The graphs themselves live in src/analysis/charts.ts; this module is
// the surrounding chrome and the replay transport.

import type { RunOrchestrator } from '../app/app-state';
import { mountAlignedCharts } from '../analysis/charts';
import { ReplayPlayer } from '../analysis/replay';
import { buildCsv, csvFilename, downloadTextFile } from '../analysis/export-csv';
import { buildRunSummary, jsonFilename } from '../analysis/export-json';

export function mountAnalysisView(container: HTMLElement, orchestrator: RunOrchestrator): void {
  container.innerHTML = `
    <div class="replay-controls">
      <button type="button" data-action="replay-toggle">Replay</button>
      <input type="range" class="replay-scrubber" min="0" max="0" step="any" value="0"
        aria-label="Replay scrubber — drag to move through the completed run" />
      <span class="replay-time"></span>
      <span class="export-buttons">
        <button type="button" data-action="export-csv">Export CSV</button>
        <button type="button" data-action="export-json">Export run summary (JSON)</button>
      </span>
    </div>
    <div class="charts-container"></div>
  `;

  const replayToggleBtn = container.querySelector<HTMLButtonElement>('[data-action="replay-toggle"]')!;
  const scrubber = container.querySelector<HTMLInputElement>('.replay-scrubber')!;
  const replayTimeEl = container.querySelector<HTMLElement>('.replay-time')!;
  const exportCsvBtn = container.querySelector<HTMLButtonElement>('[data-action="export-csv"]')!;
  const exportJsonBtn = container.querySelector<HTMLButtonElement>('[data-action="export-json"]')!;
  const chartsContainer = container.querySelector<HTMLElement>('.charts-container')!;

  const player = new ReplayPlayer(orchestrator);
  mountAlignedCharts(chartsContainer, orchestrator);

  replayToggleBtn.addEventListener('click', () => {
    if (player.isPlaying()) player.pause();
    else player.play();
  });

  scrubber.addEventListener('input', () => {
    // Read the target value BEFORE calling startReplay(): that call fires
    // a synchronous onChange, which re-enters this module's own render()
    // and (when the scrubber isn't the focused element) overwrites
    // scrubber.value from orchestrator state — clobbering the very value
    // this listener is about to read, if read after the call instead of
    // before it.
    const target_s = Number(scrubber.value);
    player.pause();
    if (!orchestrator.isReplayingNow()) orchestrator.startReplay();
    orchestrator.scrubTo(target_s);
  });

  exportCsvBtn.addEventListener('click', () => {
    downloadTextFile(csvFilename(orchestrator), buildCsv(orchestrator), 'text/csv');
  });
  exportJsonBtn.addEventListener('click', () => {
    downloadTextFile(jsonFilename(orchestrator), JSON.stringify(buildRunSummary(orchestrator), null, 2), 'application/json');
  });

  // Autoplay needs a per-frame clock; a dedicated rAF loop keeps it
  // independent of whether the Phaser scene happens to be running.
  let lastFrameTime = performance.now();
  function frame(now: number): void {
    const delta = now - lastFrameTime;
    lastFrameTime = now;
    player.tick(delta);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function render(): void {
    const canReplay = orchestrator.canReplay();
    container.hidden = !canReplay;
    if (!canReplay) return;

    const bounds = orchestrator.getReplayBounds()!;
    scrubber.min = String(bounds.min_s);
    scrubber.max = String(bounds.max_s);
    if (document.activeElement !== scrubber) {
      scrubber.value = String(orchestrator.isReplayingNow() ? orchestrator.getReplayTime_s() : bounds.max_s);
    }
    replayTimeEl.textContent = `${Number(scrubber.value).toFixed(2)} / ${bounds.max_s.toFixed(2)} s`;
    replayToggleBtn.textContent = player.isPlaying() ? 'Pause' : 'Replay';
  }

  orchestrator.onChange(render);
  render();
}
