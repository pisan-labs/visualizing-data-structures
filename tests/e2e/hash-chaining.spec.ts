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

async function options(page: Page) {
  if ((await page.locator('details.options').getAttribute('open')) === null)
    await page.getByText('Options', { exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/hash-chaining/');
  await expect(page.getByRole('heading', { name: 'Separate chaining' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('colliding keys share a chain, newest first, with the hash spelled out', async ({ page }) => {
  await op(page, 'Insert', '10 17 24');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /bucket 3: 24 → 17 → 10/);
  await expect(page.locator('.vars')).toContainText(/longest\s*3/);
  await op(page, 'Search', '10');
  await toEnd(page);
  await expect(narration(page)).toContainText('found it in bucket 3 after 3 comparisons');
  // Step back to the first step of the search: the hash with real numbers.
  await page.getByRole('button', { name: 'Back to the previous operation' }).click();
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(narration(page)).toContainText('h(10) = 10 mod 7 = 3');
});

test('a word key needs a string hash', async ({ page }) => {
  await op(page, 'Insert', 'cat');
  await expect(narration(page)).toContainText('not a whole number', { timeout: 10_000 });
  await options(page);
  await page.getByLabel('Strings: sum of the character codes, mod m').check();
  await expect(narration(page)).toContainText('h("cat") adds the character codes');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /bucket 4: cat/);
});

test('in key-value mode, inserting a key again replaces its value', async ({ page }) => {
  await options(page);
  await page.getByLabel('Key-value pairs (a map): insert cat=3').check();
  await page.getByLabel('Strings: polynomial in the character codes (base 31), mod m').check();
  await op(page, 'Insert', 'cat=3 cat=4');
  await toEnd(page);
  await expect(narration(page)).toContainText('Its value changes from 3 to 4');
  await expect(stage(page)).toHaveAttribute('aria-label', /cat=4/);
  await op(page, 'Search', 'cat');
  await toEnd(page);
  await expect(page.locator('.vars')).toContainText(/returned\s*"4"/);
});

test('the colliding preset fills one bucket for the current table size', async ({ page }) => {
  await options(page);
  const m = page.getByLabel('Table size m (number of buckets)');
  await m.fill('11');
  await m.press('Tab');
  await page.locator('#preset').selectOption({ label: 'All colliding keys' });
  await page.locator('#preset-size').selectOption('8');
  await page.getByRole('button', { name: 'Fill', exact: true }).click();
  await expect(page.locator('.vars')).toContainText(/longest\s*8/);
  await expect(page.locator('.vars')).toContainText(/m\s*11/);
});

test('delete unlinks a node from the middle of a chain', async ({ page }) => {
  await op(page, 'Insert', '3 10 17');
  await toEnd(page);
  await op(page, 'Delete', '10');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /bucket 3: 17 → 3/);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('prev.next = x.next');
  await expect(stage(page)).toHaveAttribute('aria-label', /being unlinked/);
});
