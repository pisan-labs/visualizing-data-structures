import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function solve(page: Page) {
  await page.getByRole('button', { name: 'Cheapest total', exact: true }).click();
  await toEnd(page);
}

async function load(page: Page, table: string) {
  await page.getByLabel('Costs (rows by /)', { exact: true }).fill(table);
  await page.getByRole('button', { name: 'Load costs', exact: true }).click();
}

/** Open Options, pick settings by their radio labels, and close it again. */
async function options(page: Page, ...labels: string[]) {
  const summary = page.locator('summary', { hasText: 'Options' });
  await summary.click();
  for (const l of labels) await page.getByRole('radio', { name: l }).check();
  await summary.click();
}

const NAIVE = 'Try every order, O(n · n!)';

test.beforeEach(async ({ page }) => {
  await page.goto('/dp-bitmask/');
  await expect(page.getByRole('heading', { name: 'DP over subsets (bitmask)' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('the DP over masks finds the cheapest assignment in 32 tries', async ({ page }) => {
  await solve(page);
  await expect(narration(page)).toContainText(
    'The cheapest total is 14: A → 1, B → 2, C → 3, D → 0',
  );
  await expect(page.locator('.vars')).toContainText(/tries\s*=?\s*32/);
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*64/);
  await expect(stage(page)).toHaveAttribute('aria-label', /f\[0011\] = 11/);
});

test('trying every order finds the same total with 64 tries', async ({ page }) => {
  await options(page, NAIVE);
  await solve(page);
  await expect(narration(page)).toContainText('Done: 24 orders and 64 tries');
  await expect(narration(page)).toContainText('Mask 1111 alone was reached 24 times');
  await expect(page.locator('.code')).toContainText('assign(w + 1');
});

test('a three-worker table loads, and a ragged one is refused', async ({ page }) => {
  await load(page, '2 6 7 / 3 8 9 / 5 9 4');
  await solve(page);
  await expect(narration(page)).toContainText('The cheapest total is 13: A → 1, B → 0, C → 2');
  await page.getByLabel('Costs (rows by /)', { exact: true }).fill('1 2 / 3');
  await page.getByRole('button', { name: 'Load costs', exact: true }).click();
  await expect(page.getByText('Row 2 has 1 value')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/dp-bitmask/#practice=13579&n=5');
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
  test(`no axe violations on the filled masks (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await solve(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on every order (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, NAIVE);
    await solve(page);
    await page.getByRole('button', { name: 'Step back', exact: true }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
