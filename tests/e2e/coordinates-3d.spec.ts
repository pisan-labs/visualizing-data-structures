import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const box = (page: Page) => page.getByLabel('Numbers', { exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/coordinates-3d/');
  await expect(page.getByRole('heading', { name: '3D change of coordinates' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('converts a world point into a moved frame and back', async ({ page }) => {
  await box(page).fill('0 0');
  await page.getByRole('button', { name: 'Turn axes (degrees)', exact: true }).click();
  await box(page).fill('1 2 1');
  await page.getByRole('button', { name: 'Move origin', exact: true }).click();
  await box(page).fill('3 3 3');
  await page.getByRole('button', { name: 'World to B', exact: true }).click();
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /\(3, 3, 3\) in the world and \(2, 1, 2\) in B/,
    { timeout: 20_000 },
  );
  await box(page).fill('1 -1 0');
  await page.getByRole('button', { name: 'B to world', exact: true }).click();
  await expect(narration(page)).toContainText('= (2, 1, 1) in world coordinates', {
    timeout: 20_000,
  });
});

test('a turned frame uses the transpose', async ({ page }) => {
  await box(page).fill('3 2 1');
  await page.getByRole('button', { name: 'World to B', exact: true }).click();
  await expect(page.locator('.vars')).toContainText('M⁻¹ = Mᵀ', { timeout: 20_000 });
});

test('the 4×4 form changes the pseudocode', async ({ page }) => {
  await page.getByText('Options').click();
  await page.getByLabel('One 4×4 matrix on (x, y, z, 1)').check();
  await page.getByRole('button', { name: 'toLocal', exact: true }).click();
  await expect(page.locator('.code')).toContainText('T⁻¹ = [M⁻¹  −M⁻¹o; 0 0 0 1]');
});

test('axes in one plane are refused with a reason', async ({ page }) => {
  await page.locator('details.more > summary').click();
  await box(page).fill('1 0 0 0 1 0 1 1 0');
  await page.getByRole('button', { name: 'Set axes', exact: true }).click();
  await expect(narration(page)).toContainText('det M = u · (v × w) = 0', { timeout: 10_000 });
});

test('the drawing fits on the page', async ({ page }) => {
  await expect
    .poll(async () => {
      const b = await stage(page).boundingBox();
      return b ? b.width > 200 && b.height > 200 : false;
    })
    .toBe(true);
});

test('a concept check answers and Show me plays an example', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  const check = page.locator('.check').filter({ hasText: 'Can you find a with a = u · d' });
  await check.getByRole('button', { name: 'No, u and v are not perpendicular' }).click();
  await expect(check).toContainText('Yes.');
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('practice questions grade and Show me plays the answer', async ({ page }) => {
  await page.goto('/coordinates-3d/#practice=5&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});
