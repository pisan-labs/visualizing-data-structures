import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const vars = (page: Page) => page.locator('.vars');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Sentence', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('flash-attention'));
  await expect(
    page.getByRole('heading', { name: 'FlashAttention (online softmax)' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('all tiles give plain attention’s answer with less traffic', async ({ page }) => {
  await op(page, 'Load', 'the cat sat on the mat');
  await op(page, 'All tiles');
  await toEnd(page);
  await expect(narration(page)).toContainText('O is what plain attention gives');
  await expect(vars(page)).toContainText(/HBM total\s*=?\s*168/);
  await expect(vars(page)).toContainText(/plain total\s*=?\s*192/);
  await expect(stage(page).getByText('Kᵀ', { exact: true })).toBeVisible();
});

test('next tile runs one tile, and Q blocks outside move less', async ({ page }) => {
  await op(page, 'Load', 'the cat sat on the mat');
  await op(page, 'Next tile');
  await toEnd(page);
  await expect(vars(page)).toContainText(/tiles\s*=?\s*"?1 of 6/);
  await page.getByText('Options', { exact: true }).click();
  await page.getByRole('radio', { name: 'Q blocks (FlashAttention-2, 2023)' }).check();
  await op(page, 'All tiles');
  await toEnd(page);
  await expect(vars(page)).toContainText(/HBM total\s*=?\s*72/);
});

test('plain attention writes the table, and a bad sentence is refused', async ({ page }) => {
  await op(page, 'Plain attention');
  await toEnd(page);
  await expect(vars(page)).toContainText(/S, P moved\s*=?\s*144/);
  await op(page, 'Load', 'the elephant');
  await expect(page.getByText('six at most')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/flash-attention/#practice=13579&n=5');
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
  test(`no axe violations with a tile on chip (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Load', 'the cat sat on the mat');
    await op(page, 'Next tile');
    await op(page, 'Next tile');
    await toEnd(page);
    await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
