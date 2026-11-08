import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const form = (page: Page) => page.locator('form.controls');

async function press(page: Page, name: string) {
  await form(page).getByRole('button', { name, exact: true }).click();
}

async function type(page: Page, text: string) {
  await form(page).getByLabel('Numbers or target', { exact: true }).fill(text);
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dp-subset-sum/');
  await expect(page.getByRole('heading', { name: 'Subset sum', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('fills the table and finds 4 + 5 = 9', async ({ page }) => {
  await press(page, 'Trace back');
  await expect(narration(page)).toContainText('Fill the table first.');
  await press(page, 'Fill the table');
  await toEnd(page);
  await expect(narration(page)).toContainText('S[4][9] = T: some of the numbers add up to 9.');
  await expect(page.locator('.vars')).toContainText('cells');
  await press(page, 'Trace back');
  await toEnd(page);
  await expect(narration(page)).toContainText('4 + 5 = 9.');
  await expect(stage(page)).toHaveAttribute('aria-label', /Numbers taken so far: 5, 4\./);
});

test('even numbers cannot make an odd target', async ({ page }) => {
  await type(page, '2 4 6 8');
  await press(page, 'Set numbers');
  await type(page, '7');
  await press(page, 'Target');
  await press(page, 'Fill the table');
  await press(page, 'Trace back');
  await toEnd(page);
  await expect(narration(page)).toContainText('no subset of 2, 4, 6 and 8 adds up to 7');
});

test('refuses a target it cannot draw', async ({ page }) => {
  await type(page, '3 0');
  await press(page, 'Set numbers');
  await expect(page.getByRole('alert')).toContainText('0 is out of range');
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/dp-subset-sum/#practice=777&n=3');
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

test('no axe violations while tracing back (dark)', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
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
