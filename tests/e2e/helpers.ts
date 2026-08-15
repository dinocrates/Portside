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

export async function waitForRunState(page: Page, state: string, timeout = RUN_STATE_TIMEOUT_MS): Promise<void> {
  await page.waitForFunction(
    (s) => document.querySelector('#live-strip')?.textContent?.includes(`state = ${s}`),
    state,
    { timeout },
  );
}

/**
 * Read the simulated clock (the `t = ... s` field) straight off the live
 * strip. Used to drive interactions by simulated time rather than
 * wall-clock waits — see `holdDirectionUntilSimTime`.
 */
export async function readSimTime(page: Page): Promise<number> {
  const text = (await page.locator('#live-strip').textContent()) ?? '';
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
): Promise<void> {
  await press();
  await page.waitForFunction(
    (t) => {
      const text = document.querySelector('#live-strip')?.textContent ?? '';
      const match = text.match(/t = ([\d.]+) s/);
      return match !== null && Number(match[1]) >= t;
    },
    targetSimTime_s,
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
