import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, button: string, text?: string) {
  if (text !== undefined) await page.getByLabel('Value or index').fill(text);
  await page.getByRole('button', { name: button, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/linked-list/');
  await expect(page.getByRole('heading', { name: 'Singly linked list' })).toBeVisible();
  await fast(page);
});

test('builds a list and draws head, tail and null', async ({ page }) => {
  await op(page, 'Insert at tail', '10 20 30');
  await expect(narration(page)).toContainText('30 is at the end', { timeout: 10_000 });
  await expect(stage(page)).toHaveAttribute('aria-label', /head → 10 → 20 → 30 → null\. tail → 30/);
  await expect(page.locator('.vars')).toContainText(/n\s*3$/);
});

test('insert at an index reads the index and the value', async ({ page }) => {
  await op(page, 'Insert at tail', '10 30');
  await expect(narration(page)).toContainText('30 is at the end', { timeout: 10_000 });
  await op(page, 'Insert at (i, x)', '5');
  await expect(page.getByRole('alert')).toContainText('needs an index and a value');
  await op(page, 'Insert at (i, x)', '1 20');
  await expect(narration(page)).toContainText('20 is at index 1', { timeout: 10_000 });
  await expect(stage(page)).toHaveAttribute('aria-label', /head → 10 → 20 → 30 → null/);
});

test('reverse moves prev, cur and next step by step', async ({ page }) => {
  await op(page, 'Insert at tail', '1 2 3');
  await expect(narration(page)).toContainText('3 is at the end', { timeout: 10_000 });
  await op(page, 'Reverse');
  await expect(narration(page)).toContainText('Redrawn from head', { timeout: 15_000 });
  await expect(stage(page)).toHaveAttribute('aria-label', /head → 3 → 2 → 1 → null/);
  // Step back into the loop: the pointers are drawn and named.
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step back' }).click();
  await expect(stage(page)).toHaveAttribute('aria-label', /Pointers: prev → .*cur → /);
  await expect(page.locator('.code li.active')).toBeVisible();
});

test('without a tail pointer, insert at tail walks the list', async ({ page }) => {
  await page.getByText('Options').click();
  await page.getByLabel('head only').check();
  await op(page, 'Insert at tail', '1 2 3');
  await expect(narration(page)).toContainText('3 is at the end', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Step back' }).click();
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText(/took 1 hop/);
});

test('a curated example loads from the Examples tab', async ({ page }) => {
  await page.getByRole('tab', { name: 'Examples' }).click();
  const card = page.locator('li', { hasText: 'Reverse a list in place' });
  await card.getByRole('button', { name: 'Load' }).click();
  await expect(stage(page)).toHaveAttribute('aria-label', /head → 10 → 20 → 30 → 40 → null/);
});
