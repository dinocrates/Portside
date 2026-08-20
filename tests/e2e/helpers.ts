import type { Page } from '@playwright/test';

/** Fill one profile-editor row's duration and acceleration fields. */
export async function setPhase(page: Page, index: number, duration_s: number, accel_mps2: number): Promise<void> {
  const row = page.locator('table.profile-table tbody tr[data-id]').nth(index);
  await row.locator('[data-field="duration_s"]').fill(String(duration_s));
  await row.locator('[data-field="trolleyAcceleration_mps2"]').fill(String(accel_mps2));
}

/**
 * The analytically-correct trapezoidal profile for the Fragile Freight
 * Transfer scenario (30 m, aMax=0.8 m/s^2, vMax=4.0 m/s) — the same one
 * proven in tests/fixtures/golden-vectors/trapezoidal-success.json.
 */
export async function fillTrapezoidalProfile(page: Page): Promise<void> {
  await setPhase(page, 0, 5.0, 0.8);
  await setPhase(page, 1, 2.5, 0.0);
  await setPhase(page, 2, 5.0, -0.8);
}

// Headless WebKit in this environment measurably runs the physics loop
// slower than real time under the "Desktop Safari" device profile
// (confirmed by direct diagnostic: a run that reaches x=30m correctly
// sometimes takes ~20s+ of wall-clock time for a 12.7s simulated run,
// vs. Chromium/Firefox comfortably finishing in well under 15s). The
// physics itself is correct in all three browsers — this is a real
// performance characteristic of headless WebKit to accommodate, not a
// bug to paper over with a tiny timeout.
export const RUN_STATE_TIMEOUT_MS = 40_000;

export async function waitForRunState(
  page: Page,
  state: string,
  timeout = RUN_STATE_TIMEOUT_MS,
  liveStripSelector = '#live-strip',
): Promise<void> {
  await page.waitForFunction(
    ({ s, sel }) => document.querySelector(sel)?.textContent?.includes(`state = ${s}`),
    { s: state, sel: liveStripSelector },
    { timeout },
  );
}

/** Fill one gantry profile-editor row's duration and two acceleration fields. */
export async function setGantryPhase(
  page: Page,
  index: number,
  duration_s: number,
  ax_mps2: number,
  ay_mps2: number,
): Promise<void> {
  const row = page.locator('table.profile-table tbody tr[data-id]').nth(index);
  await row.locator('[data-field="duration_s"]').fill(String(duration_s));
  await row.locator('[data-field="ax_mps2"]').fill(String(ax_mps2));
  await row.locator('[data-field="ay_mps2"]').fill(String(ay_mps2));
}

/**
 * An exact dual-axis phase profile that lands the overhead-gantry-demo
 * scenario's claw on target at rest — the same analytic construction as
 * tests/unit/gantry2d-automated.test.ts's buildMergedProfile(), precomputed
 * here so e2e specs don't need to recompute it. See that test file's
 * comments for why each leg is floored to the dt grid with a one-step
 * safety margin (a scripted automated phase has no per-step "already at
 * cruise speed" governor the way the manual controller does).
 */
export const GANTRY_DEMO_MERGED_PROFILE: [number, number, number][] = [
  [1.6916666666666667, 1.2, 1.2],
  [0.3833333333333335, 1.2, -1.2],
  [0.7000000000000002, 0, -1.2],
  [0.608333333333333, -1.2, -1.2],
  [1.4666666666666672, -1.2, 0],
];

export async function fillGantryDemoProfile(page: Page): Promise<void> {
  // The default template has 3 phases; add 2 more to fit the 5-leg profile.
  await page.click('[data-action="add-phase"]');
  await page.click('[data-action="add-phase"]');
  for (let i = 0; i < GANTRY_DEMO_MERGED_PROFILE.length; i++) {
    const [duration_s, ax_mps2, ay_mps2] = GANTRY_DEMO_MERGED_PROFILE[i]!;
    await setGantryPhase(page, i, duration_s, ax_mps2, ay_mps2);
  }
}

/**
 * Read the simulated clock (the `t = ... s` field) straight off the live
 * strip. Used to drive interactions by simulated time rather than
 * wall-clock waits — see `holdDirectionUntilSimTime`.
 */
export async function readSimTime(page: Page, liveStripSelector = '#live-strip'): Promise<number> {
  const text = (await page.locator(liveStripSelector).textContent()) ?? '';
  const match = text.match(/t = ([\d.]+) s/);
  return match ? Number(match[1]) : NaN;
}

/**
 * Hold a direction (keyboard or an on-screen button) until the
 * *simulated* clock reaches `targetSimTime_s`, then release — rather than
 * holding for a fixed wall-clock duration and assuming it corresponds to
 * a similar amount of simulated time. That assumption held on
 * Chromium/Firefox but broke down badly on headless WebKit here: under
 * sustained keyboard-hold interaction specifically, physics advanced at
 * roughly 0.3x real time (vs. ~0.85x for an unattended automated run),
 * so a wall-clock hold computed for exactly the right simulated duration
 * landed at barely a third of the intended distance. Waiting on the
 * simulated clock itself is correct regardless of that ratio.
 */
export async function holdDirectionUntilSimTime(
  page: Page,
  targetSimTime_s: number,
  press: () => Promise<void>,
  release: () => Promise<void>,
  timeout = RUN_STATE_TIMEOUT_MS,
  liveStripSelector = '#live-strip',
): Promise<void> {
  await press();
  await page.waitForFunction(
    ({ t, sel }) => {
      const text = document.querySelector(sel)?.textContent ?? '';
      const match = text.match(/t = ([\d.]+) s/);
      return match !== null && Number(match[1]) >= t;
    },
    { t: targetSimTime_s, sel: liveStripSelector },
    { timeout },
  );
  await release();
}

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}
