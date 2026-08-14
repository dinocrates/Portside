// Aligned x-t / v-t / a-t charts with a shared time cursor (spec §9.2).
// Plain inline SVG, no charting library — matches spec §11.1's suggested
// stack ("SVG or a small purpose-built chart layer for aligned educational
// plots"). Built once per completed run (the sample set is frozen once a
// run is terminal), then only the crosshair/readout are mutated on
// hover/keyboard/scrub — never a full rebuild per interaction.
//
// Color roles follow the dataviz skill's validated light-mode palette:
// series line = categorical slot 1 (#2a78d6), failure marker = status
// "critical" (#d03b3b), phase-boundary/limit lines = chart-muted (#898781,
// chrome ink, not a data series — exempt from categorical validation).
// Phase boundaries are vertical+solid, limit lines horizontal+dashed —
// orientation carries the distinction, not color alone (spec §9.2:
// "graphs remain legible without relying on color alone").

import type { RunOrchestrator } from '../app/app-state';
import type { SimulationSnapshot } from '../sim/model/snapshot';
import type { MotionProfile } from '../controllers/profile-controller';
import { createLinearScale, nearestIndex, niceDomain, niceTicks } from './scales';
import { escapeHtml } from '../ui/dom-utils';

const WIDTH = 720;
const HEIGHT = 130;
const MARGIN = { left: 52, right: 16, top: 20, bottom: 24 };
const PLOT = {
  left: MARGIN.left,
  right: WIDTH - MARGIN.right,
  top: MARGIN.top,
  bottom: HEIGHT - MARGIN.bottom,
};

const COLOR_SERIES = '#2a78d6';
const COLOR_CRITICAL = '#d03b3b';
const COLOR_MUTED = '#898781';
const COLOR_GRID = '#e1e0d9';
const COLOR_AXIS = '#c3c2b7';
const COLOR_TEXT_SECONDARY = '#52514e';
const COLOR_SURFACE = '#fcfcfb';

interface MetricSpec {
  key: 'x' | 'v' | 'a';
  title: string;
  unit: string;
  accessor: (s: SimulationSnapshot) => number;
  limitLines?: { value: number; label: string }[];
  showPhaseLabels?: boolean;
}

interface PanelRefs {
  crosshairLine: SVGLineElement;
  crosshairDot: SVGCircleElement;
}

interface BuiltState {
  samples: readonly SimulationSnapshot[];
  times: number[];
  panels: PanelRefs[];
  readout: HTMLElement;
}

function phaseSpans(profile: MotionProfile): { name: string; start_s: number; end_s: number }[] {
  let t = 0;
  return profile.map((phase) => {
    const start_s = t;
    t += phase.duration_s;
    return { name: phase.name, start_s, end_s: t };
  });
}

function earliestFailureTime(snapshot: SimulationSnapshot): { time_s: number; label: string } | null {
  const results = snapshot.requirementResults ?? [];
  const failed = results.filter((r) => !r.satisfied && r.atTime_s !== undefined);
  if (failed.length === 0) return null;
  const first = failed.reduce((a, b) => (b.atTime_s! < a.atTime_s! ? b : a));
  return { time_s: first.atTime_s!, label: first.description };
}

