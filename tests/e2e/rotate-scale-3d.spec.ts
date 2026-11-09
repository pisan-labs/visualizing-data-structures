import { expect, test, type Page } from '@playwright/test';
import { opButton, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const box = (page: Page) => page.getByLabel('Numbers', { exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/rotate-scale-3d/');
  await expect(page.getByRole('heading', { name: '3D rotation and scale' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('a quarter turn about z sends (x, y, z) to (-y, x, z)', async ({ page }) => {
  await box(page).fill('90');
  await page.getByRole('button', { name: 'Rotate about z', exact: true }).click();
  await expect(stage(page)).toHaveAttribute('aria-label', /vertices: \(0, 0, 0\), \(0, 2, 0\)/, {
    timeout: 20_000,
  });
  await expect(page.locator('.vars')).toContainText('det M');
});

test('rotations about x and y do not commute', async ({ page }) => {
  await box(page).fill('90');
  await (await opButton(page, 'Compare orders (x, y)')).click();
  await expect(narration(page)).toContainText('Different shapes', { timeout: 20_000 });
  await box(page).fill('180');
  await (await opButton(page, 'Compare orders (x, y)')).click();
  await expect(narration(page)).toContainText('half turns', { timeout: 20_000 });
});

test('the cube is drawn, and the oblique view keeps it on screen', async ({ page }) => {
  // The axis names and the label of vertex A.
  await expect
    .poll(() =>
      stage(page)
        .locator('text', { hasText: /^[xyzA]$/ })
        .count(),
    )
    .toBeGreaterThanOrEqual(4);
  await page.getByText('Options').click();
  await page.getByLabel('An oblique view (x right, z up, y into the page)').check();
  await expect(stage(page).locator('text', { hasText: 'oblique view' })).toHaveCount(1);
  await expect
    .poll(async () => {
      const b = await stage(page).boundingBox();
      return b ? b.width > 100 && b.height > 100 : false;
    })
    .toBe(true);
});

test('a scale that leaves the drawing is refused', async ({ page }) => {
  await box(page).fill('3 3 3');
  await page.getByRole('button', { name: 'Scale', exact: true }).click();
  await expect(narration(page)).toContainText('off the drawing', { timeout: 10_000 });
});

test('a concept check answers and Show me plays an example', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  const check = page.locator('.check').filter({ hasText: 'Where does (2, 0, 2) go' });
  await check.getByRole('button', { name: '(0, 2, 2)' }).click();
  await expect(check).toContainText('Yes.');
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('practice questions grade and Show me plays the answer', async ({ page }) => {
  await page.goto('/rotate-scale-3d/#practice=3&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});
