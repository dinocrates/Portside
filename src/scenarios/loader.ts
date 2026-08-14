// Scenario loading and validation. Spec §10.1: invalid scenarios fail with
// a developer-readable error and a student-safe fallback message; §10.3:
// untrusted imported configuration must be validated and must never
// execute code (this loader only ever calls JSON.parse, never eval).

import { ScenarioConfigSchema, type ScenarioConfig } from './schema';

export const STUDENT_SAFE_LOAD_ERROR_MESSAGE =
  "This lab scenario couldn't be loaded. Please reload the page or tell your instructor.";

export class ScenarioValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Scenario failed validation:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ScenarioValidationError';
    this.issues = issues;
  }
}

/**
 * Validate an already-parsed value against the scenario schema. Throws
 * ScenarioValidationError with a developer-readable message on failure.
 */
export function validateScenario(raw: unknown): ScenarioConfig {
  const result = ScenarioConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new ScenarioValidationError(issues);
  }
  return result.data;
}

/**
 * Parse and validate a scenario from a JSON string (e.g. fetched from
 * `src/scenarios/*.json` or an instructor-provided file). Never executes
 * code from the input — `JSON.parse` only.
 */
export function loadScenarioFromJson(jsonText: string): ScenarioConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (err) {
    throw new ScenarioValidationError([`Invalid JSON: ${(err as Error).message}`]);
  }
  return validateScenario(raw);
}
