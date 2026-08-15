// Shared run controls and mode selector (spec §6.1). Manual and automated
// modes share these controls unchanged — Start, Pause/Resume, Step, Reset
// all just call the corresponding RunOrchestrator method, which is the
// same regardless of which controller is active (spec design principle 2).

import type { RunOrchestrator, UiMode } from '../app/app-state';

const RESET_CONFIRM_MESSAGE = 'Reset the current run? Unsaved progress will be lost.';

export function confirmReset(orchestrator: RunOrchestrator): void {
  const midRun = orchestrator.hasStarted() && orchestrator.getSnapshot().runState === 'running';
  if (midRun && !window.confirm(RESET_CONFIRM_MESSAGE)) return;
  orchestrator.reset();
}

const MODE_LABEL: Record<UiMode, string> = { manual: 'Manual', automated: 'Automated' };

export function mountRunControls(container: HTMLElement, orchestrator: RunOrchestrator): void {
  // Progressive disclosure (spec design principle 4): only offer modes the
  // scenario actually enables. The tutorial scenario, for instance, has no
  // automated mode — showing that choice would just be a dead end.
  const availableModes: UiMode[] = (['manual', 'automated'] as const).filter(
    (m) => orchestrator.scenario.features[m === 'manual' ? 'manualMode' : 'automatedMode'],
  );

  const modeSelectorHtml =
    availableModes.length > 1
      ? `<fieldset class="mode-selector">
          <legend>Mode</legend>
          ${availableModes.map((m) => `<label><input type="radio" name="mode" value="${m}"> ${MODE_LABEL[m]}</label>`).join('')}
        </fieldset>`
      : '';

  container.innerHTML = `
    ${modeSelectorHtml}
    <div class="run-buttons" role="group" aria-label="Run controls">
      <button type="button" data-action="start">Start</button>
      <button type="button" data-action="pause-resume">Pause</button>
      <button type="button" data-action="step">Step</button>
      <button type="button" data-action="reset">Reset</button>
    </div>
  `;

  if (availableModes.length === 1) orchestrator.setMode(availableModes[0]!);

  const modeInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[name="mode"]'));
  const startBtn = container.querySelector<HTMLButtonElement>('[data-action="start"]')!;
  const pauseResumeBtn = container.querySelector<HTMLButtonElement>('[data-action="pause-resume"]')!;
  const stepBtn = container.querySelector<HTMLButtonElement>('[data-action="step"]')!;
  const resetBtn = container.querySelector<HTMLButtonElement>('[data-action="reset"]')!;

  modeInputs.forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) orchestrator.setMode(input.value as UiMode);
    });
  });

  startBtn.addEventListener('click', () => orchestrator.start());
  pauseResumeBtn.addEventListener('click', () => {
    if (orchestrator.isPaused()) orchestrator.resume();
    else orchestrator.pause();
  });
  stepBtn.addEventListener('click', () => orchestrator.step());
  resetBtn.addEventListener('click', () => confirmReset(orchestrator));

  function render(): void {
    const mode = orchestrator.getMode();
    const display = orchestrator.getDisplayRunState();
    const midRun = orchestrator.hasStarted() && display === 'running';

    modeInputs.forEach((input) => {
      input.checked = input.value === mode;
      input.disabled = midRun;
    });

    startBtn.disabled = !orchestrator.canStart();
    pauseResumeBtn.disabled = !(display === 'running' || display === 'paused');
    pauseResumeBtn.textContent = display === 'paused' ? 'Resume' : 'Pause';
    stepBtn.disabled = display !== 'paused';
  }

  orchestrator.onChange(render);
  render();
}
