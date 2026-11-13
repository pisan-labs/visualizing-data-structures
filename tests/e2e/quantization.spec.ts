import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const vars = (page: Page) => page.locator('.vars');

const WEIGHTS =
  '0.31 -0.52 0.08 0.77 -0.14 0.45 -0.66 0.23 -0.39 0.12 0.58 -0.27 0.04 -0.81 0.36 -0.09 0.19 0.63 0.49 -0.05 -0.71 0.28 -0.43 0.15';

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Weights, or row column weight').fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function outlier(page: Page) {
  await op(page, 'Load', WEIGHTS);
  await op(page, 'Set one weight', '2 5 6.4');
  await op(page, 'Quantize');
  await toEnd(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('quantization'));
  await expect(page.getByRole('heading', { name: 'Quantization (int8, int4)' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('int8 absmax loses almost nothing', async ({ page }) => {
  await op(page, 'Load', WEIGHTS);
  await op(page, 'Quantize');
  await toEnd(page);
  await expect(narration(page)).toContainText('Total |error| 0.040');
  await expect(vars(page)).toContainText(/max \|error\|\s*=?\s*"?0\.003/);
  await expect(stage(page).locator('text', { hasText: 'codes' })).toBeVisible();
});

test('one outlier ruins a per-tensor int4 scale, and blocks contain it', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('int4', { exact: true }).check();
  await outlier(page);
  await expect(narration(page)).toContainText('16 weights that are not 0 decode to 0');
  await expect(vars(page)).toContainText(/lost to 0\s*=?\s*16/);
  await page.getByLabel('Each block of 3 in a row').check();
  await toEnd(page);
  await expect(vars(page)).toContainText(/lost to 0\s*=?\s*4/);
  await expect(vars(page)).toContainText(/bits per weight\s*=?\s*"?14\.67/);
});

test('quantize asks for weights first, and bad weights are refused', async ({ page }) => {
  await op(page, 'Quantize');
  await expect(narration(page)).toContainText('Load some weights first');
  await op(page, 'Load', '1 2');
  await op(page, 'Set one weight', '9 1 1');
  await expect(narration(page)).toContainText('a row (1 to 4)');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/quantization/#practice=13579&n=5');
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
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations with zero-point blocks (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await page.getByText('Options', { exact: true }).click();
    await page.getByLabel('Zero-point (asymmetric): 0 to 255, a zero point z').check();
    await page.getByLabel('Each block of 3 in a row').check();
    await outlier(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
