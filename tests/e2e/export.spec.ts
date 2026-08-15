import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fillTrapezoidalProfile, waitForRunState } from './helpers';

test.describe('CSV and JSON export (spec §9.4)', () => {
  test('exports a CSV with metadata and a full sample table, and a JSON run summary', async ({ page }) => {
    test.setTimeout(60_000); // includes a ~12.7s simulated run (see helpers.ts on headless WebKit timing)
    await page.goto('/');
    await page.waitForSelector('canvas');
    await page.click('input[value="automated"]');
    await fillTrapezoidalProfile(page);
    await page.click('button:has-text("Start")');
    await waitForRunState(page, 'complete');

    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Export CSV")'),
    ]);
    expect(csvDownload.suggestedFilename()).toMatch(/^fragile-freight-transfer_.*\.csv$/);
    const csvPath = await csvDownload.path();
    const csv = await readFile(csvPath!, 'utf8');
    expect(csv).toContain('scenario_id,fragile-freight-transfer');
    expect(csv).toContain('time_s,trolley_x_m,trolley_v_mps');
    expect(csv.split('\n').length).toBeGreaterThan(20); // metadata rows + header + many samples
    // No student-identifying fields unless a student typed one into a note.
    expect(csv.toLowerCase()).not.toContain('studentname');
    expect(csv.toLowerCase()).not.toContain('email');

    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Export run summary")'),
    ]);
    expect(jsonDownload.suggestedFilename()).toMatch(/^fragile-freight-transfer_.*\.summary\.json$/);
    const jsonPath = await jsonDownload.path();
    const jsonText = await readFile(jsonPath!, 'utf8');
    const summary = JSON.parse(jsonText);
    expect(summary.scenarioId).toBe('fragile-freight-transfer');
    expect(summary.scenarioVersion).toBe(1);
    expect(summary.metrics.success).toBe(true);
    expect(Array.isArray(summary.requirementResults)).toBe(true);
    expect(summary.requirementResults.length).toBeGreaterThan(0);
  });
});
