// Local draft and last-run persistence for the 2D gantry lab — same
// versioned, fail-closed pattern as the 1D lab's src/app/persistence.ts.
// Every read is defensive: corrupted JSON, a storage-quota error, private
// browsing with storage disabled, or a payload from an older/future
// schema version all fail closed (return null / no-op) rather than
// throwing. Draft persistence is a convenience — it must never be the
// reason the app crashes or refuses to run.
//
// Uses a distinct key prefix from the 1D lab's persistence.ts so the two
// labs' localStorage entries never collide even though both pages share
// an origin (deployed under the same GitHub Pages site).

import type { GantryUiMode } from './orchestrator';
import type { GantryMotionProfile } from './controllers/profile-controller';
import type { GantrySnapshot } from './model/snapshot';

const SCHEMA_VERSION = 1;
const KEY_PREFIX = 'portside-motion-lab-gantry';

function draftKey(scenarioId: string): string {
  return `${KEY_PREFIX}:draft:v${SCHEMA_VERSION}:${scenarioId}`;
}

function lastRunKey(scenarioId: string): string {
  return `${KEY_PREFIX}:last-run:v${SCHEMA_VERSION}:${scenarioId}`;
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full, disabled (private browsing), or unavailable — autosave
    // is a convenience, never a hard requirement.
  }
}

export interface GantryDraftPayload {
  mode: GantryUiMode;
  profile: GantryMotionProfile;
}

function isGantryMotionProfile(value: unknown): value is GantryMotionProfile {
  return (
    Array.isArray(value) &&
    value.every(
      (p) =>
        p &&
        typeof p === 'object' &&
        typeof p.id === 'string' &&
        typeof p.name === 'string' &&
        typeof p.duration_s === 'number' &&
        typeof p.ax_mps2 === 'number' &&
        typeof p.ay_mps2 === 'number',
    )
  );
}

export function saveGantryDraft(scenarioId: string, payload: GantryDraftPayload): void {
  writeJson(draftKey(scenarioId), { version: SCHEMA_VERSION, ...payload, savedAt: new Date().toISOString() });
}

export function loadGantryDraft(scenarioId: string): GantryDraftPayload | null {
  const parsed = readJson(draftKey(scenarioId)) as Record<string, unknown> | null;
  if (!parsed || parsed.version !== SCHEMA_VERSION) return null;
  if (parsed.mode !== 'manual' && parsed.mode !== 'automated') return null;
  if (!isGantryMotionProfile(parsed.profile)) return null;
  return { mode: parsed.mode, profile: parsed.profile as GantryMotionProfile };
}

export interface GantryLastRunPayload {
  mode: GantryUiMode;
  profileUsedForRun: GantryMotionProfile | null;
  seed: string;
  finalSnapshot: GantrySnapshot;
  samples: GantrySnapshot[];
}

function isGantrySnapshot(value: unknown): value is GantrySnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.time_s === 'number' &&
    typeof s.runState === 'string' &&
    typeof s.x_m === 'number' &&
    typeof s.vx_mps === 'number' &&
    typeof s.y_m === 'number' &&
    typeof s.vy_mps === 'number'
  );
}

export function saveGantryLastRun(scenarioId: string, payload: GantryLastRunPayload): void {
  writeJson(lastRunKey(scenarioId), { version: SCHEMA_VERSION, ...payload, savedAt: new Date().toISOString() });
}

export function loadGantryLastRun(scenarioId: string): GantryLastRunPayload | null {
  const parsed = readJson(lastRunKey(scenarioId)) as Record<string, unknown> | null;
  if (!parsed || parsed.version !== SCHEMA_VERSION) return null;
  if (parsed.mode !== 'manual' && parsed.mode !== 'automated') return null;
  if (!isGantrySnapshot(parsed.finalSnapshot)) return null;
  if (!Array.isArray(parsed.samples) || !parsed.samples.every(isGantrySnapshot)) return null;
  if (parsed.profileUsedForRun !== null && !isGantryMotionProfile(parsed.profileUsedForRun)) return null;
  return {
    mode: parsed.mode,
    profileUsedForRun: parsed.profileUsedForRun as GantryMotionProfile | null,
    seed: typeof parsed.seed === 'string' ? parsed.seed : '',
    finalSnapshot: parsed.finalSnapshot as GantrySnapshot,
    samples: parsed.samples as GantrySnapshot[],
  };
}
