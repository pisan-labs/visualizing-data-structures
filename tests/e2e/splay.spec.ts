import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Key', { exact: true }).fill(value);
  const button = page.getByRole('button', { name, exact: true });
  // Less common operations sit under "More operations".
  if (!(await button.isVisible())) await page.getByText('More operations').click();
  await button.click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/splay/');
  await expect(page.getByRole('heading', { name: 'Splay tree', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('a search splays its key to the root with zig-zig steps', async ({ page }) => {
  await op(page, 'Insert', '30 20 10');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /The root is 10\./);
  await op(page, 'Search', '30');
  await toEnd(page);
  await expect(narration(page)).toContainText('30 is at the root now');
  await expect(stage(page)).toHaveAttribute('aria-label', /The root is 30\./);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Then rotate left at 20');
  await page.getByRole('button', { name: 'Step back' }).click();
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Zig-zig: 30 is the right child of 20');
  await expect(stage(page).locator('text', { hasText: 'Zig-zig' })).toBeVisible();
});

test('repeated searches make a chain shallow', async ({ page }) => {
  await op(page, 'Insert', '10 20 30 40 50 60 70 80');
  await toEnd(page);
  await expect(page.locator('.vars')).toContainText(/height\s*7/);
  await op(page, 'Search', '10 20 30 40');
  await toEnd(page);
  await expect(page.locator('.vars')).toContainText(/height\s*3/);
});

test('a search that misses splays the last node visited', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'A search that misses still splays' }).first().click();
  await toEnd(page);
  await expect(narration(page)).toContainText('45 is not in the tree, and 50 is at the root now');
});

test('the delete option switches to deleting as in a BST', async ({ page }) => {
  await op(page, 'Insert', '50 30 70 20 40 60 80');
  await toEnd(page);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Delete as in a BST, then splay the parent of the removed node').check();
  await expect(page.locator('.code')).toBeVisible();
  await op(page, 'Delete', '50');
  await toEnd(page);
  await expect(narration(page)).toContainText('40 is at the root');
  await page.getByRole('button', { name: 'delete', exact: true }).click();
  await expect(page.locator('.code')).toContainText('p = bstDelete(z)');
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-splay and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Insert', '10 20 30 40 50 60');
    await toEnd(page);
    await op(page, 'Search', '10');
    await toEnd(page);
    await page.getByRole('button', { name: 'Step back' }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
