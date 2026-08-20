import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  collectConsoleErrors,
  fillGantryDemoProfile,
  RUN_STATE_TIMEOUT_MS,
  waitForRunState,
} from './helpers';

test.describe('Overhead Gantry (2D) — page load and navigation', () => {
  test('loads with a rendered scene and links back to the 1D lab', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/gantry.html');
    await page.waitForSelector('canvas');

    await expect(page.locator('#gantry-title')).toHaveText('Overhead Gantry — Prize Retrieval');
    await expect(page.locator('#gantry-brief')).not.toBeEmpty();
    await expect(page.locator('#gantry-link')).toHaveAttribute('href', 'index.html');

    await page.click('#gantry-link');
    await page.waitForSelector('canvas');
    await expect(page).toHaveURL(/index\.html|\/$/);
    expect(errors).toEqual([]);
  });
});

test.describe('Overhead Gantry (2D) — manual mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/gantry.html');
    await page.waitForSelector('canvas');
  });

  test('moves both axes at once when two directions are held (claw-machine diagonal)', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.click('#gantry-scene-container');
    await page.click('button:has-text("Start")');
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(600);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(150);

    const strip = await page.locator('#gantry-live-strip').textContent();
    const x = Number(strip!.match(/x = (-?[\d.]+) m/)![1]);
    const y = Number(strip!.match(/y = (-?[\d.]+) m/)![1]);
    expect(x).toBeGreaterThan(1); // scenario initialX_m = 1
    expect(y).toBeGreaterThan(1); // scenario initialY_m = 1
    expect(errors).toEqual([]);
  });

  test('never exceeds the playfield envelope on either axis', async ({ page }) => {
    await page.click('#gantry-scene-container');
    await page.click('button:has-text("Start")');
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(6000); // well past reaching either wall
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(200);

    const strip = await page.locator('#gantry-live-strip').textContent();
    const x = Number(strip!.match(/x = (-?[\d.]+) m/)![1]);
    const y = Number(strip!.match(/y = (-?[\d.]+) m/)![1]);
    expect(x).toBeLessThanOrEqual(10.01); // scenario maxX_m, with float slack
    expect(y).toBeLessThanOrEqual(6.01); // scenario maxY_m, with float slack
  });

  test('switching to automated mode hides manual controls and shows the profile editor', async ({ page }) => {
    await page.click('input[value="automated"]');
    await expect(page.locator('#gantry-manual-controls')).toBeHidden();
    await expect(page.locator('#gantry-profile-editor')).toBeVisible();

    await page.click('input[value="manual"]');
    await expect(page.locator('#gantry-manual-controls')).toBeVisible();
    await expect(page.locator('#gantry-profile-editor')).toBeHidden();
  });
});

