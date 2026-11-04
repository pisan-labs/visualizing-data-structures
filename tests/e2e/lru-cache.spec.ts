import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Key (and value)').fill(value);
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible())) await page.getByText('More operations').click();
  await button.click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function fill(page: Page) {
  for (const kv of ['1 10', '2 20', '3 30']) {
    await op(page, 'Put', kv);
    await toEnd(page);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/lru-cache/');
  await expect(page.getByRole('heading', { name: 'LRU cache' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('a hit moves the key to the front, one pointer at a time', async ({ page }) => {
  await fill(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /most to least recent: 3=30, 2=20, 1=10/);
  await op(page, 'Get', '1');
  await toEnd(page);
  await expect(narration(page)).toContainText('Return 10');
  await expect(stage(page)).toHaveAttribute('aria-label', /most to least recent: 1=10, 3=30, 2=20/);
  await expect(page.locator('.vars')).toContainText(/hits\s*1/);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('head = x: x is the most recently used');
  await expect(stage(page)).toHaveAttribute('aria-label', /Pointers: x → 1/);
});

test('a put into a full cache evicts the least recently used key', async ({ page }) => {
  await fill(page);
  await op(page, 'Get', '1');
  await toEnd(page);
  await op(page, 'Put', '4 40');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /most to least recent: 4=40, 1=10, 3=30/);
  // Back to the moment the evicted node is unreachable.
  const back = page.getByRole('button', { name: 'Step back' });
  for (let i = 0; i < 5; i++) await back.click();
  await expect(narration(page)).toContainText('Delete 2 from the map');
  await expect(stage(page)).toHaveAttribute('aria-label', /Node 2 is garbage/);
  await op(page, 'Get', '2');
  await toEnd(page);
  await expect(narration(page)).toContainText('this is a miss');
  await expect(page.locator('.vars')).toContainText(/misses\s*1/);
});
