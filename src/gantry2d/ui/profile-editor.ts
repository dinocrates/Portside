// Automated dual-axis motion-profile editor for the 2D gantry lab — same
// table-of-sequential-phases pattern as the 1D lab's
// src/ui/profile-editor.ts, with two acceleration columns (ax, ay)
// instead of one. Re-rendering fully rebuilds the table's HTML on every
// orchestrator change, saving/restoring focus and selection across the
// rebuild so it doesn't steal focus out from under a student mid-keystroke.

import type { GantryOrchestrator } from '../orchestrator';
import type { GantryMotionPhase } from '../controllers/profile-controller';
import { cssEscape, escapeHtml } from '../../ui/dom-utils';

let idCounter = 0;
function newPhaseId(): string {
  idCounter += 1;
  return `gantry-phase-${Date.now()}-${idCounter}`;
}

const FIELD_LABEL: Record<'duration_s' | 'ax_mps2' | 'ay_mps2', string> = {
  duration_s: 'Duration',
  ax_mps2: 'X acceleration',
  ay_mps2: 'Y acceleration',
};

export function mountGantryProfileEditor(container: HTMLElement, orchestrator: GantryOrchestrator): void {
  container.innerHTML = `
    <table class="profile-table">
      <thead>
        <tr>
          <th scope="col">Phase name</th>
          <th scope="col">Duration, s</th>
          <th scope="col">ax, m/s²</th>
          <th scope="col">ay, m/s²</th>
          <th scope="col">Note</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
    <p class="profile-total"></p>
    <button type="button" data-action="add-phase">+ Add phase</button>
  `;

  const tbody = container.querySelector('tbody')!;
  const totalEl = container.querySelector<HTMLElement>('.profile-total')!;
  const addBtn = container.querySelector<HTMLButtonElement>('[data-action="add-phase"]')!;

  addBtn.addEventListener('click', () => {
    orchestrator.addPhase({ id: newPhaseId(), name: 'New phase', duration_s: 1, ax_mps2: 0, ay_mps2: 0 });
  });

  tbody.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    const row = target.closest<HTMLElement>('tr[data-id]');
    const field = target.dataset.field as keyof GantryMotionPhase | undefined;
    if (!row || !field) return;
    const id = row.dataset.id!;

    if (field === 'name' || field === 'note') {
      orchestrator.updatePhase(id, { [field]: target.value } as Partial<GantryMotionPhase>);
    } else if (field === 'duration_s' || field === 'ax_mps2' || field === 'ay_mps2') {
      orchestrator.updatePhase(id, { [field]: target.value === '' ? NaN : Number(target.value) } as Partial<GantryMotionPhase>);
    }
  });

  tbody.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!button) return;
    const row = button.closest<HTMLElement>('tr[data-id]');
    if (!row) return;
    const id = row.dataset.id!;
    switch (button.dataset.action) {
      case 'up':
        orchestrator.reorderPhase(id, -1);
        break;
      case 'down':
        orchestrator.reorderPhase(id, 1);
        break;
      case 'duplicate':
        orchestrator.duplicatePhase(id);
        break;
      case 'remove':
        orchestrator.removePhase(id);
        break;
    }
  });

  function render(): void {
    const focusInfo = captureFocus();

    const profile = orchestrator.getProfile();
    const errors = orchestrator.validateCurrentProfile();
    const disabled = orchestrator.hasStarted() && orchestrator.getSnapshot().runState === 'running';

    const errorsByPhase = new Map<number, string[]>();
    for (const err of errors) {
      const list = errorsByPhase.get(err.phaseIndex) ?? [];
      list.push(`${FIELD_LABEL[err.field]}: ${err.message}`);
      errorsByPhase.set(err.phaseIndex, list);
    }

    tbody.innerHTML = profile
      .map((phase, index) => renderRow(phase, index, profile.length, errorsByPhase.get(index) ?? [], disabled))
      .join('');

    addBtn.disabled = disabled;
    totalEl.textContent = `Total programmed time: ${orchestrator.totalProfileTime_s().toFixed(2)} s`;

    restoreFocus(focusInfo);
  }

  function captureFocus(): { id: string; field: string; selStart: number | null; selEnd: number | null } | null {
    const active = document.activeElement as HTMLInputElement | null;
    if (!active || !container.contains(active) || !active.dataset.field) return null;
    const row = active.closest<HTMLElement>('tr[data-id]');
    if (!row?.dataset.id) return null;
    return {
      id: row.dataset.id,
      field: active.dataset.field,
      selStart: 'selectionStart' in active ? active.selectionStart : null,
      selEnd: 'selectionEnd' in active ? active.selectionEnd : null,
    };
  }

  function restoreFocus(info: ReturnType<typeof captureFocus>): void {
    if (!info) return;
    const selector = `tr[data-id="${cssEscape(info.id)}"] [data-field="${cssEscape(info.field)}"]`;
    const el = container.querySelector<HTMLInputElement>(selector);
    if (!el) return;
    el.focus();
    if (info.selStart !== null && info.selEnd !== null) {
      try {
        el.setSelectionRange(info.selStart, info.selEnd);
      } catch {
        // Some input types (e.g. number, in some browsers) don't support selection ranges — harmless to skip.
      }
    }
  }

  orchestrator.onChange(render);
  render();
}

function renderRow(
  phase: GantryMotionPhase,
  index: number,
  total: number,
  errors: string[],
  disabled: boolean,
): string {
  const d = disabled ? 'disabled' : '';
  const errorRow =
    errors.length > 0
      ? `<tr class="row-errors"><td colspan="6">${errors.map((m) => `<div role="alert">${escapeHtml(m)}</div>`).join('')}</td></tr>`
      : '';

  return `
    <tr data-id="${escapeHtml(phase.id)}">
      <td><input type="text" data-field="name" value="${escapeHtml(phase.name)}" aria-label="Phase ${index + 1} name" ${d}></td>
      <td><input type="number" step="any" data-field="duration_s" value="${phase.duration_s}" aria-label="Phase ${index + 1} duration, seconds" ${d}></td>
      <td><input type="number" step="any" data-field="ax_mps2" value="${phase.ax_mps2}" aria-label="Phase ${index + 1} X acceleration, meters per second squared" ${d}></td>
      <td><input type="number" step="any" data-field="ay_mps2" value="${phase.ay_mps2}" aria-label="Phase ${index + 1} Y acceleration, meters per second squared" ${d}></td>
      <td><input type="text" data-field="note" value="${escapeHtml(phase.note ?? '')}" aria-label="Phase ${index + 1} note" ${d}></td>
      <td class="row-actions">
        <button type="button" data-action="up" ${disabled || index === 0 ? 'disabled' : ''} aria-label="Move phase ${index + 1} up">↑</button>
        <button type="button" data-action="down" ${disabled || index === total - 1 ? 'disabled' : ''} aria-label="Move phase ${index + 1} down">↓</button>
        <button type="button" data-action="duplicate" ${d} aria-label="Duplicate phase ${index + 1}">Duplicate</button>
        <button type="button" data-action="remove" ${d} aria-label="Remove phase ${index + 1}">Remove</button>
      </td>
    </tr>
    ${errorRow}
  `;
}