function buildPanelSvg(
  spec: MetricSpec,
  samples: readonly SimulationSnapshot[],
  times: number[],
  phases: { name: string; start_s: number; end_s: number }[],
  failure: { time_s: number; label: string } | null,
): string {
  const values = samples.map(spec.accessor);
  const tMin = times[0]!;
  const tMax = times[times.length - 1]!;
  const [yMin, yMax] = niceDomain(Math.min(...values), Math.max(...values));

  const xScale = createLinearScale([tMin, tMax], [PLOT.left, PLOT.right]);
  const yScale = createLinearScale([yMin, yMax], [PLOT.bottom, PLOT.top]);

  const xTicks = niceTicks(tMin, tMax, 6);
  const yTicks = niceTicks(yMin, yMax, 4);

  const pathD = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xScale(times[i]!).toFixed(2)},${yScale(v).toFixed(2)}`).join(' ');
  const lastX = xScale(times[times.length - 1]!);
  const lastY = yScale(values[values.length - 1]!);

  const gridlinesH = yTicks
    .map((tick) => {
      const y = yScale(tick);
      const isZero = Math.abs(tick) < 1e-9;
      return `
        <line x1="${PLOT.left}" y1="${y.toFixed(2)}" x2="${PLOT.right}" y2="${y.toFixed(2)}" stroke="${isZero ? COLOR_AXIS : COLOR_GRID}" stroke-width="1" />
        <text x="${PLOT.left - 6}" y="${y.toFixed(2)}" text-anchor="end" dominant-baseline="middle" font-size="9" fill="${COLOR_TEXT_SECONDARY}">${formatTick(tick)}</text>
      `;
    })
    .join('');

  const gridlinesV = xTicks
    .map((tick) => {
      const x = xScale(tick);
      return `
        <line x1="${x.toFixed(2)}" y1="${PLOT.top}" x2="${x.toFixed(2)}" y2="${PLOT.bottom}" stroke="${COLOR_GRID}" stroke-width="1" />
        <text x="${x.toFixed(2)}" y="${PLOT.bottom + 13}" text-anchor="middle" font-size="9" fill="${COLOR_TEXT_SECONDARY}">${formatTick(tick)}</text>
      `;
    })
    .join('');

  const limitLines = (spec.limitLines ?? [])
    .filter((l) => l.value > yMin && l.value < yMax)
    .map((l) => {
      const y = yScale(l.value);
      return `
        <line x1="${PLOT.left}" y1="${y.toFixed(2)}" x2="${PLOT.right}" y2="${y.toFixed(2)}" stroke="${COLOR_MUTED}" stroke-width="1" stroke-dasharray="4 3" />
        <text x="${PLOT.right - 4}" y="${(y - 3).toFixed(2)}" text-anchor="end" font-size="8.5" fill="${COLOR_MUTED}">${escapeHtml(l.label)}</text>
      `;
    })
    .join('');

  const phaseBoundaries = phases
    .slice(0, -1)
    .map((phase) => {
      const x = xScale(phase.end_s);
      if (x <= PLOT.left || x >= PLOT.right) return '';
      return `<line x1="${x.toFixed(2)}" y1="${PLOT.top}" x2="${x.toFixed(2)}" y2="${PLOT.bottom}" stroke="${COLOR_MUTED}" stroke-width="1" />`;
    })
    .join('');

  const phaseLabels = spec.showPhaseLabels
    ? phases
        .map((phase) => {
          const midX = xScale((phase.start_s + phase.end_s) / 2);
          if (midX <= PLOT.left || midX >= PLOT.right) return '';
          return `<text x="${midX.toFixed(2)}" y="${PLOT.top - 6}" text-anchor="middle" font-size="9" fill="${COLOR_TEXT_SECONDARY}">${escapeHtml(phase.name)}</text>`;
        })
        .join('')
    : '';

  const failureMarker = failure
    ? (() => {
        const x = xScale(failure.time_s);
        return `<line x1="${x.toFixed(2)}" y1="${PLOT.top}" x2="${x.toFixed(2)}" y2="${PLOT.bottom}" stroke="${COLOR_CRITICAL}" stroke-width="1.5" />`;
      })()
    : '';

  return `
    <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeHtml(spec.title)} over time" class="aligned-chart-svg">
      <g class="grid">${gridlinesH}${gridlinesV}</g>
      <g class="phase-boundaries">${phaseBoundaries}${phaseLabels}</g>
      <g class="limit-lines">${limitLines}</g>
      <g class="failure-marker">${failureMarker}</g>
      <path d="${pathD}" fill="none" stroke="${COLOR_SERIES}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <circle cx="${lastX.toFixed(2)}" cy="${lastY.toFixed(2)}" r="4" fill="${COLOR_SERIES}" stroke="${COLOR_SURFACE}" stroke-width="2" />
      <line class="crosshair-line" x1="${lastX.toFixed(2)}" y1="${PLOT.top}" x2="${lastX.toFixed(2)}" y2="${PLOT.bottom}" stroke="#0b0b0b" stroke-width="1" opacity="0.55" />
      <circle class="crosshair-dot" cx="${lastX.toFixed(2)}" cy="${lastY.toFixed(2)}" r="3.5" fill="#0b0b0b" stroke="${COLOR_SURFACE}" stroke-width="1.5" />
    </svg>
  `;
}

function formatTick(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function summarize(spec: MetricSpec, samples: readonly SimulationSnapshot[]): string {
  const values = samples.map(spec.accessor);
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return `${spec.title}: ${first.toFixed(2)} ${spec.unit} to ${last.toFixed(2)} ${spec.unit} (ranged ${min.toFixed(2)} to ${max.toFixed(2)} ${spec.unit}).`;
}

function metricSpecs(orchestrator: RunOrchestrator): MetricSpec[] {
  const limits = orchestrator.scenario.limits;
  return [
    {
      key: 'x',
      title: 'Position, x(t)',
      unit: 'm',
      accessor: (s) => s.trolley_x_m,
      limitLines: [{ value: orchestrator.scenario.geometry.targetX_m, label: 'target' }],
      showPhaseLabels: true,
    },
    {
      key: 'v',
      title: 'Velocity, v(t)',
      unit: 'm/s',
      accessor: (s) => s.trolley_v_mps,
      limitLines: [
        { value: limits.maxSpeed_mps, label: `max ${limits.maxSpeed_mps} m/s` },
        { value: -limits.maxSpeed_mps, label: `-max` },
      ],
    },
    {
      key: 'a',
      title: 'Acceleration, a(t)',
      unit: 'm/s²',
      accessor: (s) => s.trolley_a_mps2,
      limitLines: [
        { value: limits.maxAcceleration_mps2, label: `max ${limits.maxAcceleration_mps2} m/s²` },
        { value: -limits.maxAcceleration_mps2, label: `-max` },
      ],
    },
  ];
}

export function mountAlignedCharts(container: HTMLElement, orchestrator: RunOrchestrator): void {
  let built: BuiltState | null = null;

  container.innerHTML = '';
  const empty = document.createElement('p');
  empty.className = 'chart-empty';
  empty.textContent = 'Run the simulation to see position, velocity, and acceleration graphs.';
  container.appendChild(empty);

  container.tabIndex = 0;
  container.setAttribute('role', 'group');
  container.setAttribute(
    'aria-label',
    'Aligned position, velocity, and acceleration graphs. Use the left and right arrow keys to move the shared cursor.',
  );

  function currentCursorTime(samples: readonly SimulationSnapshot[]): number {
    if (orchestrator.isReplayingNow()) return orchestrator.getReplayTime_s();
    return samples[samples.length - 1]!.time_s;
  }

  function moveCursorToTime(time_s: number): void {
    if (!orchestrator.isReplayingNow()) orchestrator.startReplay();
    orchestrator.scrubTo(time_s);
  }

  function build(samples: readonly SimulationSnapshot[]): void {
    const times = samples.map((s) => s.time_s);
    const specs = metricSpecs(orchestrator);
    const phases = orchestrator.getProfileUsedForRun() ? phaseSpans(orchestrator.getProfileUsedForRun()!) : [];
    const failure = earliestFailureTime(orchestrator.getSnapshot());

    container.innerHTML = `
      <div class="aligned-charts">
        ${specs
          .map(
            (spec) => `
              <figure class="chart-panel" data-key="${spec.key}">
                <figcaption>${escapeHtml(spec.title)}, ${escapeHtml(spec.unit)}</figcaption>
                ${buildPanelSvg(spec, samples, times, phases, failure)}
                <p class="chart-summary">${escapeHtml(summarize(spec, samples))}</p>
              </figure>
            `,
          )
          .join('')}
      </div>
      <p class="chart-readout" aria-live="polite"></p>
    `;

    const panels: PanelRefs[] = specs.map((spec) => {
      const panelEl = container.querySelector<SVGSVGElement>(`.chart-panel[data-key="${spec.key}"] svg`)!;
      return {
        crosshairLine: panelEl.querySelector<SVGLineElement>('.crosshair-line')!,
        crosshairDot: panelEl.querySelector<SVGCircleElement>('.crosshair-dot')!,
      };
    });
    const readout = container.querySelector<HTMLElement>('.chart-readout')!;

    built = { samples, times, panels, readout };

    // Pointer interaction: hover/drag anywhere on a panel moves the shared cursor (spec §9.2).
    specs.forEach((spec) => {
      const svgEl = container.querySelector<SVGSVGElement>(`.chart-panel[data-key="${spec.key}"] svg`)!;
      const xScale = createLinearScale([times[0]!, times[times.length - 1]!], [PLOT.left, PLOT.right]);

      function handlePointer(evt: PointerEvent): void {
        const rect = svgEl.getBoundingClientRect();
        const scaleX = WIDTH / rect.width;
        const localX = (evt.clientX - rect.left) * scaleX;
        const time_s = xScale.invert(localX);
        const idx = nearestIndex(times, time_s);
        moveCursorToTime(times[idx]!);
      }

      svgEl.addEventListener('pointerdown', (e) => {
        svgEl.setPointerCapture(e.pointerId);
        handlePointer(e);
      });
      svgEl.addEventListener('pointermove', (e) => {
        if (e.buttons === 1) handlePointer(e);
      });
    });
  }

  function updateCursor(): void {
    if (!built) return;
    const { samples, times, panels, readout } = built;
    const time_s = currentCursorTime(samples);
    const idx = nearestIndex(times, time_s);
    const sample = samples[idx]!;

    const specs = metricSpecs(orchestrator);
    specs.forEach((spec, i) => {
      const xScale = createLinearScale([times[0]!, times[times.length - 1]!], [PLOT.left, PLOT.right]);
      const values = samples.map(spec.accessor);
      const [yMin, yMax] = niceDomain(Math.min(...values), Math.max(...values));
      const yScale = createLinearScale([yMin, yMax], [PLOT.bottom, PLOT.top]);
      const x = xScale(sample.time_s);
      const y = yScale(spec.accessor(sample));
      const panel = panels[i]!;
      panel.crosshairLine.setAttribute('x1', x.toFixed(2));
      panel.crosshairLine.setAttribute('x2', x.toFixed(2));
      panel.crosshairDot.setAttribute('cx', x.toFixed(2));
      panel.crosshairDot.setAttribute('cy', y.toFixed(2));
    });

    readout.textContent =
      `At t = ${sample.time_s.toFixed(2)} s:  ` +
      `x = ${sample.trolley_x_m.toFixed(2)} m   ` +
      `v = ${sample.trolley_v_mps.toFixed(2)} m/s   ` +
      `a = ${sample.trolley_a_mps2.toFixed(2)} m/s²`;
  }

  function render(): void {
    const snapshot = orchestrator.getSnapshot();
    const terminal = snapshot.runState === 'complete' || snapshot.runState === 'failed';
    const samples = orchestrator.getRecordedSamples();

    if (!terminal || samples.length < 2) {
      if (built !== null) {
        container.innerHTML = '';
        container.appendChild(empty);
        built = null;
      }
      return;
    }

    if (built === null || built.samples !== samples) {
      build(samples);
    }
    updateCursor();
  }

  container.addEventListener('keydown', (e) => {
    if (!built) return;
    const { samples, times } = built;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const currentIdx = nearestIndex(times, currentCursorTime(samples));
      let nextIdx = currentIdx;
      if (e.key === 'ArrowLeft') nextIdx = Math.max(0, currentIdx - 1);
      if (e.key === 'ArrowRight') nextIdx = Math.min(times.length - 1, currentIdx + 1);
      if (e.key === 'Home') nextIdx = 0;
      if (e.key === 'End') nextIdx = times.length - 1;
      moveCursorToTime(times[nextIdx]!);
    }
  });

  orchestrator.onChange(render);
  render();
}
