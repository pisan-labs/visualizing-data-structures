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
  await page.goto('/dp-palindrome/');
  await expect(
    page.getByRole('heading', { name: 'Longest palindromic subsequence', exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('fills by length and walks in from both ends', async ({ page }) => {
  await press(page, 'Trace back');
  await expect(narration(page)).toContainText('Fill the table first.');
  await press(page, 'Fill the table');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    "It is also the length of the LCS of 'BBABCBCAB' and its reverse, 'BACBCBABB'.",
  );
  await press(page, 'Trace back');
  await toEnd(page);
  await expect(narration(page)).toContainText("is 'BACBCAB', 7 characters.");
  await expect(stage(page)).toHaveAttribute('aria-label', /Palindrome so far: B A C B C A B\./);
});

test('dropping the right end on ties finds BABCBAB', async ({ page }) => {
  await option(page, 'Drop the right end (move left)');
  await press(page, 'Fill the table');
  await press(page, 'Trace back');
  await toEnd(page);
  await expect(narration(page)).toContainText("is 'BABCBAB', 7 characters.");
});

test('fills one length at a time', async ({ page }) => {
  await form(page).getByLabel('String', { exact: true }).fill('ABA');
  await press(page, 'Load');
  await form(page).locator('details.more > summary').click();
  await press(page, 'Fill one length');
  await toEnd(page);
  await expect(narration(page)).toContainText('the diagonal is all 1s');
  await press(page, 'Fill one length');
  await press(page, 'Fill one length');
  await toEnd(page);
  await expect(narration(page)).toContainText('Length 3 is done.');
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/dp-palindrome/#practice=2718&n=3');
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

test('no axe violations while tracing back (contrast)', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('contrast');
  await press(page, 'Fill the table');
  await press(page, 'Trace back');
  await toEnd(page);
  await page.getByRole('button', { name: 'Step back' }).click();
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});
