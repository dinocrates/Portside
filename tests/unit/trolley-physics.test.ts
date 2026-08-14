import { describe, expect, it } from 'vitest';
import { clampMagnitude, clampRange, stepTrolley } from '../../src/sim/physics/trolley';
import type { TrolleyState } from '../../src/sim/model/state';

const limits = { maxSpeed_mps: 4.0, maxAcceleration_mps2: 0.8, minX_m: 0, maxX_m: 32 };
const dt = 1 / 120;

function initial(): TrolleyState {
  return { x_m: 0, vx_mps: 0, ax_mps2: 0, commandedAx_mps2: 0 };
}

describe('clampMagnitude / clampRange', () => {
  it('clamps symmetric magnitude', () => {
    expect(clampMagnitude(5, 2)).toBe(2);
    expect(clampMagnitude(-5, 2)).toBe(-2);
    expect(clampMagnitude(1, 2)).toBe(1);
  });

  it('clamps to a range', () => {
    expect(clampRange(-1, 0, 10)).toBe(0);
    expect(clampRange(11, 0, 10)).toBe(10);
    expect(clampRange(5, 0, 10)).toBe(5);
  });
});

describe('stepTrolley — constant acceleration', () => {
  it('matches analytical position and velocity within tolerance (spec §13.3)', () => {
    let state = initial();
    const a = 0.5; // well under the 0.8 limit, so no clamping interferes with this check
    const steps = 120; // 1 second
    for (let i = 0; i < steps; i++) {
      state = stepTrolley(state, a, dt, limits).state;
    }
    // Analytic (continuous) reference: v = a*t, x = 0.5*a*t^2.
    // Semi-implicit Euler has an O(dt) bias vs. the continuous integral —
    // tolerance reflects that, not floating-point noise.
    expect(state.vx_mps).toBeCloseTo(0.5, 5);
    expect(state.x_m).toBeCloseTo(0.25, 2);
  });

  it('preserves velocity under zero acceleration (spec §13.3)', () => {
    let state: TrolleyState = { x_m: 1, vx_mps: 2, ax_mps2: 0, commandedAx_mps2: 0 };
    for (let i = 0; i < 60; i++) {
      state = stepTrolley(state, 0, dt, limits).state;
    }
    expect(state.vx_mps).toBeCloseTo(2, 9);
  });
});

describe('stepTrolley — clamping and violations', () => {
  it('clamps acceleration to the actuator limit and flags the command as a violation', () => {
    const result = stepTrolley(initial(), 5.0, dt, limits);
    expect(result.state.ax_mps2).toBeCloseTo(limits.maxAcceleration_mps2, 9);
    expect(result.commandExceededAcceleration).toBe(true);
  });

  it('does not flag a command exactly at the acceleration limit', () => {
    const result = stepTrolley(initial(), limits.maxAcceleration_mps2, dt, limits);
    expect(result.commandExceededAcceleration).toBe(false);
  });

  it('clamps velocity to the speed limit and flags the violation', () => {
    const fastState: TrolleyState = { x_m: 0, vx_mps: 3.999, ax_mps2: 0, commandedAx_mps2: 0 };
    const result = stepTrolley(fastState, limits.maxAcceleration_mps2, dt, limits);
    expect(result.state.vx_mps).toBeLessThanOrEqual(limits.maxSpeed_mps);
    expect(result.velocityExceededSpeed).toBe(true);
  });

  it('does not spuriously flag speed violation from float accumulation reaching exactly the limit', () => {
    // 600 steps of 0.8 m/s^2 at dt=1/120 reaches exactly 4.0 m/s in real
    // arithmetic; floating point may drift by ~1e-13. This must not read
    // as "exceeded".
    let state = initial();
    let anyViolation = false;
    for (let i = 0; i < 600; i++) {
      const result = stepTrolley(state, 0.8, dt, limits);
      state = result.state;
      if (result.velocityExceededSpeed) anyViolation = true;
    }
    expect(state.vx_mps).toBeCloseTo(4.0, 6);
    expect(anyViolation).toBe(false);
  });

  it('clamps position to the travel envelope and zeroes velocity on contact', () => {
    const nearWall: TrolleyState = { x_m: 31.99, vx_mps: 4.0, ax_mps2: 0, commandedAx_mps2: 0 };
    const result = stepTrolley(nearWall, 0, dt, limits);
    expect(result.state.x_m).toBe(limits.maxX_m);
    expect(result.state.vx_mps).toBe(0);
    expect(result.hitEnvelope).toBe(true);
  });

  it('rejects a negative time step', () => {
    expect(() => stepTrolley(initial(), 0, -dt, limits)).toThrow(RangeError);
  });
});
