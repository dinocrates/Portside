// Small pure numeric helpers for the chart layer. Kept separate from DOM/
// SVG construction so they're trivially unit-testable.

export interface LinearScale {
  (value: number): number;
  invert(pixel: number): number;
}

/** A linear scale mapping [domainMin, domainMax] -> [rangeMin, rangeMax], with an inverse for pointer/keyboard interaction. */
export function createLinearScale(domain: [number, number], range: [number, number]): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const scale = ((value: number) => {
    if (span === 0) return r0;
    return r0 + ((value - d0) / span) * (r1 - r0);
  }) as LinearScale;
  scale.invert = (pixel: number) => {
    const rangeSpan = r1 - r0;
    if (rangeSpan === 0) return d0;
    return d0 + ((pixel - r0) / rangeSpan) * span;
  };
  return scale;
}

/** Extend a data domain to include zero and a small padding margin, so "the zero line" is always meaningful when it's near the data. */
export function niceDomain(min: number, max: number, paddingFraction = 0.15): [number, number] {
  let lo = Math.min(0, min);
  let hi = Math.max(0, max);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * paddingFraction;
  return [lo - pad, hi + pad];
}

/** A small set of "nice" tick values spanning a domain — not exact-count, but never crowded or ugly (0, 1, 2 / 0, 5, 10 / etc.). */
export function niceTicks(min: number, max: number, targetCount = 4): number[] {
  if (min === max) return [min];
  const rawStep = (max - min) / Math.max(1, targetCount);
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep) || 1)));
  const normalized = rawStep / magnitude;
  let niceStep: number;
  if (normalized < 1.5) niceStep = 1;
  else if (normalized < 3) niceStep = 2;
  else if (normalized < 7) niceStep = 5;
  else niceStep = 10;
  const step = niceStep * magnitude;

  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) {
    ticks.push(Math.round(v / step) * step); // snap away from float drift
  }
  return ticks;
}

/** The sample whose x-value is nearest `target`, by index (assumes ascending order). */
export function nearestIndex(values: readonly number[], target: number): number {
  if (values.length === 0) return -1;
  let lo = 0;
  let hi = values.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(values[lo - 1]! - target) <= Math.abs(values[lo]! - target)) return lo - 1;
  return lo;
}
