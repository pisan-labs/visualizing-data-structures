import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function top(page: Page, k: string) {
  await page.getByLabel('k, or values', { exact: true }).fill(k);
  await page.getByRole('button', { name: 'Top k', exact: true }).click();
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
  await page.goto('/top-k/');
  await expect(page.getByRole('heading', { name: 'Top k elements' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('a min-heap of size k finds the k largest, with the cost of each way', async ({ page }) => {
  await top(page, '3');
  await expect(narration(page)).toContainText('the 3 largest are 21, 18 and 14');
  await expect(narration(page)).toContainText('16 comparisons; sorting everything takes 24');
  await expect(page.locator('.vars')).toContainText(/quickselect total\s*=?\s*23/);
  await expect(stage(page)).toHaveAttribute('aria-label', /min-heap holds 14, 21, 18/);
});

test('sorting everything and quickselect find the same values', async ({ page }) => {
  await options(page, 'Sort everything, O(n log n)');
  await top(page, '3');
  await expect(narration(page)).toContainText('the 3 largest are 21, 18 and 14');
  await expect(page.locator('.vars')).toContainText(/comparisons\s*=?\s*24/);
  await options(page, 'Quickselect, O(n) on average');
  await top(page, '3');
  await expect(narration(page)).toContainText('23 comparisons');
  await expect(page.locator('.code')).toContainText('swap A[q], A[r]');
});

test('the k-th largest is the root, and a bad k is refused', async ({ page }) => {
  await options(page, 'The k-th largest value');
  await top(page, '4');
  await expect(narration(page)).toContainText('the 4th largest is 12');
  await page.getByLabel('k, or values', { exact: true }).fill('9');
  await page.getByRole('button', { name: 'Top k', exact: true }).click();
  await expect(narration(page)).toContainText('At most 7');
});

test('new values load, and out-of-range values are refused', async ({ page }) => {
  await page.getByLabel('k, or values', { exact: true }).fill('4 40 8 30');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await top(page, '2');
  await expect(narration(page)).toContainText('the 2 largest are 40 and 30');
  await page.getByLabel('k, or values', { exact: true }).fill('4 400');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('out of range')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/top-k/#practice=13579&n=5');
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
  test(`no axe violations on a finished heap run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await top(page, '3');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations mid-quickselect (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'Quickselect, O(n) on average');
    await top(page, '3');
    for (let i = 0; i < 6; i++)
      await page.getByRole('button', { name: 'Step back' }).click({ force: true });
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
