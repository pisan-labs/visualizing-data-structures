import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const box = (page: Page) => page.getByLabel('Vertices or point', { exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/polygon/');
  await expect(page.getByRole('heading', { name: 'Polygon algorithms' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('the shoelace formula gives the area of an L-shape', async ({ page }) => {
  await box(page).fill('2,2 10,2 10,5 5,5 5,10 2,10');
  await page.getByRole('button', { name: 'Load polygon', exact: true }).click();
  await expect(stage(page)).toHaveAttribute('aria-label', /6 vertices/, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Area', exact: true }).click();
  await expect(narration(page)).toContainText('Area = |78| / 2 = 39', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Convex?', exact: true }).click();
  await expect(narration(page)).toContainText('Not convex', { timeout: 20_000 });
});

test('ray casting counts crossings, and the winding rule can disagree', async ({ page }) => {
  await box(page).fill('6,11 9,2 1,7 11,7 3,2');
  await page.getByRole('button', { name: 'Load polygon', exact: true }).click();
  await expect(narration(page)).toContainText('not a simple polygon', { timeout: 10_000 });
  await box(page).fill('6 6');
  await page.getByRole('button', { name: 'Inside?', exact: true }).click();
  await expect(stage(page)).toHaveAttribute('aria-label', /\(6, 6\) is outside/, {
    timeout: 20_000,
  });
  await page.getByText('Options').click();
  await page.getByLabel('Winding number (nonzero rule)').check();
  await expect(stage(page)).toHaveAttribute('aria-label', /\(6, 6\) is inside/, {
    timeout: 20_000,
  });
  await expect(page.locator('.code')).toContainText('WINDING-NUMBER(P, q)');
});

test('Inside? needs two numbers', async ({ page }) => {
  await box(page).fill('4');
  await page.getByRole('button', { name: 'Inside?', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('x and y');
});

test('a concept check answers and Show me plays an example', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  const check = page.locator('.check').filter({ hasText: 'comes out as' });
  await check
    .getByRole('button', { name: 'The area is 12, and the vertices go clockwise' })
    .click();
  await expect(check).toContainText('Yes.');
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('practice questions grade and Show me plays the answer', async ({ page }) => {
  await page.goto('/polygon/#practice=11&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});
