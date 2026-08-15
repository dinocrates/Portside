import { beforeEach, describe, expect, it } from 'vitest';
import { loadDraft, loadLastRun, saveDraft, saveLastRun } from '../../src/app/persistence';
import type { SimulationSnapshot } from '../../src/sim/model/snapshot';
import type { MotionProfile } from '../../src/controllers/profile-controller';

// The test environment is plain Node (vite.config.ts sets test.environment
// to 'node' — the sim/engine layer has no DOM dependency and shouldn't
// need one). persistence.ts is the one module that touches localStorage,
// so it gets a minimal in-memory polyfill here rather than pulling in a
// jsdom dependency for the whole suite.
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

const profile: MotionProfile = [
  { id: 'a', name: 'Accelerate', duration_s: 5, trolleyAcceleration_mps2: 0.8 },
  { id: 'b', name: 'Cruise', duration_s: 2.5, trolleyAcceleration_mps2: 0 },
];

function snapshot(overrides: Partial<SimulationSnapshot> = {}): SimulationSnapshot {
  return {
    time_s: 12.5,
    runState: 'complete',
    activePhaseId: null,
    trolley_x_m: 30,
    trolley_v_mps: 0,
    trolley_a_mps2: 0,
    commanded_trolley_a_mps2: 0,
    attachment: 'attached',
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('draft persistence', () => {
  it('round-trips a saved draft', () => {
    saveDraft('scenario-a', { mode: 'automated', profile });
    const loaded = loadDraft('scenario-a');
    expect(loaded).toEqual({ mode: 'automated', profile });
  });

  it('returns null when nothing has been saved', () => {
    expect(loadDraft('never-saved')).toBeNull();
  });

  it('scopes drafts per scenario id', () => {
    saveDraft('scenario-a', { mode: 'manual', profile: [] });
    saveDraft('scenario-b', { mode: 'automated', profile });
    expect(loadDraft('scenario-a')?.mode).toBe('manual');
    expect(loadDraft('scenario-b')?.mode).toBe('automated');
  });

  it('fails closed on corrupted JSON rather than throwing', () => {
    localStorage.setItem('portside-motion-lab:draft:v1:scenario-a', 'not json{{{');
    expect(() => loadDraft('scenario-a')).not.toThrow();
    expect(loadDraft('scenario-a')).toBeNull();
  });

  it('fails closed on a mismatched schema version', () => {
    localStorage.setItem(
      'portside-motion-lab:draft:v1:scenario-a',
      JSON.stringify({ version: 999, mode: 'manual', profile: [] }),
    );
    expect(loadDraft('scenario-a')).toBeNull();
  });

  it('fails closed on a structurally wrong payload', () => {
    localStorage.setItem(
      'portside-motion-lab:draft:v1:scenario-a',
      JSON.stringify({ version: 1, mode: 'manual', profile: 'not-an-array' }),
    );
    expect(loadDraft('scenario-a')).toBeNull();
  });
});

describe('last-run persistence', () => {
  it('round-trips a completed run', () => {
    const final = snapshot();
    saveLastRun('scenario-a', {
      mode: 'automated',
      profileUsedForRun: profile,
      seed: 'run-123',
      finalSnapshot: final,
      samples: [snapshot({ time_s: 0, trolley_x_m: 0 }), final],
    });
    const loaded = loadLastRun('scenario-a');
    expect(loaded?.finalSnapshot).toEqual(final);
    expect(loaded?.samples).toHaveLength(2);
    expect(loaded?.profileUsedForRun).toEqual(profile);
    expect(loaded?.seed).toBe('run-123');
  });

  it('round-trips a manual run with no profile', () => {
    const final = snapshot();
    saveLastRun('scenario-a', {
      mode: 'manual',
      profileUsedForRun: null,
      seed: 'run-456',
      finalSnapshot: final,
      samples: [final],
    });
    expect(loadLastRun('scenario-a')?.profileUsedForRun).toBeNull();
  });

  it('returns null when nothing has been saved', () => {
    expect(loadLastRun('never-saved')).toBeNull();
  });

  it('fails closed on a structurally wrong payload', () => {
    localStorage.setItem(
      'portside-motion-lab:last-run:v1:scenario-a',
      JSON.stringify({ version: 1, mode: 'manual', finalSnapshot: { bogus: true }, samples: [] }),
    );
    expect(loadLastRun('scenario-a')).toBeNull();
  });

  it('does not throw when localStorage.setItem fails (quota exceeded, private mode, etc.)', () => {
    const original = localStorage.setItem;
    localStorage.setItem = () => {
      throw new DOMException('quota exceeded');
    };
    expect(() => saveLastRun('scenario-a', {
      mode: 'manual',
      profileUsedForRun: null,
      seed: 's',
      finalSnapshot: snapshot(),
      samples: [snapshot()],
    })).not.toThrow();
    localStorage.setItem = original;
  });
});
