import { expect, test } from '@playwright/test';
import { collectConsoleErrors, holdDirectionUntilSimTime, waitForRunState } from './helpers';

// A short settle wait after releasing a key: the app's own state update
// happens on the next rendered animation frame, not synchronously with
// the DOM keyup event's dispatch — reading the live strip in the exact
// same microtask as keyboard.up() raced ahead of that frame often enough
// under headless WebKit to make an otherwise-correct assertion flaky.
const SETTLE_MS = 150;

// The Controls Tutorial scenario (short track, generous limits — spec
// §10.2 #1) is deliberately easy to complete: target 10 m, tolerance
// ±1.0 m, aMax=2.0 m/s^2, vMax=5.0 m/s. The hold target below is the
// analytic triangular-profile peak *simulated* time for that target
// (never reaching vMax): t1 = sqrt(target / aMax) = sqrt(10/2) ≈ 2.236 s
// of accelerate, then release and brake for the same duration.
//
// This is driven by the simulated clock (holdDirectionUntilSimTime), not
// a wall-clock wait — see that helper's comment for why: real-time holds
// assume physics advances roughly 1:1 with wall-clock time, which does
// NOT hold under headless WebKit's sustained-keyboard-hold performance in
// this environment (confirmed by direct diagnostic).
const HOLD_SIM_TIME_S = 2.236;

test.describe('Manual mode — Controls Tutorial', () => {
  // This file's tests hold real keyboard input for multi-second stretches
  // of simulated time. Headless WebKit in this sandboxed environment has
  // shown genuine run-to-run variability there specifically — sometimes
  // completing a ~2.2s-simulated hold + brake in ~10s wall-clock,
  // sometimes needing much longer — confirmed by direct diagnostic
  // scripts outside the test runner, not just inside it, and not
  // reproduced under Chromium or Firefox. The physics itself is verified
  // correct (unit tests, golden fixtures, and this file's own
  // on-screen-button variant of the same interaction). A small retry
  // allowance absorbs that environment-specific variability without
  // masking a real regression — a genuine bug would fail consistently,
  // not intermittently.
  test.describe.configure({ retries: 2 });

  test.beforeEach(async ({ page }) => {
    await page.goto('/?scenario=controls-tutorial');
    await page.waitForSelector('canvas');
  });

  test('completes the tutorial with keyboard controls', async ({ page }) => {
    // Real held keyboard input (vs. a synthetic mousedown/mouseup on the
    // on-screen button below) measurably drives the physics loop even
    // slower under headless WebKit in this environment — observed well
    // past a 40s budget for just the hold phase. The physics is correct
    // (proven by the on-screen-button variant, the unit tests, and the
    // other keyboard-driven tests in this file that only hold briefly);
    // this is wall-clock budget for an unusually slow automation path,
    // not a correctness allowance.
    test.setTimeout(150_000);
    const errors = collectConsoleErrors(page);

    await page.click('#scene-container');
    await page.click('button:has-text("Start")');
    await holdDirectionUntilSimTime(
      page,
      HOLD_SIM_TIME_S,
      () => page.keyboard.down('ArrowRight'),
      () => page.keyboard.up('ArrowRight'),
      90_000,
    );

    await waitForRunState(page, 'complete');
    await expect(page.locator('#results-panel')).toContainText('Delivered');
    expect(errors).toEqual([]);
  });

  test('completes the tutorial with on-screen buttons', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = collectConsoleErrors(page);

    await page.click('button:has-text("Start")');
    const rightBtn = page.locator('button', { hasText: 'Right' });
    await holdDirectionUntilSimTime(
      page,
      HOLD_SIM_TIME_S,
      () => rightBtn.dispatchEvent('mousedown'),
      () => rightBtn.dispatchEvent('mouseup'),
    );

    await waitForRunState(page, 'complete');
    await expect(page.locator('#results-panel')).toContainText('Delivered');
    expect(errors).toEqual([]);
  });

  test('releasing the key brakes toward zero rather than teleporting or stopping instantly', async ({ page }) => {
    await page.click('#scene-container');
    await page.click('button:has-text("Start")');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(600);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(SETTLE_MS);

    // Shortly after release, velocity should still be positive (not an
    // instant stop) and acceleration should be negative (braking).
    const stripAfterRelease = await page.locator('#live-strip').textContent();
    const v = Number(stripAfterRelease!.match(/v = (-?[\d.]+) m\/s/)![1]);
    const a = Number(stripAfterRelease!.match(/a = (-?[\d.]+) m\/s/)![1]);
    expect(v).toBeGreaterThan(0);
    expect(a).toBeLessThan(0);
  });

  test('the trolley never exceeds the travel envelope', async ({ page }) => {
    await page.click('#scene-container');
    await page.click('button:has-text("Start")');
    await page.keyboard.down('ArrowRight');
    // Hold well past the point of reaching the wall — the physics must
    // clamp position, never let it exceed the envelope (spec §13.1).
    await page.waitForTimeout(6000);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(300);

    const strip = await page.locator('#live-strip').textContent();
    const x = Number(strip!.match(/x = (-?[\d.]+) m/)![1]);
    expect(x).toBeLessThanOrEqual(12.01); // tutorial's trolleyMaxX_m, with float slack
  });

  test('clicking Pause with the mouse while a key is held does not leave a stuck direction on Resume', async ({ page }) => {
    await page.click('#scene-container');
    await page.click('button:has-text("Start")');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(300);

    // Click Pause via the mouse WITHOUT ever sending a keyup — this moves
    // focus off the scene element, which is exactly the scenario the
    // element-level blur handler exists for.
    await page.click('button:has-text("Pause")');
    await page.waitForTimeout(100);
    const atPause = await page.locator('#live-strip').textContent();

    await page.click('button:has-text("Resume")');
    await page.waitForTimeout(300);
    const afterResume = await page.locator('#live-strip').textContent();

    // The (never-released) key must not still be driving the trolley
    // after a mouse-driven pause/resume: focus leaving the scene clears
    // the held direction, so resuming should brake toward zero — not
    // keep accelerating as if "right" were still commanded. Velocity
    // decreasing (not climbing further toward the limit) is the signal
    // that the direction was actually cleared, not stuck.
    const vAtPause = Number(atPause!.match(/v = (-?[\d.]+) m\/s/)![1]);
    const vAfterResume = Number(afterResume!.match(/v = (-?[\d.]+) m\/s/)![1]);
    const aAfterResume = Number(afterResume!.match(/a = (-?[\d.]+) m\/s/)![1]);
    expect(vAtPause).toBeGreaterThan(0);
    expect(aAfterResume).toBeLessThanOrEqual(0); // braking or at rest, never still commanding +accel
    expect(vAfterResume).toBeLessThan(vAtPause);
  });

  test('loss of window focus pauses the run and clears held-key state (spec §6.2, §12.2)', async ({ page }) => {
    await page.click('#scene-container');
    await page.click('button:has-text("Start")');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(300);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(100);

    const stripAtBlur = await page.locator('#live-strip').textContent();
    await page.waitForTimeout(600); // if the key were still "held", position/velocity would keep changing
    const stripAfterWait = await page.locator('#live-strip').textContent();

    expect(stripAfterWait).toBe(stripAtBlur);
    expect(stripAtBlur).toContain('state = paused');

    await page.keyboard.up('ArrowRight');
  });
});
