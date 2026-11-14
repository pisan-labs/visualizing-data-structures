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
  await page.getByRole('button', { name: 'Best total', exact: true }).click();
  await toEnd(page);
}

async function build(page: Page, list: string) {
  await page.getByLabel('Tree (level order)', { exact: true }).fill(list);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
}

/** Open Options, pick settings by their radio labels, and close it again. */
async function options(page: Page, ...labels: string[]) {
  const summary = page.locator('summary', { hasText: 'Options' });
  await summary.click();
  for (const l of labels) await page.getByRole('radio', { name: l }).check();
  await summary.click();
}

const NAIVE = 'Try every allowed subset, exponential';

test.beforeEach(async ({ page }) => {
  await page.goto('/dp-tree/');
  await expect(page.getByRole('heading', { name: 'DP on trees' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('two values per node find the best total in one call per node', async ({ page }) => {
  await solve(page);
  await expect(narration(page)).toContainText('the best total is max(18, 19) = 19');
  await expect(narration(page)).toContainText('B, F and G (9 + 6 + 4 = 19)');
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*97/);
  await expect(page.locator('.vars')).toContainText(/pattern total\s*=?\s*7/);
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /A = 4, children B and C, take 18, skip 19/,
  );
});

test('trying every allowed subset finds the same total with 97 calls', async ({ page }) => {
  await options(page, NAIVE);
  await solve(page);
  await expect(narration(page)).toContainText('97 calls tried 41 subsets');
  await expect(narration(page)).toContainText('The best total is 19');
  await expect(page.locator('.code')).toContainText('tryAll');
});

test('a chain builds, and a bad tree is refused', async ({ page }) => {
  await build(page, '5 1 _ 1 _ 5');
  await solve(page);
  await expect(narration(page)).toContainText('A and D (5 + 5 = 10)');
  await page.getByLabel('Tree (level order)', { exact: true }).fill('3 100');
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.getByText('100 is out of range')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/dp-tree/#practice=13579&n=5');
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
  test(`no axe violations on the finished values (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await solve(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on every allowed subset (${theme})`, async ({ page }) => {
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
