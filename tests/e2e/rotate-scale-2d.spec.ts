import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const box = (page: Page) => page.getByLabel('Numbers', { exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/rotate-scale-2d/');
  await expect(page.getByRole('heading', { name: '2D rotation and scale' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('a quarter turn sends (x, y) to (-y, x)', async ({ page }) => {
  await box(page).fill('90');
  await page.getByRole('button', { name: 'Rotate (degrees)', exact: true }).click();
  await expect(stage(page)).toHaveAttribute('aria-label', /vertices: \(-1, 1\), \(-1, 2\)/, {
    timeout: 20_000,
  });
  await expect(page.locator('.vars')).toContainText('det M');
});

test('comparing orders shows that they differ', async ({ page }) => {
  await box(page).fill('90 2 1');
  await page.getByRole('button', { name: 'Compare orders', exact: true }).click();
  await expect(narration(page)).toContainText('not commutative', { timeout: 20_000 });
  await box(page).fill('90 2 2');
  await page.getByRole('button', { name: 'Compare orders', exact: true }).click();
  await expect(narration(page)).toContainText('The two orders give the same shape', {
    timeout: 20_000,
  });
});

test('row vectors write the matrices transposed', async ({ page }) => {
  await page.getByText('Options').click();
  await page.getByLabel("Rows: p' = p M (DirectX)").check();
  await expect(page.locator('.code')).toContainText('R = [cos θ  sin θ; −sin θ  cos θ]');
});

test('a scale that leaves the drawing is refused', async ({ page }) => {
  await box(page).fill('3 3');
  await page.getByRole('button', { name: 'Scale', exact: true }).click();
  await expect(narration(page)).toContainText('off the drawing', { timeout: 10_000 });
});

test('a concept check answers and Show me plays an example', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  const check = page.locator('.check').filter({ hasText: 'Where does (3, 1) go' });
  await check.getByRole('button', { name: '(−1, 3)' }).click();
  await expect(check).toContainText('Yes.');
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('practice questions grade and Show me plays the answer', async ({ page }) => {
  await page.goto('/rotate-scale-2d/#practice=3&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});
