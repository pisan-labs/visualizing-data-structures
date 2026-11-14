import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function merge(page: Page) {
  await page.getByRole('button', { name: 'Merge', exact: true }).click();
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
  await page.goto('/k-way-merge/');
  await expect(page.getByRole('heading', { name: 'K-way merge' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('a heap of heads merges the lists, with the cost of each way', async ({ page }) => {
  await merge(page);
  await expect(narration(page)).toContainText('Done: 1 2 3 4 8 9 10 11 12 15');
  await expect(narration(page)).toContainText('17 comparisons; concatenating and sorting takes 26');
  await expect(page.locator('.vars')).toContainText(/pairs total\s*=?\s*14/);
  await expect(stage(page)).toHaveAttribute('aria-label', /Out so far: 1 2 3 4 8 9 10 11 12 15/);
});

test('merging in pairs and sorting everything give the same list', async ({ page }) => {
  await options(page, 'Merge in pairs, round by round, O(n log k)');
  await merge(page);
  await expect(narration(page)).toContainText('Done: 1 2 3 4 8 9 10 11 12 15. 2 rounds');
  await options(page, 'Concatenate and sort, O(n log n)');
  await merge(page);
  await expect(narration(page)).toContainText('26 comparisons');
  await expect(page.locator('.code')).toContainText('A = L1 + L2');
});

test('new lists load, and an unsorted list is refused', async ({ page }) => {
  await page.getByLabel('Sorted lists', { exact: true }).fill('5 9 | 1 2 | 7');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await merge(page);
  await expect(narration(page)).toContainText('Done: 1 2 5 7 9');
  await page.getByLabel('Sorted lists', { exact: true }).fill('9 1 | 2');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('List 1 is not sorted')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/k-way-merge/#practice=13579&n=5');
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
  test(`no axe violations mid-merge (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await merge(page);
    for (let i = 0; i < 10; i++)
      await page.getByRole('button', { name: 'Step back' }).click({ force: true });
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations merging in pairs (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'Merge in pairs, round by round, O(n log k)');
    await merge(page);
    for (let i = 0; i < 5; i++)
      await page.getByRole('button', { name: 'Step back' }).click({ force: true });
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
