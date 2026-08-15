import { expect, test } from '@playwright/test';

test.describe('Automated profile editor validation (spec §6.3)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    await page.click('input[value="automated"]');
  });

  test('an invalid profile shows line-specific errors and disables Start', async ({ page }) => {
    const row = page.locator('table.profile-table tbody tr[data-id]').first();
    await row.locator('[data-field="duration_s"]').fill('-2');
    await row.locator('[data-field="trolleyAcceleration_mps2"]').fill('5');

    await expect(page.locator('button:has-text("Start")')).toBeDisabled();
    const errors = page.locator('tr.row-errors').first();
    await expect(errors).toContainText('Duration must be a positive number');
    await expect(errors).toContainText('exceeds the scenario limit');
  });

  test('a blank/non-numeric field is rejected, not silently coerced to zero', async ({ page }) => {
    const row = page.locator('table.profile-table tbody tr[data-id]').first();
    await row.locator('[data-field="duration_s"]').fill('');

    await expect(page.locator('button:has-text("Start")')).toBeDisabled();
    await expect(page.locator('tr.row-errors').first()).toContainText('Duration must be a positive number');
  });

  test('fixing the error re-enables Start without a page reload', async ({ page }) => {
    const row = page.locator('table.profile-table tbody tr[data-id]').first();
    await row.locator('[data-field="duration_s"]').fill('-2');
    await expect(page.locator('button:has-text("Start")')).toBeDisabled();

    await row.locator('[data-field="duration_s"]').fill('5');
    await expect(page.locator('button:has-text("Start")')).toBeEnabled();
  });

  test('typing into a field keeps keyboard focus across re-renders', async ({ page }) => {
    const nameInput = page.locator('table.profile-table tbody tr[data-id]').first().locator('[data-field="name"]');
    await nameInput.click();
    await nameInput.press('End');
    await page.keyboard.type('XYZ', { delay: 50 });

    await expect(nameInput).toBeFocused();
    await expect(nameInput).toHaveValue(/XYZ$/);
  });

  test('add/duplicate/reorder/remove phase controls work', async ({ page }) => {
    const rows = page.locator('table.profile-table tbody tr[data-id]');
    const initialCount = await rows.count();

    await page.click('button:has-text("+ Add phase")');
    await expect(rows).toHaveCount(initialCount + 1);

    await rows.first().locator('button:has-text("Duplicate")').click();
    await expect(rows).toHaveCount(initialCount + 2);

    await rows.last().locator('button:has-text("Remove")').click();
    await expect(rows).toHaveCount(initialCount + 1);
  });
});
