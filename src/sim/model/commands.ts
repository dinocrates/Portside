// Command contract between controllers (manual, automated profile, later
// command-sequence and feedback-controller modes) and the simulation
// engine. Spec §11.4. Manual and automated control MUST both produce this
// same shape (AGENTS.md rule 5) — the engine has no idea which produced it.

export type AttachmentCommand = 'none' | 'attach' | 'release';

export interface ControlCommand {
  targetTrolleyAcceleration_mps2: number;
  targetHoistAcceleration_mps2: number;
  attachmentCommand: AttachmentCommand;
}

/** A command that requests no motion and no attachment change. */
export const NEUTRAL_COMMAND: Readonly<ControlCommand> = Object.freeze({
  targetTrolleyAcceleration_mps2: 0,
  targetHoistAcceleration_mps2: 0,
  attachmentCommand: 'none',
});
