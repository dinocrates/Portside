// Analysis view for the 2D gantry lab — same replay transport + export
// chrome as the 1D lab's src/ui/analysis-view.ts, wrapping the gantry's
// own charts/export modules. ReplayPlayer itself is shared unchanged
// (src/analysis/replay.ts) since GantryOrchestrator implements the same
// six-method replay surface as RunOrchestrator.

import type { GantryOrchestrator } from '../orchestrator';
import { mountGantryAlignedCharts } from '../analysis/charts';
import { ReplayPlayer } from '../../analysis/replay';
import { downloadTextFile } from '../../analysis/export-csv';
import { buildGantryCsv, gantryCsvFilename } from '../analysis/export-csv';
import { buildGantryRunSummary, gantryJsonFilename } from '../analysis/export-json';

export function mountGantryAnalysisView(container: HTMLElement, orchestrator: GantryOrchestrator): void {
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
  mountGantryAlignedCharts(chartsContainer, orchestrator);

  replayToggleBtn.addEventListener('click', () => {
    if (player.isPlaying()) player.pause();
    else player.play();
  });

  scrubber.addEventListener('input', () => {
    // Read the target value BEFORE calling startReplay() — see the 1D
    // lab's analysis-view.ts for why: that call fires a synchronous
    // onChange that re-enters render() and would otherwise clobber the
    // value this listener is about to read.
    const target_s = Number(scrubber.value);
    player.pause();
    if (!orchestrator.isReplayingNow()) orchestrator.startReplay();
    orchestrator.scrubTo(target_s);
  });

  exportCsvBtn.addEventListener('click', () => {
    downloadTextFile(gantryCsvFilename(orchestrator), buildGantryCsv(orchestrator), 'text/csv');
  });
  exportJsonBtn.addEventListener('click', () => {
    downloadTextFile(gantryJsonFilename(orchestrator), JSON.stringify(buildGantryRunSummary(orchestrator), null, 2), 'application/json');
  });

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
