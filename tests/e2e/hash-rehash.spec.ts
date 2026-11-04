import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Key', { exact: true }).fill(value);
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible())) await page.getByText('More operations').click();
  await button.click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/hash-rehash/');
  await expect(page.getByRole('heading', { name: 'Rehashing and load factor' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('the insert that passes the threshold grows the table and moves every key', async ({
  page,
}) => {
  await op(page, 'Insert', '12 7 19 3');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /^Table with 11 slots and 4 keys/);
  await expect(page.locator('.vars')).toContainText(/cost\s*4/);
  await expect(narration(page)).toContainText('This insert cost 4: 3 moves and 1 store');
  // Back into the rehash: both tables are drawn, and keys move one at a time.
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Move 19 from slot 4');
  await expect(stage(page)).toHaveAttribute('aria-label', /^Rehashing\./);
  await expect(stage(page).locator('text', { hasText: "T': the new table, m = 11" })).toBeVisible();
});

test('the amortized counter stays near 2', async ({ page }) => {
  await op(page, 'Insert', '1 2 3 4 5 6 7 8 9 10');
  await toEnd(page);
  await expect(page.locator('.vars')).toContainText(/total\s*21/);
  await expect(page.locator('.vars')).toContainText(/amortized\s*2\.1/);
});

test('a lower threshold grows sooner', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('0.5', { exact: true }).check();
  await op(page, 'Insert', '1 2 3');
  await toEnd(page);
  // The third key already grows the table: 3/5 = 0.6 would pass 0.5.
  await expect(narration(page)).toContainText('This insert cost 3: 2 moves and 1 store');
  await expect(page.locator('.vars')).toContainText(/m\s*11/);
});
