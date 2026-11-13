import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Start at', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** Open Options, pick a radio in each named group, and close it again. */
async function options(page: Page, picks: [group: string, label: string][]) {
  const summary = page.locator('summary', { hasText: 'Options' });
  await summary.click();
  for (const [group, label] of picks)
    await page.getByRole('group', { name: group }).getByLabel(label, { exact: true }).check();
  await summary.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('gradient-descent'));
  await expect(
    page.getByRole('heading', { name: 'Gradient descent (momentum, Adam)' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('a run on x² converges, and a large learning rate diverges', async ({ page }) => {
  await op(page, 'Start', '3');
  await op(page, 'Run 50 steps');
  await toEnd(page);
  await expect(narration(page)).toContainText('Converged after 29 steps');
  await expect(page.locator('.vars')).toContainText(/t\s*29/);
  await options(page, [['Learning rate η', '1.1']]);
  await toEnd(page);
  await expect(narration(page)).toContainText('Diverged after 10 steps');
  await expect(stage(page).locator('text', { hasText: 'off the chart' })).toBeVisible();
});

test('a narrow bowl with Adam, and a start that does not fit', async ({ page }) => {
  await options(page, [
    ['Loss', 'f(x, y) = (x² + 10y²)/2: a long, narrow bowl'],
    ['Method', 'Adam'],
  ]);
  await op(page, 'Start', '-3.5, 1');
  await op(page, 'Step');
  await toEnd(page);
  await expect(narration(page)).toContainText('about η in each coordinate');
  await op(page, 'Start', '2');
  await expect(narration(page)).toContainText('has two variables');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/gradient-descent/#practice=13579&n=5');
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
  test(`no axe violations on a finished run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, [
      ['Loss', 'f(x, y) = (x² + 10y²)/2: a long, narrow bowl'],
      ['Learning rate η', '0.19'],
    ]);
    await op(page, 'Start', '-3.5, 1');
    await op(page, 'Run 50 steps');
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
