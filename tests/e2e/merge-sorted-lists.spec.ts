import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function build(page: Page, lists: string) {
  await page.getByLabel('Sorted lists', { exact: true }).fill(lists);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await toEnd(page);
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

const NAIVE = 'Copy to an array, sort, rebuild';

test.beforeEach(async ({ page }) => {
  await page.goto('/merge-sorted-lists/');
  await expect(page.getByRole('heading', { name: 'Merge sorted lists' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('the dummy head merges two lists by relinking, with the work beside it', async ({ page }) => {
  await merge(page);
  await expect(narration(page)).toContainText(
    'head → 1 → 2 → 3 → 4 → 7 → 8 → 9 → null. 6 comparisons and 7 links',
  );
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*47/);
  await expect(page.locator('.vars')).toContainText(/pattern total\s*=?\s*13/);
  await expect(stage(page)).toHaveAttribute('aria-label', /Out: 1, 2, 3, 4, 7, 8, 9/);
});

test('copying to an array and sorting gives the same list with more work', async ({ page }) => {
  await options(page, NAIVE);
  await merge(page);
  await expect(narration(page)).toContainText('13 comparisons, 7 links and 27 copies');
  await expect(page.locator('.code')).toContainText('copy, sort, rebuild');
});

test('four lists in pairs take fewer comparisons than one at a time', async ({ page }) => {
  await build(page, '1 5 9 | 2 6 10 | 3 7 | 4 8');
  await merge(page);
  await expect(narration(page)).toContainText('16 comparisons');
  await options(page, 'One at a time, O(N k)');
  await build(page, '1 5 9 | 2 6 10 | 3 7 | 4 8');
  await merge(page);
  await expect(narration(page)).toContainText('19 comparisons');
});

test('an unsorted list is refused', async ({ page }) => {
  await page.getByLabel('Sorted lists', { exact: true }).fill('1 5 3 | 2');
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.getByText('is not sorted')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/merge-sorted-lists/#practice=13579&n=5');
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
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on copy and sort (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, NAIVE);
    await merge(page);
    for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
