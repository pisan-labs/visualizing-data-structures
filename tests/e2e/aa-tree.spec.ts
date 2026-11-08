import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Key', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function option(page: Page, label: string) {
  const choice = page.getByLabel(label);
  if (!(await choice.isVisible())) await page.getByText('Options', { exact: true }).click();
  await choice.check();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/aa-tree/');
  await expect(page.getByRole('heading', { name: 'AA tree', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('rising keys split and lift the middle key', async ({ page }) => {
  await op(page, 'Insert', '10 20 30');
  await toEnd(page);
  await expect(narration(page)).toContainText('This insert needed 0 skews and 1 split.');
  await expect(stage(page)).toHaveAttribute('aria-label', /The root is 20, on level 2\./);
  await expect(stage(page).locator('text', { hasText: 'level 2' })).toHaveCount(1);
});

test('a left horizontal link is skewed', async ({ page }) => {
  await op(page, 'Insert', '20 10');
  await toEnd(page);
  await expect(narration(page)).toContainText('This insert needed 1 skew and 0 splits.');
  await expect(stage(page)).toHaveAttribute('aria-label', /The root is 10/);
});

test('a delete lowers levels', async ({ page }) => {
  await op(page, 'Insert', '10 20 30 40 50 60 70');
  await toEnd(page);
  await op(page, 'Delete', '10');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /The root is 40, on level 2\./);
});

test('the red-black drawing colors horizontal children red', async ({ page }) => {
  await option(page, 'As a red-black tree: horizontal children are red');
  await op(page, 'Insert', '10 20');
  await toEnd(page);
  await expect(stage(page).locator('circle.rb-red')).toHaveCount(1);
});

test('a practice set loads and plays an answer', async ({ page }) => {
  await page.goto('/aa-tree/#practice=1357&n=4');
  await expect(page.locator('.question')).toHaveCount(4);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Not quite. The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-split and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Insert', '10 20 30 40 50');
    await toEnd(page);
    await page.getByRole('button', { name: 'Step back' }).click();
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
