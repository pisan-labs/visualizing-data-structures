import { expect, test } from '@playwright/test';

test('printing gives the concept page without the drawing or controls', async ({ page }) => {
  await page.goto('/stack-array/');
  await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  await expect(page.locator('.stage')).toBeHidden();
  await expect(page.locator('form.controls')).toBeHidden();
  await expect(page.locator('.transport')).toBeHidden();
  await expect(page.locator('header.site')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Print' })).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.learn h2').first()).toBeVisible();
  // Light colors even when the viewer's system is dark.
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(255, 255, 255)');
});
