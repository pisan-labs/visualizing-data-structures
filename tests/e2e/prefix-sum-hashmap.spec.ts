import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function find(page: Page, k: string) {
  await page.getByLabel('k, or values', { exact: true }).fill(k);
  await page.getByRole('button', { name: 'Find sum k', exact: true }).click();
  await toEnd(page);
}

/** Open Options, pick settings by their radio labels, and close it again. */
async function options(page: Page, ...labels: string[]) {
  const summary = page.locator('summary', { hasText: 'Options' });
  await summary.click();
  for (const l of labels) await page.getByRole('radio', { name: l }).check();
  await summary.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/prefix-sum-hashmap/');
  await expect(page.getByRole('heading', { name: 'Prefix sums with a hash map' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('one pass counts the subarrays with sum k, with the work beside it', async ({ page }) => {
  await find(page, '3');
  await expect(narration(page)).toContainText('4 subarrays sum to 3: A[1], A[0..5], A[1..6]');
  await expect(narration(page)).toContainText('8 sums and 16 lookups');
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*36/);
  await expect(page.locator('.vars')).toContainText(/pattern total\s*=?\s*24/);
  await expect(stage(page)).toHaveAttribute('aria-label', /The map seen holds 0: 1, 2: 2/);
});

test('every pair of ends finds the same subarrays with 36 sums', async ({ page }) => {
  await options(page, 'Every pair of ends, O(n²)');
  await find(page, '3');
  await expect(narration(page)).toContainText('4 subarrays sum to 3');
  await expect(page.locator('.vars')).toContainText(/sums\s*=?\s*36/);
  await expect(page.locator('.code')).toContainText('every pair of ends');
});

test('the longest keeps the first time a running sum appears', async ({ page }) => {
  await options(page, 'The longest subarray with sum k');
  await find(page, '3');
  await expect(narration(page)).toContainText(
    'the longest subarray with sum 3 is A[0..5], length 6',
  );
  await expect(page.locator('.code')).toContainText('first[sum] = j');
});

test('negative values load, and a bad k is refused', async ({ page }) => {
  await page.getByLabel('k, or values', { exact: true }).fill('3 4 -4 2');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await find(page, '5');
  await expect(narration(page)).toContainText('1 subarray sums to 5: A[0..3]');
  await page.getByLabel('k, or values', { exact: true }).fill('5000');
  await page.getByRole('button', { name: 'Find sum k', exact: true }).click();
  await expect(page.getByText('out of range')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/prefix-sum-hashmap/#practice=13579&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const verdict = first.locator('.feedback strong');
  await expect(verdict).toContainText('Not quite. The answer is');
  const answer = ((await verdict.textContent()) ?? '')
    .replace(/^Not quite\. The answer is /, '')
    .replace(/\.$/, '');
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Yes.');
  const show = first.getByRole('button', { name: 'Show me' });
  if (await show.count()) await showMe(page, show);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations on a finished count (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await find(page, '3');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on every pair of ends (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'Every pair of ends, O(n²)', 'The longest subarray with sum k');
    await find(page, '3');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
