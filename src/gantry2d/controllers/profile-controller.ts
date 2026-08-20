// Automated dual-axis motion-profile controller for the 2D gantry lab —
// same sequential-phase pattern as the 1D lab's ProfileController
// (src/controllers/profile-controller.ts), extended to command both axes
// per phase instead of one. This is the runtime counterpart of the
// profile-editor UI (src/gantry2d/ui/profile-editor.ts): the editor is
// responsible for producing a *valid* GantryMotionProfile; this
// controller assumes that validation already happened and just executes
// the phases.

import { GANTRY_NEUTRAL_COMMAND, type GantryControlCommand } from '../model/commands';
import type { GantryScenarioConfig } from '../scenario';
import type { GantrySnapshot } from '../model/snapshot';

export interface GantryMotionPhase {
  id: string;
  /** Student-readable label such as "Accelerate", "Cruise", "Brake". */
  name: string;
  duration_s: number;
  ax_mps2: number;
  ay_mps2: number;
  note?: string;
}

export type GantryMotionProfile = GantryMotionPhase[];

export function totalGantryProgrammedTime_s(profile: GantryMotionProfile): number {
  return profile.reduce((sum, phase) => sum + phase.duration_s, 0);
}

/** Line-specific validation (spec §6.3's pattern, applied to two acceleration columns instead of one). */
export interface GantryPhaseValidationError {
  phaseIndex: number;
  field: 'duration_s' | 'ax_mps2' | 'ay_mps2';
  message: string;
}

export function validateGantryProfile(
  profile: GantryMotionProfile,
  scenario: GantryScenarioConfig,
): GantryPhaseValidationError[] {
  const errors: GantryPhaseValidationError[] = [];
  profile.forEach((phase, phaseIndex) => {
    if (!Number.isFinite(phase.duration_s) || phase.duration_s <= 0) {
      errors.push({ phaseIndex, field: 'duration_s', message: 'Duration must be a positive number.' });
    }
    (['ax_mps2', 'ay_mps2'] as const).forEach((field) => {
      const value = phase[field];
      const axisLabel = field === 'ax_mps2' ? 'X acceleration' : 'Y acceleration';
      if (!Number.isFinite(value)) {
        errors.push({ phaseIndex, field, message: `${axisLabel} must be a number.` });
      } else if (Math.abs(value) > scenario.limits.maxAcceleration_mps2) {
        errors.push({
          phaseIndex,
          field,
          message: `${axisLabel} magnitude exceeds the scenario limit of ${scenario.limits.maxAcceleration_mps2} m/s².`,
        });
      }
    });
  });
  return errors;
}

/** A default, already-valid template — a starting point for editing, not a revealed answer (same disclaimer as the 1D lab's createDefaultProfileTemplate). */
export function createDefaultGantryProfileTemplate(scenario: GantryScenarioConfig): GantryMotionProfile {
  const a = scenario.limits.maxAcceleration_mps2 / 2;
  return [
    { id: 'phase-1', name: 'Accelerate', duration_s: 1, ax_mps2: a, ay_mps2: a },
    { id: 'phase-2', name: 'Cruise', duration_s: 1, ax_mps2: 0, ay_mps2: 0 },
    { id: 'phase-3', name: 'Decelerate', duration_s: 1, ax_mps2: -a, ay_mps2: -a },
  ];
}

export class GantryProfileController {
  private readonly profile: GantryMotionProfile;
  private startTime_s = 0;

  constructor(profile: GantryMotionProfile) {
    this.profile = profile;
  }

  /** The profile always starts synchronized with the engine reset (both at t=0 — see GantryEngine.reset), so no snapshot/scenario is needed here. */
  reset(): void {
    this.startTime_s = 0;
  }

  private activePhase(elapsed_s: number): { phase: GantryMotionPhase | null; index: number } {
    let acc = 0;
    for (let i = 0; i < this.profile.length; i++) {
      const phase = this.profile[i]!;
      acc += phase.duration_s;
      if (elapsed_s < acc) return { phase, index: i };
    }
    return { phase: null, index: -1 };
  }

  command(snapshot: GantrySnapshot): GantryControlCommand {
    const elapsed_s = snapshot.time_s - this.startTime_s;
    const { phase } = this.activePhase(elapsed_s);
    if (!phase) return GANTRY_NEUTRAL_COMMAND;
    return { targetAxAccel_mps2: phase.ax_mps2, targetAyAccel_mps2: phase.ay_mps2 };
  }

  /** The id of the phase active at `elapsed_s` into the profile, or null once the profile has ended. */
  activePhaseId(elapsed_s: number): string | null {
    return this.activePhase(elapsed_s).phase?.id ?? null;
  }

  isFinished(snapshot: GantrySnapshot): boolean {
    const elapsed_s = snapshot.time_s - this.startTime_s;
    return elapsed_s >= totalGantryProgrammedTime_s(this.profile);
  }
}
