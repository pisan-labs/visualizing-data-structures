import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const form = (page: Page) => page.locator('form.controls');

async function press(page: Page, name: string) {
  await form(page).getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function option(page: Page, label: string) {
  const panel = page.locator('details.options');
  if ((await panel.getAttribute('open')) === null) await panel.locator('summary').click();
  await page.getByLabel(label).check();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dp-lis/');
  await expect(
    page.getByRole('heading', { name: 'Longest increasing subsequence', exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('the O(n²) table finds 2, 3, 6, 9', async ({ page }) => {
  await press(page, 'Trace back');
  await expect(narration(page)).toContainText('Fill the table first.');
  await press(page, 'Fill the table');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'has length 4, the largest L. That took 28 comparisons',
  );
  await press(page, 'Trace back');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'A longest increasing subsequence: 2, 3, 6, 9, length 4.',
  );
  await expect(stage(page)).toHaveAttribute('aria-label', /L: 1, 1, 2, 2, 2, 3, 4, 4\./);
});

test('binary search over tails finds 2, 3, 6, 7', async ({ page }) => {
  await option(page, 'O(n log n): binary search over tails (patience sorting)');
  await expect(page.locator('.code')).toContainText('binary search');
  await press(page, 'Fill the table');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /tails: 2, 3, 6 and 7\./);
  await press(page, 'Trace back');
  await toEnd(page);
  await expect(narration(page)).toContainText('2, 3, 6, 7, length 4.');
});

test('refuses a value it cannot draw', async ({ page }) => {
  await form(page).getByLabel('Sequence', { exact: true }).fill('3 100');
  await press(page, 'Set sequence');
  await expect(page.getByRole('alert')).toContainText('100 is too large');
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/dp-lis/#practice=31415&n=3');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\.(\s|$)/)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

test('no axe violations during binary search (dark)', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
  await option(page, 'O(n log n): binary search over tails (patience sorting)');
  await page.getByRole('combobox', { name: 'Detail' }).selectOption({ label: 'Every detail' });
  await press(page, 'Fill the table');
  await toEnd(page);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step back' }).click();
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});