test.describe('Overhead Gantry (2D) — automated mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/gantry.html');
    await page.waitForSelector('canvas');
    await page.click('input[value="automated"]');
  });

  test('runs a dual-axis phase profile to a successful completion, with per-requirement results and charts', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = collectConsoleErrors(page);

    await fillGantryDemoProfile(page);
    const startBtn = page.locator('button:has-text("Start")');
    await expect(startBtn).toBeEnabled();
    await startBtn.click();

    await waitForRunState(page, 'complete', RUN_STATE_TIMEOUT_MS, '#gantry-live-strip');

    await expect(page.locator('#gantry-results')).toContainText('Delivered — run complete');
    const failMarks = await page.locator('#gantry-results .requirement-fail').count();
    expect(failMarks).toBe(0);

    // Four aligned panels: x(t), y(t), vx(t), vy(t) — not the 1D lab's three.
    await expect(page.locator('#gantry-analysis-view .chart-panel')).toHaveCount(4);

    expect(errors).toEqual([]);
  });

  test('a profile that overspeeds fails with a concrete, specific reason (not a collapsed score)', async ({ page }) => {
    test.setTimeout(30_000);
    // One overlong X-accelerate phase; remove the other default phases so
    // only this one runs, well past the point of exceeding max speed.
    const row = page.locator('table.profile-table tbody tr[data-id]').first();
    await row.locator('[data-field="duration_s"]').fill('6');
    await row.locator('[data-field="ax_mps2"]').fill('1.2');
    await row.locator('[data-field="ay_mps2"]').fill('0');
    const rows = page.locator('table.profile-table tbody tr[data-id]');
    while ((await rows.count()) > 1) {
      await rows.nth(1).locator('button:has-text("Remove")').click();
    }

    await page.click('button:has-text("Start")');
    await waitForRunState(page, 'failed', RUN_STATE_TIMEOUT_MS, '#gantry-live-strip');

    await expect(page.locator('#gantry-results')).toContainText('Run failed');
    const failedRequirements = page.locator('#gantry-results .requirement-fail');
    await expect(failedRequirements).toContainText(['Neither axis may exceed the configured maximum speed.']);
  });

  test('exports a CSV with metadata and a full sample table, and a JSON run summary', async ({ page }) => {
    test.setTimeout(60_000);
    await fillGantryDemoProfile(page);
    await page.click('button:has-text("Start")');
    await waitForRunState(page, 'complete', RUN_STATE_TIMEOUT_MS, '#gantry-live-strip');

    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Export CSV")'),
    ]);
    expect(csvDownload.suggestedFilename()).toMatch(/^overhead-gantry-demo_.*\.csv$/);
    const csv = await readFile((await csvDownload.path())!, 'utf8');
    expect(csv).toContain('scenario_id,overhead-gantry-demo');
    expect(csv).toContain('time_s,x_m,vx_mps');
    expect(csv.split('\n').length).toBeGreaterThan(10);

    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Export run summary")'),
    ]);
    expect(jsonDownload.suggestedFilename()).toMatch(/^overhead-gantry-demo_.*\.summary\.json$/);
    const jsonText = await readFile((await jsonDownload.path())!, 'utf8');
    const summary = JSON.parse(jsonText);
    expect(summary.scenarioId).toBe('overhead-gantry-demo');
    expect(summary.metrics.success).toBe(true);
    expect(summary.requirementResults.length).toBeGreaterThan(0);
  });
});

test.describe('Overhead Gantry (2D) — local draft persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/gantry.html');
    await page.waitForSelector('canvas');
    await page.evaluate(() => localStorage.clear());
  });

  test('restores the draft profile and mode after a reload, scoped separately from the 1D lab', async ({ page }) => {
    await page.click('input[value="automated"]');
    const row0 = page.locator('table.profile-table tbody tr[data-id]').nth(0);
    await row0.locator('[data-field="duration_s"]').fill('2.2');
    await row0.locator('[data-field="ax_mps2"]').fill('0.5');
    await row0.locator('[data-field="ay_mps2"]').fill('-0.3');
    await page.waitForTimeout(150); // autosave fires on orchestrator change, not debounced

    await page.reload();
    await page.waitForSelector('canvas');

    await expect(page.locator('input[value="automated"]')).toBeChecked();
    const restoredRow0 = page.locator('table.profile-table tbody tr[data-id]').nth(0);
    await expect(restoredRow0.locator('[data-field="duration_s"]')).toHaveValue('2.2');
    await expect(restoredRow0.locator('[data-field="ax_mps2"]')).toHaveValue('0.5');
    await expect(restoredRow0.locator('[data-field="ay_mps2"]')).toHaveValue('-0.3');

    // The gantry lab's own localStorage keys never collide with the 1D lab's.
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.every((k) => k.startsWith('portside-motion-lab-gantry:'))).toBe(true);
  });

  test('a corrupted draft payload does not crash the app on load', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('portside-motion-lab-gantry:draft:v1:overhead-gantry-demo', 'not valid json {{{');
    });
    await page.reload();
    await page.waitForSelector('canvas');
    await expect(page.locator('#gantry-title')).toHaveText('Overhead Gantry — Prize Retrieval');
    await expect(page.locator('button:has-text("Start")')).toBeEnabled();
  });
});
