import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Value', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/cartesian-tree/');
  await expect(page.getByRole('heading', { name: 'Cartesian tree', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('a new minimum pops the whole right spine and becomes the root', async ({ page }) => {
  await op(page, 'Append', '3 5 7 9 1');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'This append popped 4 nodes; 4 pops in all for 5 values.',
  );
  await expect(stage(page)).toHaveAttribute('aria-label', /The root is 1\./);
});

test('a range minimum walks down to the common ancestor', async ({ page }) => {
  await op(page, 'Append', '7 3 9 5 8 2 6 4');
  await toEnd(page);
  await op(page, 'Range minimum', '2 4');
  await toEnd(page);
  await expect(narration(page)).toContainText('the minimum: 5');
  await op(page, 'Range minimum', '3 7');
  await toEnd(page);
  await expect(narration(page)).toContainText('the minimum: 2');
});

test('bad input is refused with a reason', async ({ page }) => {
  await op(page, 'Append', '5 2');
  await toEnd(page);
  await op(page, 'Range minimum', '0 9');
  await toEnd(page);
  await expect(narration(page)).toContainText('Indexes run from 0 to 1');
});

test('a practice set loads and plays an answer', async ({ page }) => {
  await page.goto('/cartesian-tree/#practice=1357&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Not quite. The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-build and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Append', '5 2 8 6 9 1');
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
