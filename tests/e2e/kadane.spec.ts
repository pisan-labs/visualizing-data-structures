import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function find(page: Page) {
  await page.getByRole('button', { name: 'Max subarray', exact: true }).click();
  await toEnd(page);
}

async function load(page: Page, values: string) {
  await page.getByLabel('Values', { exact: true }).fill(values);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
}

/** Open Options, pick settings by their radio or checkbox labels, and close it again. */
async function options(page: Page, ...labels: string[]) {
  const summary = page.locator('summary', { hasText: 'Options' });
  await summary.click();
  for (const l of labels) {
    const radio = page.getByRole('radio', { name: l });
    if (await radio.count()) await radio.check();
    else await page.getByRole('checkbox', { name: l }).check();
  }
  await summary.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/kadane/');
  await expect(page.getByRole('heading', { name: "Kadane's maximum subarray" })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('one pass finds the subarray, with the work beside it', async ({ page }) => {
  await find(page);
  await expect(narration(page)).toContainText(
    'the maximum subarray is A[2..5] = 5, −2, −1, 6, with sum 8',
  );
  await expect(narration(page)).toContainText('9 sums and 18 comparisons');
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*90/);
  await expect(page.locator('.vars')).toContainText(/pattern total\s*=?\s*27/);
  await expect(stage(page)).toHaveAttribute('aria-label', /Runs restarted at A\[2\]/);
});

test('every pair of ends finds the same subarray with 45 sums', async ({ page }) => {
  await options(page, 'Every pair of ends, O(n²)');
  await find(page);
  await expect(narration(page)).toContainText('A[2..5] = 5, −2, −1, 6, with sum 8');
  await expect(page.locator('.vars')).toContainText(/sums\s*=?\s*45/);
  await expect(page.locator('.code')).toContainText('every pair of ends');
});

test('all negative: the largest value, or the empty subarray when allowed', async ({ page }) => {
  await load(page, '-3 -1 -4 -2');
  await find(page);
  await expect(narration(page)).toContainText('A[1] = −1, with sum −1');
  await options(page, 'Allow the empty subarray (sum 0)');
  await toEnd(page);
  await expect(narration(page)).toContainText('best = 0, the empty subarray');
  await expect(page.locator('.code')).toContainText('best = 0; lo = 0; hi = −1');
});

test('values out of range are refused', async ({ page }) => {
  await load(page, '1 2 300');
  await expect(page.getByText('out of range')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/kadane/#practice=13579&n=5');
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
  test(`no axe violations on a finished pass (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await find(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on every pair of ends (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'Every pair of ends, O(n²)');
    await find(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
