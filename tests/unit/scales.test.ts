import { describe, expect, it } from 'vitest';
import { createLinearScale, nearestIndex, niceDomain, niceTicks } from '../../src/analysis/scales';

describe('createLinearScale', () => {
  it('maps domain to range linearly', () => {
    const scale = createLinearScale([0, 10], [0, 100]);
    expect(scale(0)).toBe(0);
    expect(scale(5)).toBe(50);
    expect(scale(10)).toBe(100);
  });

  it('inverts pixels back to domain values', () => {
    const scale = createLinearScale([0, 10], [0, 100]);
    expect(scale.invert(50)).toBe(5);
  });

  it('handles a zero-width domain without dividing by zero', () => {
    const scale = createLinearScale([5, 5], [0, 100]);
    expect(scale(5)).toBe(0);
    expect(Number.isFinite(scale(5))).toBe(true);
  });
});

describe('niceDomain', () => {
  it('always includes zero', () => {
    const [lo, hi] = niceDomain(2, 8);
    expect(lo).toBeLessThanOrEqual(0);
    expect(hi).toBeGreaterThanOrEqual(8);
  });

  it('pads a negative-only range too', () => {
    const [lo, hi] = niceDomain(-8, -2);
    expect(lo).toBeLessThan(-8);
    expect(hi).toBeGreaterThanOrEqual(0);
  });

  it('never collapses to a zero-width domain', () => {
    const [lo, hi] = niceDomain(0, 0);
    expect(hi).toBeGreaterThan(lo);
  });
});

describe('niceTicks', () => {
  it('produces ascending ticks within a reasonable count', () => {
    const ticks = niceTicks(0, 30, 4);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]!).toBeGreaterThan(ticks[i - 1]!);
  });

  it('handles a degenerate min===max domain', () => {
    expect(niceTicks(5, 5)).toEqual([5]);
  });
});

describe('nearestIndex', () => {
  const values = [0, 1, 2, 3, 4, 5];

  it('finds an exact match', () => {
    expect(nearestIndex(values, 3)).toBe(3);
  });

  it('rounds to the nearest neighbor', () => {
    expect(nearestIndex(values, 3.4)).toBe(3);
    expect(nearestIndex(values, 3.6)).toBe(4);
  });

  it('clamps below and above the range', () => {
    expect(nearestIndex(values, -10)).toBe(0);
    expect(nearestIndex(values, 100)).toBe(5);
  });

  it('returns -1 for an empty array', () => {
    expect(nearestIndex([], 3)).toBe(-1);
  });
});
