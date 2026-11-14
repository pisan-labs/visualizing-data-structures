import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const input = (page: Page) => page.getByLabel('d or k, or values', { exact: true });

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
  await page.goto('/binary-search-answer/');
  await expect(page.getByRole('heading', { name: 'Binary search on the answer' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('binary search finds the smallest capacity, with the work beside it', async ({ page }) => {
  await run(page, 'Search', '3');
  await expect(narration(page)).toContainText('The smallest capacity that ships in 3 days is 14');
  await expect(narration(page)).toContainText('5 checks and 40 reads');
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*56/);
  await expect(page.locator('.vars')).toContainText(/pattern total\s*=?\s*45/);
  await expect(page.locator('.stage > svg')).toHaveAttribute('aria-label', /Answer: 14/);
});

test('trying every capacity upward finds the same answer with more checks', async ({ page }) => {
  await options(page, 'Every answer upward, O(n · range)');
  await run(page, 'Search', '3');
  await expect(narration(page)).toContainText('7 checks and 49 reads');
  await expect(page.locator('.code')).toContainText('every capacity upward');
});

test('the largest gap rounds mid up', async ({ page }) => {
  await options(page, 'Largest gap between k items');
  await run(page, 'Search', '3');
  await expect(narration(page)).toContainText('The largest gap 3 items can keep is 11');
  await expect(page.locator('.code')).toContainText('spreads(p, k, g)');
});

test('new packages load, and a bad d is refused', async ({ page }) => {
  await run(page, 'Load', '5 5 5 5 5 5');
  await run(page, 'Search', '2');
  await expect(narration(page)).toContainText('ships in 2 days is 15');
  await input(page).fill('13');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('out of range')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/binary-search-answer/#practice=13579&n=5');
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
    await run(page, 'Search', '3');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations trying every gap upward (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'Every answer upward, O(n · range)', 'Largest gap between k items');
    await run(page, 'Search', '3');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
