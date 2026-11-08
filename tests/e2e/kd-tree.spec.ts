import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Points', { exact: true }).fill(value);
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible())) await page.getByText('More operations').click();
  await button.click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function loadExample(page: Page, title: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Load' })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/kd-tree/');
  await expect(page.getByRole('heading', { name: 'k-d tree' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('insert alternates x and y, and nearest prunes a subtree', async ({ page }) => {
  await op(page, 'Insert', '6,5 3,8 9,2 2,3 8,9 4,1 10,6 1,10');
  await toEnd(page);
  await expect(narration(page)).toContainText('The tree has 8 points and height 3');
  await expect(stage(page)).toHaveAttribute('aria-label', /A\(6, 5\) splits on x/);
  await op(page, 'Nearest', '10,3');
  await toEnd(page);
  await expect(narration(page)).toContainText('The nearest point to (10, 3) is C(9, 2)');
  await expect(narration(page)).toContainText('skipped 1 subtree');
  await expect(page.locator('.vars')).toContainText(/visited\s*4/);
});

test('range search reports the points in the rectangle', async ({ page }) => {
  await op(page, 'Insert', '6,5 3,8 9,2 2,3 8,9 4,1 10,6 1,10');
  await op(page, 'Range search', '2,2 7,9');
  await toEnd(page);
  await expect(narration(page)).toContainText('Found 3: A, B, D.');
});

test('turning pruning off visits every node', async ({ page }) => {
  await loadExample(page, 'The same search without pruning');
  await toEnd(page);
  await expect(narration(page)).toContainText('visited 8 of 8 nodes');
  await expect(page.locator('.code')).toContainText('always (pruning is off)');
});

test('bad input is explained', async ({ page }) => {
  await op(page, 'Insert', '6,5');
  await op(page, 'Nearest', '1,2 3,4');
  await toEnd(page);
  await expect(narration(page)).toContainText('Type one point');
});

test('the drawing fits with the tree beside or under the plane', async ({ page }) => {
  await loadExample(page, 'Points on a diagonal make a path');
  await toEnd(page);
  await expect
    .poll(async () => {
      const box = await stage(page).boundingBox();
      return box ? box.width > 200 && box.height > 150 : false;
    })
    .toBe(true);
  await expect(stage(page).locator('circle').first()).toBeVisible();
});

test('a concept check answers and Show me plays an example', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  const check = page.locator('.check').filter({ hasText: 'Where does (4, 9) go?' });
  await check.getByRole('button', { name: 'Right child of (3, 8)' }).click();
  await expect(check).toContainText('Yes.');
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('practice questions grade and Show me plays the answer', async ({ page }) => {
  await page.goto('/kd-tree/#practice=7&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations during a nearest search (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await loadExample(page, 'Nearest neighbour skips whole subtrees');
    for (let i = 0; i < 30; i++) await page.getByRole('button', { name: 'Step forward' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
