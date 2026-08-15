import { expect, test } from '@playwright/test';
import { collectConsoleErrors } from './helpers';

// Spec §5.5 / §13.5: minimum supported viewport is 1024x700; the
// interface must also remain usable at 200% browser zoom. Actual browser
// zoom isn't controllable identically across Chromium/Firefox/WebKit from
// Playwright, so 200% zoom is emulated the way it actually behaves — it
// halves the effective CSS viewport — by testing at half the minimum
// supported size and confirming the app still loads and the primary
// control is still reachable (scrolling to it is fine; broken/hidden is not).

test.describe('Responsive layout and zoom (spec §5.5, §13.5)', () => {
  test('is usable at the minimum supported viewport (1024x700)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 700 });
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await page.waitForSelector('canvas');

    await expect(page.locator('button:has-text("Start")')).toBeVisible();
    await expect(page.locator('#scene-container')).toBeVisible();

    // No horizontal scroll on the page body itself.
    const overflowsX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflowsX).toBe(false);
    expect(errors).toEqual([]);
  });

  test('remains operable at an effective 200% zoom (half the minimum viewport)', async ({ page }) => {
    await page.setViewportSize({ width: 512, height: 350 });
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await page.waitForSelector('canvas');

    // The control must still be reachable (scrolled into view) and clickable.
    const startBtn = page.locator('button:has-text("Start")');
    await startBtn.scrollIntoViewIfNeeded();
    await expect(startBtn).toBeVisible();
    await startBtn.click();
    await expect(startBtn).toBeDisabled(); // Start becomes disabled once a run is underway — proves the click landed

    expect(errors).toEqual([]);
  });
});
