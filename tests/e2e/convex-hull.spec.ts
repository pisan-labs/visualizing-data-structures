import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

test.beforeEach(async ({ page }) => {
  await page.goto('/convex-hull/');
  await expect(page.getByRole('heading', { name: 'Convex hull' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

async function load(page: Page, points: string) {
  await page.getByLabel('Points', { exact: true }).fill(points);
  await page.getByRole('button', { name: 'Load points', exact: true }).click();
}

test('Graham scan finds the corners and counts its turn tests', async ({ page }) => {
  await load(page, '1,1 9,1 9,9 1,9 5,5 9,5');
  await expect(stage(page)).toHaveAttribute('aria-label', /6 points/, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Find hull', exact: true }).click();
  await expect(narration(page)).toContainText('The hull has 4 of the 6 points', {
    timeout: 20_000,
  });
  await expect(stage(page)).toHaveAttribute('aria-label', /counter-clockwise: A, B, C, D/);
  await expect(page.locator('.vars')).toContainText('tests');
});

test('the algorithm option changes the pseudocode and the work', async ({ page }) => {
  await page.getByText('Options').click();
  await page.getByLabel('Gift wrapping (Jarvis march)').check();
  await expect(page.locator('.code')).toContainText('GIFT-WRAP(Q)');
  await page.getByLabel("Andrew's monotone chain (sort by x)").check();
  await expect(page.locator('.code')).toContainText('MONOTONE-CHAIN(Q)');
});

test('bad input is explained', async ({ page }) => {
  await load(page, '1,2 30,4');
  await expect(page.getByRole('alert')).toContainText('from 0 to 12');
});

test('the drawing fits and the stack panel is shown', async ({ page }) => {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Repeated points' })
    .getByRole('button', { name: 'Load' })
    .click();
  for (let i = 0; i < 2; i++)
    await page.getByRole('button', { name: 'Forward to the next operation' }).click();
  await expect(narration(page)).toContainText('The hull has 3 of the 7 points');
  await expect
    .poll(async () => {
      const box = await stage(page).boundingBox();
      return box ? box.width > 200 && box.height > 150 : false;
    })
    .toBe(true);
});

test('a concept check answers and Show me plays an example', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  const check = page.locator('.check').filter({ hasText: 'TURN(a, b, c) for a' });
  await check.getByRole('button', { name: '6, a left turn' }).click();
  await expect(check).toContainText('Yes.');
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('practice questions grade and Show me plays the answer', async ({ page }) => {
  await page.goto('/convex-hull/#practice=7&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});
