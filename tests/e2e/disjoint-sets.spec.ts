import { expect, test, type Page } from '@playwright/test';
import { settled } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Element', { exact: true });

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await input(page).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/disjoint-sets/');
  await expect(
    page.getByRole('heading', { name: 'Disjoint sets (union-find)', exact: true }),
  ).toBeVisible();
});

test('union by rank and path compression', async ({ page }) => {
  await fast(page);
  for (const pair of ['0 1', '2 3', '1 3', '4 5', '6 7', '5 7', '3 7'])
    await op(page, 'Union', pair);
  await op(page, 'Find', '0');
  await toEnd(page);
  await expect(narration(page)).toContainText('FIND-SET(0) = 7.');
  await expect(narration(page)).toContainText('0 is now 1 step from the root instead of 3');
  await expect(stage(page)).toHaveAttribute('aria-label', /Parents: 0→7, 1→7, 2→3, 3→7,/);
});

test('naive union with no compression builds a chain', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Naive: first root under the second').check();
  await page.getByLabel('No compression: just walk up').check();
  await page.getByText('Options', { exact: true }).click();
  await fast(page);
  for (let i = 1; i < 8; i++) await op(page, 'Union', `0 ${i}`);
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /Height 7\./);
});

test('elements that are not there are refused', async ({ page }) => {
  await fast(page);
  await op(page, 'Find', '42');
  await toEnd(page);
  await expect(narration(page)).toContainText('42 is not in any set yet');
  await op(page, 'Make set', '42');
  await op(page, 'Find', '42');
  await toEnd(page);
  await expect(narration(page)).toContainText('FIND-SET(42) = 42.');
});

test('the forest and the parent array stay readable', async ({ page }) => {
  await fast(page);
  await op(page, 'Make set', '8 9 10 11 12 13 14 15');
  for (const pair of ['0 1', '2 3', '1 3', '8 9', '9 10', '11 12']) await op(page, 'Union', pair);
  await toEnd(page);
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^\d{1,2}$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await settled(page);
  await expect.poll(async () => (await heights()).length).toBeGreaterThan(40);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(9);
});
