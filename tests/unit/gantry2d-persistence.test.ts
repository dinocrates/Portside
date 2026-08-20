import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadGantryDraft,
  loadGantryLastRun,
  saveGantryDraft,
  saveGantryLastRun,
} from '../../src/gantry2d/persistence';
import type { GantrySnapshot } from '../../src/gantry2d/model/snapshot';
import type { GantryMotionProfile } from '../../src/gantry2d/controllers/profile-controller';

// Same in-memory localStorage polyfill as tests/unit/persistence.test.ts —
// the test environment is plain Node.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

(globalThis as unknown as { localStorage: Storage }).localStorage = new MemoryStorage();

const profile: GantryMotionProfile = [
  { id: 'a', name: 'Accelerate', duration_s: 2, ax_mps2: 0.6, ay_mps2: 0.3 },
  { id: 'b', name: 'Cruise', duration_s: 1, ax_mps2: 0, ay_mps2: 0 },
];

function snapshot(overrides: Partial<GantrySnapshot> = {}): GantrySnapshot {
  return {
    time_s: 5.0,
    runState: 'complete',
    activePhaseId: null,
    x_m: 8,
    vx_mps: 0,
    ax_mps2: 0,
    commanded_ax_mps2: 0,
    y_m: 4.5,
    vy_mps: 0,
    ay_mps2: 0,
    commanded_ay_mps2: 0,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('gantry draft persistence', () => {
  it('round-trips a saved draft', () => {
    saveGantryDraft('gantry-a', { mode: 'automated', profile });
    expect(loadGantryDraft('gantry-a')).toEqual({ mode: 'automated', profile });
  });

  it('returns null when nothing has been saved', () => {
    expect(loadGantryDraft('never-saved')).toBeNull();
  });

  it('scopes drafts per scenario id, and does not collide with the 1D lab key prefix', () => {
    saveGantryDraft('gantry-a', { mode: 'manual', profile: [] });
    saveGantryDraft('gantry-b', { mode: 'automated', profile });
    expect(loadGantryDraft('gantry-a')?.mode).toBe('manual');
    expect(loadGantryDraft('gantry-b')?.mode).toBe('automated');
    expect(
      Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).every((k) =>
        k!.startsWith('portside-motion-lab-gantry:'),
      ),
    ).toBe(true);
  });

  it('fails closed on corrupted JSON rather than throwing', () => {
    localStorage.setItem('portside-motion-lab-gantry:draft:v1:gantry-a', 'not json{{{');
    expect(() => loadGantryDraft('gantry-a')).not.toThrow();
    expect(loadGantryDraft('gantry-a')).toBeNull();
  });

  it('fails closed on a mismatched schema version', () => {
    localStorage.setItem(
      'portside-motion-lab-gantry:draft:v1:gantry-a',
      JSON.stringify({ version: 999, mode: 'manual', profile: [] }),
    );
    expect(loadGantryDraft('gantry-a')).toBeNull();
  });

  it('fails closed on a structurally wrong payload (missing ay_mps2)', () => {
    localStorage.setItem(
      'portside-motion-lab-gantry:draft:v1:gantry-a',
      JSON.stringify({
        version: 1,
        mode: 'manual',
        profile: [{ id: 'a', name: 'A', duration_s: 1, ax_mps2: 0 }],
      }),
    );
    expect(loadGantryDraft('gantry-a')).toBeNull();
  });
});

describe('gantry last-run persistence', () => {
  it('round-trips a completed run', () => {
    const final = snapshot();
    saveGantryLastRun('gantry-a', {
      mode: 'automated',
      profileUsedForRun: profile,
      seed: 'run-123',
      finalSnapshot: final,
      samples: [snapshot({ time_s: 0, x_m: 1, y_m: 1 }), final],
    });
    const loaded = loadGantryLastRun('gantry-a');
    expect(loaded?.finalSnapshot).toEqual(final);
    expect(loaded?.samples).toHaveLength(2);
    expect(loaded?.profileUsedForRun).toEqual(profile);
    expect(loaded?.seed).toBe('run-123');
  });

  it('round-trips a manual run with no profile', () => {
    const final = snapshot();
    saveGantryLastRun('gantry-a', {
      mode: 'manual',
      profileUsedForRun: null,
      seed: 'run-456',
      finalSnapshot: final,
      samples: [final],
    });
    expect(loadGantryLastRun('gantry-a')?.profileUsedForRun).toBeNull();
  });

  it('returns null when nothing has been saved', () => {
    expect(loadGantryLastRun('never-saved')).toBeNull();
  });

  it('fails closed on a structurally wrong payload', () => {
    localStorage.setItem(
      'portside-motion-lab-gantry:last-run:v1:gantry-a',
      JSON.stringify({ version: 1, mode: 'manual', finalSnapshot: { bogus: true }, samples: [] }),
    );
    expect(loadGantryLastRun('gantry-a')).toBeNull();
  });

  it('does not throw when localStorage.setItem fails (quota exceeded, private mode, etc.)', () => {
    const original = localStorage.setItem;
    localStorage.setItem = () => {
      throw new DOMException('quota exceeded');
    };
    expect(() =>
      saveGantryLastRun('gantry-a', {
        mode: 'manual',
        profileUsedForRun: null,
        seed: 's',
        finalSnapshot: snapshot(),
        samples: [snapshot()],
      }),
    ).not.toThrow();
    localStorage.setItem = original;
  });
});
