import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Row', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
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
  await page.goto('/dp-interval/');
  await expect(page.getByRole('heading', { name: 'DP over intervals' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('the table by length finds the best order to take the tiles', async ({ page }) => {
  await op(page, 'Solve');
  await expect(narration(page)).toContainText('The best total for all 4 tiles is 169');
  await expect(page.locator('.vars')).toContainText(/choices\s*=?\s*20/);
  await op(page, 'Trace the order');
  await expect(narration(page)).toContainText('takes the tiles 3, 2, 4, 1');
  await expect(stage(page)).toHaveAttribute('aria-label', /Tiles left: none/);
});

test('merging piles: the cheapest split, as brackets', async ({ page }) => {
  await options(page, 'Merge neighbouring piles at the least cost');
  await op(page, 'Load', '8 6 7 5 3');
  await op(page, 'Solve');
  await op(page, 'Trace the order');
  await expect(narration(page)).toContainText('((8 6) (7 (5 3)))');
  await expect(page.locator('.code')).toContainText('merge [a..k] with [k + 1..b]');
});

test('plain recursion solves short stretches again and again', async ({ page }) => {
  await options(page, 'Plain recursion, O(3ⁿ)');
  await op(page, 'Solve');
  await expect(narration(page)).toContainText('27 calls');
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*67/);
});

test('a row loads, and a bad one is refused', async ({ page }) => {
  await op(page, 'Load', '2 3');
  await op(page, 'Solve');
  await expect(narration(page)).toContainText('is 9');
  await page.getByLabel('Row', { exact: true }).fill('1 2 3 4 5 6 7');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('Use at most 6')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/dp-interval/#practice=13579&n=5');
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
  test(`no axe violations on a traced order (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Solve');
    await op(page, 'Trace the order');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on plain recursion merging (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'Plain recursion, O(3ⁿ)', 'Merge neighbouring piles at the least cost');
    await op(page, 'Solve');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
