import { expect, test } from '@playwright/test';
import { collectConsoleErrors, fillTrapezoidalProfile, waitForRunState } from './helpers';

test.describe('Automated mode — Fragile Freight Transfer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    await page.click('input[value="automated"]');
  });

  test('builds and runs a three-phase profile to a successful completion', async ({ page }) => {
    test.setTimeout(60_000); // this run simulates ~12.7s and headless WebKit can take a while wall-clock (see helpers.ts)
    const errors = collectConsoleErrors(page);

    await fillTrapezoidalProfile(page);
    await expect(page.locator('.profile-total')).toContainText('12.50 s');

    const startBtn = page.locator('button:has-text("Start")');
    await expect(startBtn).toBeEnabled();
    await startBtn.click();

    await waitForRunState(page, 'complete');

    await expect(page.locator('#results-panel')).toContainText('Delivered — run complete');
    // All six requirements for this scenario should read as satisfied.
    const failMarks = await page.locator('#results-panel .requirement-fail').count();
    expect(failMarks).toBe(0);

    expect(errors).toEqual([]);
  });

  test('a profile that overspeeds fails with a concrete, specific reason', async ({ page }) => {
    // A single overlong acceleration phase — same shape as
    // tests/fixtures/golden-vectors/speed-limit-violation.json.
    const row = page.locator('table.profile-table tbody tr[data-id]').first();
    await row.locator('[data-field="duration_s"]').fill('6');
    await row.locator('[data-field="trolleyAcceleration_mps2"]').fill('0.8');
    // Remove the other two default phases so only the overlong one runs.
    const rows = page.locator('table.profile-table tbody tr[data-id]');
    while ((await rows.count()) > 1) {
      await rows.nth(1).locator('button:has-text("Remove")').click();
    }

    await page.click('button:has-text("Start")');
    await waitForRunState(page, 'failed', 15_000);

    await expect(page.locator('#results-panel')).toContainText('Run failed');
    // A concrete, specific cause — not a collapsed pass/fail score (spec §7.2, §9.3).
    const failedRequirements = page.locator('#results-panel .requirement-fail');
    await expect(failedRequirements).toContainText(['Trolley speed must not exceed the configured maximum.']);
  });
});
