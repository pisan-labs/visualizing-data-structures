import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const input = (page: Page) => page.getByLabel('Target, or candidates', { exact: true });

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function run(page: Page, op: string, value: string) {
  await input(page).fill(value);
  await page.getByRole('button', { name: op, exact: true }).click();
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
  await page.goto('/combination-sum/');
  await expect(page.getByRole('heading', { name: 'Combination sum (backtracking)' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('sorted backtracking lists every combination and prunes', async ({ page }) => {
  await run(page, 'Search', '10');
  await expect(narration(page)).toContainText(
    '3 combinations make 10: [3, 3, 4], [3, 7] and [5, 5]',
  );
  await expect(narration(page)).toContainText('14 calls, 9 branches pruned');
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*125/);
  await expect(page.locator('.stage > svg')).toHaveAttribute('aria-label', /Found: \[3, 3, 4\]/);
});

test('every list finds the same combinations with many more calls', async ({ page }) => {
  await options(page, 'Every list, then check its sum');
  await run(page, 'Search', '10');
  await expect(narration(page)).toContainText('Building every list took 125 calls');
  await expect(page.locator('.code')).toContainText('every count of each');
});

test('used once, repeated values are tried once per depth', async ({ page }) => {
  await options(page, 'Can be used once');
  await run(page, 'Load', '1 2 1 3 2');
  await run(page, 'Search', '4');
  await expect(narration(page)).toContainText('[1, 1, 2], [1, 3] and [2, 2]');
  await expect(narration(page)).toContainText('4 repeats skipped');
  await expect(page.locator('.code')).toContainText('c[i] == c[i − 1]');
});

test('a target out of range is refused', async ({ page }) => {
  await input(page).fill('31');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('Use a target from 1 to 30')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/combination-sum/#practice=13579&n=5');
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
  test(`no axe violations on a finished search (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await run(page, 'Search', '10');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on every subset, used once (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'Every list, then check its sum', 'Can be used once');
    await run(page, 'Search', '10');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
