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
  await page.goto('/hash-buckets/');
  await expect(page.getByRole('heading', { name: 'Hashing with buckets' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('a full bucket spills into the overflow area, and search follows it there', async ({
  page,
}) => {
  await op(page, 'Insert', '10 15 20');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /bucket 0: 10, 15\. Overflow area: 20\./);
  await expect(page.locator('.vars')).toContainText(/overflow\s*1/);
  await op(page, 'Search', '20');
  await toEnd(page);
  await expect(narration(page)).toContainText('Overflow slot 0 holds 20: found it after 3 probes');
  await op(page, 'Search', '8');
  await toEnd(page);
  await expect(narration(page)).toContainText('never had to overflow');
});

test('delete pulls a waiting key back into the bucket', async ({ page }) => {
  await op(page, 'Insert', '10 15 20');
  await toEnd(page);
  await op(page, 'Delete', '10');
  await toEnd(page);
  await expect(narration(page)).toContainText('Move 20 from the overflow area into the free slot');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /bucket 0: 20, 15\. The overflow area is empty/,
  );
});

test('without an overflow area, a full bucket refuses the key', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Report an overflow and refuse the key').check();
  await op(page, 'Insert', '10 15 20');
  await toEnd(page);
  await expect(narration(page)).toContainText('it reports an overflow: 20 is not stored');
  await expect(stage(page)).toHaveAttribute('aria-label', /holding 2 keys/);
});
