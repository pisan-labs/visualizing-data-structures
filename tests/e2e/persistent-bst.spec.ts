import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

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

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('persistent-bst'));
  await expect(page.getByRole('heading', { name: 'Persistent BST', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('each insert makes a version that copies one path', async ({ page }) => {
  await op(page, 'Insert', '50 30 70 20');
  await toEnd(page);
  await expect(narration(page)).toContainText('Version v4 = insert(20) on v3');
  await expect(narration(page)).toContainText('3 are new and 1 shared');
  await expect(stage(page).locator('text', { hasText: /^v\d$/ })).toHaveCount(5);
});

test('an old version still answers after a delete', async ({ page }) => {
  await op(page, 'Insert', '50 30 70');
  await toEnd(page);
  await op(page, 'Delete', '30');
  await toEnd(page);
  await op(page, 'View version', '3');
  await toEnd(page);
  await expect(narration(page)).toContainText('Viewing v3');
  await op(page, 'Search', '30');
  await toEnd(page);
  await expect(narration(page)).toContainText('found 30');
  await expect(stage(page)).toHaveAttribute('aria-label', /v4 \(delete\(30\) on v3\): 50 70\./);
});

test('a practice set loads and plays an answer', async ({ page }) => {
  await page.goto('/persistent-bst/#practice=1357&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Not quite. The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-copy and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Insert', '50 30 70 20');
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
