import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Key', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (await next.isEnabled()) await next.click();
}

async function seven(page: Page) {
  await fast(page);
  await op(page, 'Insert', '50 30 70 20 40 60 80');
  await toEnd(page);
  await expect(narration(page)).toContainText('N = 7, height = 2');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/bst/');
  await expect(page.getByRole('heading', { name: 'Binary search tree' })).toBeVisible();
});

test('inserts keys one comparison at a time', async ({ page }) => {
  await seven(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /7 keys and height 2\. The root is 50\./);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('80 > 70, so go right');
  await expect(page.locator('.code li.active').first()).toContainText('while x ≠ nil');
});

test('delete with two children moves the successor into place', async ({ page }) => {
  await seven(page);
  await op(page, 'Delete', '50');
  await toEnd(page);
  await expect(narration(page)).toContainText('50 is gone and every key is still in order');
  await expect(stage(page)).toHaveAttribute('aria-label', /The root is 60\./);
  await page.getByRole('button', { name: 'Back to the previous operation' }).click();
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Replace it with its predecessor').check();
  await expect(page.getByRole('button', { name: 'delete', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'delete', exact: true }).click();
  await expect(page.locator('.code')).toContainText('y = max(z.left)');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /The root is 40\./);
});

test('a search that misses says where the key would go', async ({ page }) => {
  await seven(page);
  await op(page, 'Search', '45');
  await toEnd(page);
  await expect(narration(page)).toContainText('45 is not in the tree');
  await expect(page.locator('.vars')).toContainText(/found\s*false/);
  await expect(stage(page).locator('text', { hasText: 'nil' })).toBeVisible();
});

test('select and rank show subtree sizes', async ({ page }) => {
  await seven(page);
  await op(page, 'Select k-th', '3');
  await expect(stage(page).locator('text', { hasText: 'subtree sizes' })).toBeVisible();
  await toEnd(page);
  await expect(narration(page)).toContainText('select(3) = 40');
  await op(page, 'Rank', '60');
  await toEnd(page);
  await expect(narration(page)).toContainText('rank(60) = 4 + 1 = 5');
});

test('key-value mode updates values and search returns them', async ({ page }) => {
  await fast(page);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Key-value pairs (a map): insert 42=apple').check();
  await op(page, 'Insert', '42=apple 17=fig 42=pear');
  await toEnd(page);
  await expect(narration(page)).toContainText('changes from apple to pear');
  await op(page, 'Search', '42');
  await toEnd(page);
  await expect(page.locator('.vars')).toContainText(/returned\s*"pear"/);
});

test('bad keys are refused with a reason', async ({ page }) => {
  await op(page, 'Insert', 'cat');
  await expect(page.getByRole('alert')).toContainText('Keys are whole numbers');
  await op(page, 'Insert', '5000');
  await expect(page.getByRole('alert')).toContainText('between -99 and 999');
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Delete a leaf' }).first().click();
  await expect(page.getByText('Loaded "Delete a leaf"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Show me' }).first().click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(page).toHaveURL(/\/bst\//);
  await expect(narration(page)).toContainText(/found it|search\(/);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-delete and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await seven(page);
    await op(page, 'Delete', '30');
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
