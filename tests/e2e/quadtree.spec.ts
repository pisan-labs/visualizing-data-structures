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

/** Step forward up to n times, stopping at the last step shown at this detail level. */
async function stepForward(page: Page, n: number) {
  const fwd = page.getByRole('button', { name: 'Step forward' });
  for (let i = 0; i < n && !(await fwd.isDisabled()); i++) await fwd.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/quadtree/');
  await expect(page.getByRole('heading', { name: 'Quadtree', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('two close points split the square four times', async ({ page }) => {
  await op(page, 'Insert', '8,8 9,9');
  await toEnd(page);
  await expect(narration(page)).toContainText('2 points in 13 leaves (17 nodes), and height 4');
  await expect(page.locator('.vars')).toContainText(/nodes\s*17/);
});

test('a range query skips squares and reports the points inside', async ({ page }) => {
  await op(page, 'Insert', '3,12 12,13 6,5 13,3 9,9 2,2 14,10 5,14');
  await op(page, 'Range query', '1,1 7,13');
  await toEnd(page);
  await expect(narration(page)).toContainText('Found 3: A, C, F.');
  await expect(narration(page)).toContainText('tested 4 of 8 points');
});

test('a bigger capacity makes a shallower tree', async ({ page }) => {
  await loadExample(page, 'Buckets of three make a shallower tree');
  await toEnd(page);
  await expect(narration(page)).toContainText('8 points in 4 leaves (5 nodes)');
  await expect(page.locator('.code')).toContainText('capacity 3');
});

test('bad input is explained', async ({ page }) => {
  await op(page, 'Insert', '3,16');
  await expect(page.getByRole('alert')).toContainText('from 0 to 15');
});

test('the drawing fits and shows the 4-way tree', async ({ page }) => {
  await loadExample(page, 'Clusters make a lopsided tree');
  await toEnd(page);
  await expect
    .poll(async () => {
      const box = await stage(page).boundingBox();
      return box ? box.width > 200 && box.height > 150 : false;
    })
    .toBe(true);
  await expect(stage(page).locator('text', { hasText: 'children: NW, NE, SW, SE' })).toBeVisible();
});

test('a concept check answers and Show me plays an example', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  const check = page
    .locator('.check')
    .filter({ hasText: 'How many nodes does the tree have now?' });
  await check.getByRole('button', { name: '5', exact: true }).click();
  await expect(check).toContainText('Yes.');
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('practice questions grade and Show me plays the answer', async ({ page }) => {
  await page.goto('/quadtree/#practice=7&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations during a range query (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await loadExample(page, 'A range query skips whole squares');
    await stepForward(page, 28);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
