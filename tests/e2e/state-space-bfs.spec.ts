import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const input = (page: Page) => page.getByLabel('Goal, or a list', { exact: true });

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
  await page.goto('/state-space-bfs/');
  await expect(page.getByRole('heading', { name: 'BFS over states' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('BFS goes round the barred combinations to the goal', async ({ page }) => {
  await run(page, 'Search', '02');
  await expect(narration(page)).toContainText('02 is 4 moves from 00: 00 → 90 → 91 → 92 → 02');
  await expect(narration(page)).toContainText('17 states off the queue');
  await expect(page.locator('.vars')).toContainText(/pattern total\s*=?\s*82/);
  await expect(page.locator('.stage > svg')).toHaveAttribute(
    'aria-label',
    /Path: 00, 90, 91, 92, 02/,
  );
});

test('with no visited set every sequence goes in the queue', async ({ page }) => {
  await options(page, 'No visited set: every sequence of moves, O(bᵈ)');
  await run(page, 'Search', '02');
  await expect(narration(page)).toContainText('34 sequences left the queue');
  await expect(page.locator('.code')).toContainText('no visited set');
});

test('words change one letter at a time', async ({ page }) => {
  await options(page, 'Words: change one letter at a time');
  await run(page, 'Search', 'warm');
  await expect(narration(page)).toContainText('cold → cord → word → ward → warm');
  await expect(page.locator('.code')).toContainText('each letter c');
});

test('barred combinations load, and a bad goal is refused', async ({ page }) => {
  await run(page, 'Load', '01 10 09 90');
  await run(page, 'Search', '55');
  await expect(narration(page)).toContainText('55 cannot be reached');
  await input(page).fill('123');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('The lock has 2 wheels')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/state-space-bfs/#practice=13579&n=5');
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
    await run(page, 'Search', '02');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on words with no visited set (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(
      page,
      'No visited set: every sequence of moves, O(bᵈ)',
      'Words: change one letter at a time',
    );
    await run(page, 'Search', 'warm');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
