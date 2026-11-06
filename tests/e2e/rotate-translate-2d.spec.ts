import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const box = (page: Page) => page.getByLabel('Numbers', { exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/rotate-translate-2d/');
  await expect(page.getByRole('heading', { name: '2D rotation and translation' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('rotate then translate moves the F', async ({ page }) => {
  await box(page).fill('90');
  await page.getByRole('button', { name: 'Rotate (degrees)', exact: true }).click();
  await box(page).fill('4 0');
  await page.getByRole('button', { name: 'Translate', exact: true }).click();
  // A = (1, 1) turns to (-1, 1), then slides to (3, 1).
  await expect(stage(page)).toHaveAttribute('aria-label', /vertices: \(3, 1\)/, {
    timeout: 20_000,
  });
  await expect(page.locator('.vars')).toContainText('angle θ');
});

test('the two orders differ, and agree for a zero slide', async ({ page }) => {
  await box(page).fill('90 4 0');
  await page.getByRole('button', { name: 'Compare orders', exact: true }).click();
  await expect(narration(page)).toContainText('Different places', { timeout: 20_000 });
  await box(page).fill('90 0 0');
  await page.getByRole('button', { name: 'Compare orders', exact: true }).click();
  await expect(narration(page)).toContainText('The two orders agree', { timeout: 20_000 });
});

test('the inverse sends the shape home', async ({ page }) => {
  await box(page).fill('90');
  await page.getByRole('button', { name: 'Rotate (degrees)', exact: true }).click();
  await box(page).fill('3 -2');
  await page.getByRole('button', { name: 'Translate', exact: true }).click();
  await page.getByRole('button', { name: 'Undo all (inverse)', exact: true }).click();
  await expect(stage(page)).toHaveAttribute('aria-label', /vertices: \(1, 1\), \(2, 1\)/, {
    timeout: 20_000,
  });
});

test('the 2×2 form changes the pseudocode', async ({ page }) => {
  await page.getByText('Options').click();
  await page.getByLabel("A 2×2 rotation plus an offset: p' = R p + t").check();
  await page.getByRole('button', { name: 'invert', exact: true }).click();
  await expect(page.locator('.code')).toContainText("p = Rᵀ (p' − t)");
});

test('a concept check answers and Show me plays an example', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  const check = page.locator('.check').filter({ hasText: 'Where does the origin end up' });
  await check.getByRole('button', { name: '(4, 0)' }).click();
  await expect(check).toContainText('Yes.');
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('practice questions grade and Show me plays the answer', async ({ page }) => {
  await page.goto('/rotate-translate-2d/#practice=3&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});
