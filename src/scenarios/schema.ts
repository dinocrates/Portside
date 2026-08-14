// Scenario schema and runtime validator. Spec §10.1: "The actual schema
// must be validated at load time. Invalid scenarios should fail with a
// developer-readable error and a student-safe fallback message."
//
// The spec gives a *conceptual* TypeScript shape (§10.1), not a final one.
// This file is that shape made concrete and runtime-checked with zod. Two
// additions beyond the spec's literal listing, both needed to make the
// engine actually implementable:
//   - `limits.completionDwellTime_s` — spec §7.1 requires completion
//     conditions to hold "for a configurable dwell time"; the conceptual
//     shape didn't name a field for it.
//   - `ObstacleConfig`, `CargoConfig`, `RequirementConfig` are referenced
//     by name in §10.1 but not defined there; their shapes are derived
//     from §8.6 (cargo), §8.7 (collision geometry), and §7.1/§7.2/§9.3
//     (requirements and violation reporting).
// Changes to this file are contract changes — see AGENTS.md.

import { z } from 'zod';

export const ObstacleConfigSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  minX_m: z.number(),
  maxX_m: z.number(),
  minY_m: z.number().optional(),
  maxY_m: z.number().optional(),
});
export type ObstacleConfig = z.infer<typeof ObstacleConfigSchema>;

export const CargoConfigSchema = z.object({
  /**
   * When true, only a supplied safe-acceleration limit is enforced
   * (spec §8.6, final paragraph) rather than the full friction/sliding
   * model — appropriate for the first kinematics lab.
   */
  simplifiedThresholdOnly: z.boolean().default(true),
  cargoMass_kg: z.number().positive().optional(),
  staticFrictionCoefficient: z.number().positive().optional(),
  kineticFrictionCoefficient: z.number().positive().optional(),
  leftClearance_m: z.number().nonnegative().optional(),
  rightClearance_m: z.number().nonnegative().optional(),
  impactDamageCoefficient: z.number().nonnegative().optional(),
});
export type CargoConfig = z.infer<typeof CargoConfigSchema>;

export const RequirementKindSchema = z.enum([
  'finalPosition',
  'finalSpeed',
  'finalAngle',
  'maxSpeed',
  'maxAcceleration',
  'maxCargoOffset',
  'maxCargoDamage',
  'noCollision',
  'cycleTime',
  'profileEndedMoving',
]);
export type RequirementKind = z.infer<typeof RequirementKindSchema>;

export const RequirementConfigSchema = z.object({
  id: z.string(),
  description: z.string(),
  kind: RequirementKindSchema,
  /** Threshold value associated with this requirement, when applicable (unit implied by `kind`). */
  value: z.number().optional(),
});
export type RequirementConfig = z.infer<typeof RequirementConfigSchema>;

export const ScenarioFeaturesSchema = z.object({
  manualMode: z.boolean(),
  automatedMode: z.boolean(),
  verticalMotion: z.boolean(),
  sway: z.boolean(),
  cargoShift: z.boolean(),
  collisions: z.boolean(),
  forces: z.boolean(),
  energy: z.boolean(),
});

export const ScenarioGeometrySchema = z
  .object({
    trolleyMinX_m: z.number(),
    trolleyMaxX_m: z.number(),
    initialX_m: z.number(),
    targetX_m: z.number(),
    targetTolerance_m: z.number().positive(),
    initialCableLength_m: z.number().positive(),
    obstacles: z.array(ObstacleConfigSchema).default([]),
  })
  .refine((g) => g.trolleyMaxX_m > g.trolleyMinX_m, {
    message: 'trolleyMaxX_m must be greater than trolleyMinX_m',
  })
  .refine((g) => g.initialX_m >= g.trolleyMinX_m && g.initialX_m <= g.trolleyMaxX_m, {
    message: 'initialX_m must lie within the trolley travel envelope',
  })
  .refine((g) => g.targetX_m >= g.trolleyMinX_m && g.targetX_m <= g.trolleyMaxX_m, {
    message: 'targetX_m must lie within the trolley travel envelope',
  });

export const ScenarioLimitsSchema = z.object({
  maxSpeed_mps: z.number().positive(),
  maxAcceleration_mps2: z.number().positive(),
  maxJerk_mps3: z.number().positive().optional(),
  maxCycleTime_s: z.number().positive().optional(),
  finalSpeedTolerance_mps: z.number().positive(),
  /** How long completion conditions must hold continuously before a run is graded complete (spec §7.1). */
  completionDwellTime_s: z.number().nonnegative().default(0.25),
});

export const ScenarioPedagogySchema = z.object({
  showLiveGraphs: z.boolean(),
  allowPredictionPreview: z.boolean(),
  allowUnlimitedRuns: z.boolean(),
  showHiddenPhysics: z.boolean(),
});

export const ScenarioConfigSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  title: z.string().min(1),
  brief: z.string().min(1),
  features: ScenarioFeaturesSchema,
  geometry: ScenarioGeometrySchema,
  limits: ScenarioLimitsSchema,
  cargo: CargoConfigSchema,
  scoring: z.array(RequirementConfigSchema),
  pedagogy: ScenarioPedagogySchema,
});

export type ScenarioConfig = z.infer<typeof ScenarioConfigSchema>;
