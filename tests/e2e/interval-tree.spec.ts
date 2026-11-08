import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Interval', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

const TREE = '16-22 8-10 25-30 5-9 12-15 20-27 28-29 1-4';

test.beforeEach(async ({ page }) => {
  await page.goto('/interval-tree/');
  await expect(page.getByRole('heading', { name: 'Interval tree', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('insert keeps max and the search follows it to an overlap', async ({ page }) => {
  await op(page, 'Insert', TREE);
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /The root is \[16, 22\]\./);
  await expect(stage(page)).toHaveAttribute('aria-label', /\[16, 22\] \(max 30\)/);
  await op(page, 'Find an overlap', '11-14');
  await toEnd(page);
  await expect(narration(page)).toContainText('[12, 15] overlaps [11, 14]');
});

test('all overlaps skips subtrees that cannot hold one', async ({ page }) => {
  await op(page, 'Insert', TREE);
  await toEnd(page);
  await op(page, 'Find all overlaps', '9-21');
  await toEnd(page);
  await expect(narration(page)).toContainText('5 intervals overlap [9, 21]');
  await expect(narration(page)).toContainText('skipped 2 subtrees');
});

test('a bad interval is refused with a reason', async ({ page }) => {
  await op(page, 'Insert', '30-20');
  await expect(page.getByRole('alert')).toContainText('The low end comes first');
});

test('a practice set loads and plays an answer', async ({ page }) => {
  await page.goto('/interval-tree/#practice=1357&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Not quite. The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-search and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Insert', TREE);
    await toEnd(page);
    await op(page, 'Find all overlaps', '9-21');
    await toEnd(page);
    await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
