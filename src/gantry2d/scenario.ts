// Scenario schema for the 2D overhead gantry lab. Deliberately simpler
// than the 1D lab's scenario schema (src/scenarios/schema.ts) — no
// features/pedagogy/scoring-config generality yet, since this lab is
// still at its Milestone-0/1-equivalent stage. Validated with zod the
// same way, so a malformed scenario fails loudly rather than silently.

import { z } from 'zod';

export const GantryScenarioConfigSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    title: z.string().min(1),
    brief: z.string().min(1),
    geometry: z
      .object({
        minX_m: z.number(),
        maxX_m: z.number(),
        minY_m: z.number(),
        maxY_m: z.number(),
        initialX_m: z.number(),
        initialY_m: z.number(),
        targetX_m: z.number(),
        targetY_m: z.number(),
        /** Radius, in meters — completion requires the 2D distance to target within this. */
        targetTolerance_m: z.number().positive(),
      })
      .refine((g) => g.maxX_m > g.minX_m && g.maxY_m > g.minY_m, {
        message: 'max_m must be greater than min_m on each axis',
      }),
    limits: z.object({
      /** Shared by both axes — same rail hardware on X and Y is a reasonable simplification for a first pass. */
      maxSpeed_mps: z.number().positive(),
      maxAcceleration_mps2: z.number().positive(),
      finalSpeedTolerance_mps: z.number().positive(),
      completionDwellTime_s: z.number().nonnegative().default(0.25),
    }),
  })
  .refine(
    (s) =>
      s.geometry.initialX_m >= s.geometry.minX_m &&
      s.geometry.initialX_m <= s.geometry.maxX_m &&
      s.geometry.initialY_m >= s.geometry.minY_m &&
      s.geometry.initialY_m <= s.geometry.maxY_m &&
      s.geometry.targetX_m >= s.geometry.minX_m &&
      s.geometry.targetX_m <= s.geometry.maxX_m &&
      s.geometry.targetY_m >= s.geometry.minY_m &&
      s.geometry.targetY_m <= s.geometry.maxY_m,
    { message: 'initial and target positions must lie within the playfield envelope' },
  );

export type GantryScenarioConfig = z.infer<typeof GantryScenarioConfigSchema>;

export class GantryScenarioValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Gantry scenario failed validation:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'GantryScenarioValidationError';
    this.issues = issues;
  }
}

export function validateGantryScenario(raw: unknown): GantryScenarioConfig {
  const result = GantryScenarioConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new GantryScenarioValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}
