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
  await page.goto('/dp-rod-cutting/');
  await expect(page.getByRole('heading', { name: 'Rod cutting', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('fills the table and cuts the rod of 8 into 2 and 6', async ({ page }) => {
  await press(page, 'Cut the rod');
  await expect(narration(page)).toContainText('Fill the table first.');
  await press(page, 'Fill the table');
  await toEnd(page);
  await expect(narration(page)).toContainText('r[8] = 22: the most a rod of length 8 can earn.');
  await press(page, 'Cut the rod');
  await toEnd(page);
  await expect(narration(page)).toContainText('Cut into 2 and 6: 5 + 17 = 22.');
  await expect(stage(page)).toHaveAttribute('aria-label', /Pieces cut so far: 2, 6\./);
});

test('top-down shows the calls and the memo hits', async ({ page }) => {
  await option(page, 'Top-down with a memo: recurse, and remember each answer');
  await expect(page.locator('.code')).toContainText('if r[j] is known');
  await form(page).getByLabel('Prices', { exact: true }).fill('2 5 7 8 10');
  await press(page, 'Set prices');
  await press(page, 'Fill the table');
  await toEnd(page);
  await expect(narration(page)).toContainText('memoCut(5) returns 12');
  await expect(narration(page)).toContainText('16 calls, 10 memo hits');
});

test('greedy by price per unit falls short', async ({ page }) => {
  await form(page).getByLabel('Prices', { exact: true }).fill('1 5 8 9');
  await press(page, 'Set prices');
  await press(page, 'Fill the table');
  await press(page, 'Cut the rod');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Greedy by price per unit cuts 3 and 1 and earns only 9.',
  );
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/dp-rod-cutting/#practice=4242&n=3');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\./)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

test('no axe violations while cutting (dark)', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
  await press(page, 'Fill the table');
  await press(page, 'Cut the rod');
  await toEnd(page);
  await page.getByRole('button', { name: 'Step back' }).click();
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});
