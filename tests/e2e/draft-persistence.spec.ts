import { expect, test } from '@playwright/test';
import { RUN_STATE_TIMEOUT_MS, setPhase } from './helpers';

test.describe('Local draft persistence (spec §12.2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    // Isolate from any run left over by a previous test file sharing storage.
    await page.evaluate(() => localStorage.clear());
  });

  test('restores the draft profile and mode after a reload', async ({ page }) => {
    await page.click('input[value="automated"]');
    await setPhase(page, 0, 3.3, 0.6);
    await setPhase(page, 1, 1.1, 0.0);
    await page.waitForTimeout(150); // autosave fires on orchestrator change, not debounced

    await page.reload();
    await page.waitForSelector('canvas');

    await expect(page.locator('input[value="automated"]')).toBeChecked();
    const row0 = page.locator('table.profile-table tbody tr[data-id]').nth(0);
    await expect(row0.locator('[data-field="duration_s"]')).toHaveValue('3.3');
    await expect(row0.locator('[data-field="trolleyAcceleration_mps2"]')).toHaveValue('0.6');
  });

  test('restores the most recent completed run (results + charts) after a reload', async ({ page }) => {
    test.setTimeout(60_000); // includes a ~12.7s simulated run (see helpers.ts on headless WebKit timing)
    await page.click('input[value="automated"]');
    await setPhase(page, 0, 5.0, 0.8);
    await setPhase(page, 1, 2.5, 0.0);
    await setPhase(page, 2, 5.0, -0.8);
    await page.click('button:has-text("Start")');
    await page.waitForFunction(
      () => document.querySelector('#live-strip')?.textContent?.includes('state = complete'),
      { timeout: RUN_STATE_TIMEOUT_MS },
    );
    await page.waitForTimeout(200);

    await page.reload();
    await page.waitForSelector('canvas');

    await expect(page.locator('#results-panel')).toContainText('Delivered — run complete');
    await expect(page.locator('.chart-panel')).toHaveCount(3);
  });

  test('a corrupted draft payload does not crash the app on load', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('portside-motion-lab:draft:v1:fragile-freight-transfer', 'not valid json {{{');
    });
    await page.reload();
    await page.waitForSelector('canvas');
    // The app should have loaded normally (defaults), not thrown.
    await expect(page.locator('#scenario-title')).toHaveText('Fragile Freight Transfer');
    await expect(page.locator('button:has-text("Start")')).toBeEnabled();
  });
});
