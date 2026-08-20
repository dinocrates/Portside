export interface GantryControlCommand {
  targetAxAccel_mps2: number;
  targetAyAccel_mps2: number;
}

export const GANTRY_NEUTRAL_COMMAND: Readonly<GantryControlCommand> = Object.freeze({
  targetAxAccel_mps2: 0,
  targetAyAccel_mps2: 0,
});
