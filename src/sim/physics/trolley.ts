// Pure horizontal trolley physics. No engine/scenario/controller types here
// on purpose — these functions are the lowest-level thing golden vectors
// pin down (spec §14.1: "constant-acceleration integration", "velocity and
// acceleration clamping"). Semi-implicit (symplectic) Euler per spec §8.3:
// update velocity from acceleration first, then update position from the
// *new* velocity.

import type { TrolleyState } from '../model/state';
import { DEFAULT_TOLERANCES } from '../model/parameters';

// Limit comparisons use a small epsilon so floating-point drift from
// hundreds of accumulated additions (e.g. a 5 s ramp at 1/120 s steps)
// never registers as a spurious "exceeded the limit" violation when the
// command was in fact exactly at the limit. See spec §8.8: tolerances are
// centralized, not invented ad hoc.
const LIMIT_EPS = DEFAULT_TOLERANCES.floatEquality;

export function clampMagnitude(value: number, maxAbs: number): number {
  if (maxAbs < 0) throw new RangeError('maxAbs must be non-negative');
  if (value > maxAbs) return maxAbs;
  if (value < -maxAbs) return -maxAbs;
  return value;
}

export function clampRange(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export interface TrolleyStepLimits {
  maxSpeed_mps: number;
  maxAcceleration_mps2: number;
  minX_m: number;
  maxX_m: number;
}

export interface TrolleyStepResult {
  state: TrolleyState;
  /** True if position had to be clamped to the travel envelope this step (an envelope violation, spec §7.2). */
  hitEnvelope: boolean;
  /**
   * True if the *commanded* acceleration exceeded the scenario's
   * compliance limit this step. The physical acceleration is still safely
   * clamped for numerical stability (spec §8.3), but the command itself
   * was out of bounds — this is what makes "acceleration limit exceeded"
   * (spec §7.2, §13.2) a meaningful, recordable event rather than an
   * unreachable condition.
   */
  commandExceededAcceleration: boolean;
  /** Same idea for speed: true if integration would have exceeded the configured max speed before clamping. */
  velocityExceededSpeed: boolean;
}

/**
 * Advance trolley state by one fixed physics step.
 *
 * `commandedAx_mps2` is the controller's requested acceleration (already
 * expected to originate from either the manual controller or an automated
 * profile phase — the engine doesn't care which). It is clamped to the
 * scenario's actuator limit, applied instantaneously (no jerk limiting in
 * the first release, per spec §8.3), integrated into velocity, clamped to
 * the scenario's speed limit, then integrated into position and clamped to
 * the travel envelope.
 */
export function stepTrolley(
  state: TrolleyState,
  commandedAx_mps2: number,
  dt_s: number,
  limits: TrolleyStepLimits,
): TrolleyStepResult {
  if (dt_s < 0) throw new RangeError('dt_s must be non-negative');

  const commandExceededAcceleration = Math.abs(commandedAx_mps2) > limits.maxAcceleration_mps2 + LIMIT_EPS;
  const ax_mps2 = clampMagnitude(commandedAx_mps2, limits.maxAcceleration_mps2);

  const unclampedVx = state.vx_mps + ax_mps2 * dt_s;
  const velocityExceededSpeed = Math.abs(unclampedVx) > limits.maxSpeed_mps + LIMIT_EPS;
  const vx_mps = clampMagnitude(unclampedVx, limits.maxSpeed_mps);

  const unclampedX = state.x_m + vx_mps * dt_s;
  const x_m = clampRange(unclampedX, limits.minX_m, limits.maxX_m);
  const hitEnvelope = x_m !== unclampedX;

  return {
    state: {
      x_m,
      // If the envelope clamped position, zero velocity too rather than
      // letting the trolley "push" against the wall with stored speed.
      vx_mps: hitEnvelope ? 0 : vx_mps,
      ax_mps2,
      commandedAx_mps2,
    },
    hitEnvelope,
    commandExceededAcceleration,
    velocityExceededSpeed,
  };
}
