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
  await page.goto('/scapegoat-tree/');
  await expect(page.getByRole('heading', { name: 'Scapegoat tree', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('a key that lands too deep finds a scapegoat and rebuilds its subtree', async ({ page }) => {
  await op(page, 'Insert', '50 30 70 20 40 60 80 85 90 95 97');
  await toEnd(page);
  await expect(narration(page)).toContainText('every node is within the depth limit again');
  await expect(stage(page)).toHaveAttribute('aria-label', /90 has left 85 and right 95/);
  // Step back to the moment the scapegoat is found.
  const back = page.getByRole('button', { name: 'Step back' });
  for (let i = 0; i < 3; i++) await back.click();
  await expect(narration(page)).toContainText('85 is the scapegoat');
});

test('enough deletes rebuild the whole tree', async ({ page }) => {
  await op(page, 'Insert', '40 20 60 10 30 50 70');
  await toEnd(page);
  await op(page, 'Delete', '10 20 30');
  await toEnd(page);
  await expect(narration(page)).toContainText('max N = N = 4 again');
});

test('a looser alpha shows in the pseudocode', async ({ page }) => {
  await option(page, 'α = 0.75 (loose: taller trees, fewer rebuilds)');
  await expect(page.locator('.code')).toContainText('log_1/0.75');
});

test('a practice set loads and plays an answer', async ({ page }) => {
  await page.goto('/scapegoat-tree/#practice=1357&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Not quite. The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-rebuild and no sideways scroll (${theme})`, async ({ page }) => {
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
