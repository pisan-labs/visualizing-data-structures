import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function partition(page: Page, p: string) {
  await page.getByLabel('Pivot, or values', { exact: true }).fill(p);
  await page.getByRole('button', { name: 'Partition', exact: true }).click();
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
  await page.goto('/dutch-flag/');
  await expect(
    page.getByRole('heading', { name: 'Dutch national flag (three-way partition)' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('three pointers partition in one pass, with the work beside it', async ({ page }) => {
  await partition(page, '5');
  await expect(narration(page)).toContainText('A[0..2] < 5, A[3..5] = 5 and A[6..8] > 5');
  await expect(narration(page)).toContainText('9 comparisons, 3 swaps');
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*36/);
  await expect(page.locator('.vars')).toContainText(/pattern total\s*=?\s*12/);
  await expect(stage(page)).toHaveAttribute('aria-label', /3, 2, 1, 5, 5, 5, 8, 9, 7/);
});

test('counting then rewriting keeps each kind in order, with n extra slots', async ({ page }) => {
  await options(page, 'Count, then rewrite: two passes and a copy');
  await partition(page, '5');
  await expect(narration(page)).toContainText('18 comparisons, no swaps and 18 writes');
  await expect(stage(page)).toHaveAttribute('aria-label', /2, 1, 3, 5, 5, 5, 7, 9, 8/);
  await expect(page.locator('.code')).toContainText('countThenRewrite');
});

test('new values load, and a bad pivot is refused', async ({ page }) => {
  await page.getByLabel('Pivot, or values', { exact: true }).fill('2 0 1 2 1 0');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await partition(page, '1');
  await expect(narration(page)).toContainText('A[0..1] < 1, A[2..3] = 1 and A[4..5] > 1');
  await page.getByLabel('Pivot, or values', { exact: true }).fill('500');
  await page.getByRole('button', { name: 'Partition', exact: true }).click();
  await expect(page.getByText('out of range')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/dutch-flag/#practice=13579&n=5');
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
  test(`no axe violations on a finished partition (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await partition(page, '5');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on counting then rewriting, as cells (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'Count, then rewrite: two passes and a copy', 'Cells (boxes with numbers)');
    await partition(page, '5');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
