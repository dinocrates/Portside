// Automated motion-profile controller (spec §6.3). Walks a sequence of
// constant-acceleration phases entered by the student. This is the runtime
// counterpart of the profile-editor UI (owned by Controls and UI) — the
// editor is responsible for producing a *valid* `MotionProfile` (accepted
// signed decimals, no blank/nonnumeric/negative-duration/out-of-range
// entries, per §6.3); this controller assumes that validation already
// happened and just executes the phases.

import { NEUTRAL_COMMAND, type ControlCommand } from '../sim/model/commands';
import type { ScenarioConfig } from '../scenarios/schema';
import type { SimulationSnapshot } from '../sim/model/snapshot';
import type { Controller } from './controller-types';

export interface MotionPhase {
  id: string;
  /** Student-readable label such as "Accelerate", "Cruise", "Brake" (spec §6.3). */
  name: string;
  duration_s: number;
  trolleyAcceleration_mps2: number;
  note?: string;
}

export type MotionProfile = MotionPhase[];

export function totalProgrammedTime_s(profile: MotionProfile): number {
  return profile.reduce((sum, phase) => sum + phase.duration_s, 0);
}

/** Line-specific validation (spec §6.3: "show line-specific validation rather than a generic failure message"). */
export interface PhaseValidationError {
  phaseIndex: number;
  field: 'duration_s' | 'trolleyAcceleration_mps2';
  message: string;
}

export function validateProfile(profile: MotionProfile, scenario: ScenarioConfig): PhaseValidationError[] {
  const errors: PhaseValidationError[] = [];
  profile.forEach((phase, phaseIndex) => {
    if (!Number.isFinite(phase.duration_s) || phase.duration_s <= 0) {
      errors.push({ phaseIndex, field: 'duration_s', message: 'Duration must be a positive number.' });
    }
    if (!Number.isFinite(phase.trolleyAcceleration_mps2)) {
      errors.push({ phaseIndex, field: 'trolleyAcceleration_mps2', message: 'Acceleration must be a number.' });
    } else if (Math.abs(phase.trolleyAcceleration_mps2) > scenario.limits.maxAcceleration_mps2) {
      errors.push({
        phaseIndex,
        field: 'trolleyAcceleration_mps2',
        message: `Magnitude exceeds the scenario limit of ${scenario.limits.maxAcceleration_mps2} m/s².`,
      });
    }
  });
  return errors;
}

export class ProfileController implements Controller {
  private profile: MotionProfile = [];
  private startTime_s = 0;

  constructor(profile: MotionProfile) {
    this.profile = profile;
  }

  reset(snapshot: SimulationSnapshot, _scenario: ScenarioConfig): void {
    this.startTime_s = snapshot.time_s;
  }

  private activePhase(elapsed_s: number): { phase: MotionPhase | null; index: number } {
    let acc = 0;
    for (let i = 0; i < this.profile.length; i++) {
      const phase = this.profile[i]!;
      acc += phase.duration_s;
      if (elapsed_s < acc) return { phase, index: i };
    }
    return { phase: null, index: -1 };
  }

  command(snapshot: SimulationSnapshot, _dt_s: number): ControlCommand {
    const elapsed_s = snapshot.time_s - this.startTime_s;
    const { phase } = this.activePhase(elapsed_s);
    if (!phase) return NEUTRAL_COMMAND;

    return {
      targetTrolleyAcceleration_mps2: phase.trolleyAcceleration_mps2,
      targetHoistAcceleration_mps2: 0,
      attachmentCommand: 'none',
    };
  }

  /** The id of the phase active at `elapsed_s` into the profile, or null once the profile has ended. */
  activePhaseId(elapsed_s: number): string | null {
    return this.activePhase(elapsed_s).phase?.id ?? null;
  }

  isFinished(snapshot: SimulationSnapshot): boolean {
    const elapsed_s = snapshot.time_s - this.startTime_s;
    return elapsed_s >= totalProgrammedTime_s(this.profile);
  }
}
