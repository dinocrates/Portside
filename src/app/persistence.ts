// Local draft and last-run persistence (spec §12.2): "Page reload may
// restore the draft profile and most recent completed run from local
// storage. Autosave must be versioned so schema changes do not crash the
// application."
//
// Every read is defensive: corrupted JSON, a storage-quota error, private
// browsing with storage disabled, or a payload from an older/future schema
// version all fail closed (return null / no-op) rather than throwing.
// Draft persistence is a convenience — it must never be the reason the app
// crashes or refuses to run.

import type { UiMode } from './app-state';
import type { MotionProfile } from '../controllers/profile-controller';
import type { SimulationSnapshot } from '../sim/model/snapshot';

const SCHEMA_VERSION = 1;
const KEY_PREFIX = 'portside-motion-lab';

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

export interface DraftPayload {
  mode: UiMode;
  profile: MotionProfile;
}

function isMotionProfile(value: unknown): value is MotionProfile {
  return (
    Array.isArray(value) &&
    value.every(
      (p) =>
        p &&
        typeof p === 'object' &&
        typeof p.id === 'string' &&
        typeof p.name === 'string' &&
        typeof p.duration_s === 'number' &&
        typeof p.trolleyAcceleration_mps2 === 'number',
    )
  );
}

export function saveDraft(scenarioId: string, payload: DraftPayload): void {
  writeJson(draftKey(scenarioId), { version: SCHEMA_VERSION, ...payload, savedAt: new Date().toISOString() });
}

export function loadDraft(scenarioId: string): DraftPayload | null {
  const parsed = readJson(draftKey(scenarioId)) as Record<string, unknown> | null;
  if (!parsed || parsed.version !== SCHEMA_VERSION) return null;
  if (parsed.mode !== 'manual' && parsed.mode !== 'automated') return null;
  if (!isMotionProfile(parsed.profile)) return null;
  return { mode: parsed.mode, profile: parsed.profile as MotionProfile };
}

export interface LastRunPayload {
  mode: UiMode;
  profileUsedForRun: MotionProfile | null;
  seed: string;
  finalSnapshot: SimulationSnapshot;
  samples: SimulationSnapshot[];
}

function isSimulationSnapshot(value: unknown): value is SimulationSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.time_s === 'number' &&
    typeof s.runState === 'string' &&
    typeof s.trolley_x_m === 'number' &&
    typeof s.trolley_v_mps === 'number' &&
    typeof s.trolley_a_mps2 === 'number'
  );
}

export function saveLastRun(scenarioId: string, payload: LastRunPayload): void {
  writeJson(lastRunKey(scenarioId), { version: SCHEMA_VERSION, ...payload, savedAt: new Date().toISOString() });
}

export function loadLastRun(scenarioId: string): LastRunPayload | null {
  const parsed = readJson(lastRunKey(scenarioId)) as Record<string, unknown> | null;
  if (!parsed || parsed.version !== SCHEMA_VERSION) return null;
  if (parsed.mode !== 'manual' && parsed.mode !== 'automated') return null;
  if (!isSimulationSnapshot(parsed.finalSnapshot)) return null;
  if (!Array.isArray(parsed.samples) || !parsed.samples.every(isSimulationSnapshot)) return null;
  if (parsed.profileUsedForRun !== null && !isMotionProfile(parsed.profileUsedForRun)) return null;
  return {
    mode: parsed.mode,
    profileUsedForRun: parsed.profileUsedForRun as MotionProfile | null,
    seed: typeof parsed.seed === 'string' ? parsed.seed : '',
    finalSnapshot: parsed.finalSnapshot as SimulationSnapshot,
    samples: parsed.samples as SimulationSnapshot[],
  };
}
