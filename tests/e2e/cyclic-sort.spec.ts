import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function sortScan(page: Page) {
  await page.getByRole('button', { name: 'Sort, then scan', exact: true }).click();
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
  await page.goto('/cyclic-sort/');
  await expect(page.getByRole('heading', { name: 'Cyclic sort' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('cyclic sort puts every value home, and the scan finds what is missing', async ({ page }) => {
  await sortScan(page);
  await expect(narration(page)).toContainText('Missing: 5. Repeated: 4.');
  await expect(narration(page)).toContainText('21 comparisons and 5 swaps');
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*42/);
  await expect(page.locator('.vars')).toContainText(/pattern total\s*=?\s*26/);
  await expect(stage(page)).toHaveAttribute('aria-label', /1, 2, 3, 4, 4, 6, 7, 8/);
});

test('selection sort and a scan by value find the same answer with more work', async ({ page }) => {
  await options(page, 'Selection sort, then scan, O(n²)');
  await sortScan(page);
  await expect(narration(page)).toContainText('Missing: 5. Repeated: 4.');
  await expect(narration(page)).toContainText('36 comparisons and 6 swaps');
  await expect(page.locator('.code')).toContainText('sortThenScan');
});

test('values load, and values outside 1 to n are refused', async ({ page }) => {
  await page.getByLabel('Values, each from 1 to n', { exact: true }).fill('2 3 4 1');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await sortScan(page);
  await expect(narration(page)).toContainText('Nothing is missing');
  await expect(page.locator('.vars')).toContainText(/swaps\s*=?\s*3/);
  await page.getByLabel('Values, each from 1 to n', { exact: true }).fill('1 2 5');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('out of range')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/cyclic-sort/#practice=13579&n=5');
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
  test(`no axe violations on a finished scan (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await sortScan(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on selection sort, as cells (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'Selection sort, then scan, O(n²)', 'Cells (boxes with numbers)');
    await sortScan(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
