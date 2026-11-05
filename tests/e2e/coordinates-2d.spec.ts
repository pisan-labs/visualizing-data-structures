import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const box = (page: Page) => page.getByLabel('Numbers', { exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/coordinates-2d/');
  await expect(page.getByRole('heading', { name: '2D change of coordinates' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('converts a world point into a turned frame and back', async ({ page }) => {
  await box(page).fill('0');
  await page.getByRole('button', { name: 'Turn axes (degrees)', exact: true }).click();
  await box(page).fill('3 2');
  await page.getByRole('button', { name: 'Move origin', exact: true }).click();
  await box(page).fill('5 4');
  await page.getByRole('button', { name: 'World to B', exact: true }).click();
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /\(5, 4\) in the world and \(2, 2\) in B/,
    {
      timeout: 20_000,
    },
  );
  await box(page).fill('1 -1');
  await page.getByRole('button', { name: 'B to world', exact: true }).click();
  await expect(narration(page)).toContainText('= (4, 1) in world coordinates', {
    timeout: 20_000,
  });
});

test('the 3×3 form changes the pseudocode and the matrix', async ({ page }) => {
  await page.getByText('Options').click();
  await page.getByLabel('One 3×3 matrix on (x, y, 1)').check();
  await page.getByRole('button', { name: 'toLocal', exact: true }).click();
  await expect(page.locator('.code')).toContainText('T⁻¹ = [M⁻¹  −M⁻¹o; 0 0 1]');
});

test('parallel axes are refused with a reason', async ({ page }) => {
  await page.locator('details.more > summary').click();
  await box(page).fill('1 1 2 2');
  await page.getByRole('button', { name: 'Set axes', exact: true }).click();
  await expect(narration(page)).toContainText('det M = u.x·v.y − v.x·u.y = 0', {
    timeout: 10_000,
  });
});

test('a concept check answers and Show me plays an example', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  const check = page.locator('.check').filter({ hasText: 'Is a = u·d the right way' });
  await check.getByRole('button', { name: 'No, the axes are not perpendicular' }).click();
  await expect(check).toContainText('Yes.');
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('practice questions grade and Show me plays the answer', async ({ page }) => {
  await page.goto('/coordinates-2d/#practice=5&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});
