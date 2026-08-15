import { expect, test } from '@playwright/test';
import { fillTrapezoidalProfile, waitForRunState } from './helpers';

function readStrip(text: string) {
  return {
    t: Number(text.match(/t = (-?[\d.]+) s/)![1]),
    x: Number(text.match(/x = (-?[\d.]+) m/)![1]),
    v: Number(text.match(/v = (-?[\d.]+) m\/s/)![1]),
  };
}

test.describe('Shared run controls (spec §6.1)', () => {
  test('pause stops the clock, resume continues it, step advances exactly one interval while paused', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    await page.click('#scene-container');
    await page.click('button:has-text("Start")');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(400);

    await page.click('button:has-text("Pause")');
    await page.keyboard.up('ArrowRight');
    // Auto-retrying assertion rather than a one-shot read: the pause
    // takes effect synchronously in the app, but confirming it via an
    // assertion that polls (instead of reading once and hoping) avoids a
    // race against exactly when the click's effects have landed in the
    // DOM, which measurably varies across browsers.
    await expect(page.locator('#live-strip')).toContainText('state = paused');
    const atPause = readStrip((await page.locator('#live-strip').textContent())!);

    // Nothing moves while paused.
    await page.waitForTimeout(400);
    const stillPaused = readStrip((await page.locator('#live-strip').textContent())!);
    expect(stillPaused.t).toBeCloseTo(atPause.t, 2);

    // Step advances by exactly one sample interval (1/30 s).
    await page.click('button:has-text("Step")');
    const afterStep = readStrip((await page.locator('#live-strip').textContent())!);
    expect(afterStep.t - atPause.t).toBeCloseTo(1 / 30, 1);

    // Resume continues the clock.
    await page.click('button:has-text("Resume")');
    await page.waitForTimeout(300);
    const afterResume = readStrip((await page.locator('#live-strip').textContent())!);
    expect(afterResume.t).toBeGreaterThan(afterStep.t);
  });

  test('reset returns to the initial state and asks for confirmation mid-run', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    await page.click('#scene-container');
    await page.click('button:has-text("Start")');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(300);

    let dialogSeen = false;
    page.once('dialog', async (dialog) => {
      dialogSeen = true;
      await dialog.accept();
    });
    await page.click('button:has-text("Reset")');
    await page.waitForTimeout(100);

    expect(dialogSeen).toBe(true);
    const strip = await page.locator('#live-strip').textContent();
    expect(strip).toContain('t = 0.00 s');
    expect(strip).toContain('state = ready');
    await page.keyboard.up('ArrowRight');
  });

  test('replay moves the scene, live strip, and charts to the scrubbed timestamp without rerunning physics', async ({ page }) => {
    test.setTimeout(60_000); // includes a ~12.7s simulated run (see helpers.ts on headless WebKit timing)
    await page.goto('/');
    await page.waitForSelector('canvas');
    await page.click('input[value="automated"]');
    await fillTrapezoidalProfile(page);
    await page.click('button:has-text("Start")');
    await waitForRunState(page, 'complete');

    const finalStrip = (await page.locator('#live-strip').textContent())!;

    const scrubber = page.locator('.replay-scrubber');
    await scrubber.evaluate((el: HTMLInputElement) => {
      el.value = '2';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(150);

    const scrubbedStrip = (await page.locator('#live-strip').textContent())!;
    expect(scrubbedStrip).toContain('t = 2.00 s');
    expect(scrubbedStrip).toContain('(replay)');
    expect(scrubbedStrip).not.toBe(finalStrip);

    // The chart readout should agree with the live strip at the same timestamp.
    const chartReadout = (await page.locator('.chart-readout').first().textContent())!;
    expect(chartReadout).toContain('t = 2.00 s');
  });
});
