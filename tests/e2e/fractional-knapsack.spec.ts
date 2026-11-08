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
  await page.goto('/fractional-knapsack/');
  await expect(
    page.getByRole('heading', { name: 'Fractional knapsack', exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('takes two items whole and 2/3 of the third', async ({ page }) => {
  await press(page, 'Fill the knapsack');
  await toEnd(page);
  await expect(narration(page)).toContainText('Total value 24, weight 5 of 5.');
  await expect(narration(page)).toContainText('With whole items only, the best is 22.');
  await expect(stage(page)).toHaveAttribute('aria-label', /item 3 weight 3 value 12, 2 of 3 taken/);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Take 2/3 of it, worth 8.');
});

test('whole items only: greedy falls short of the table', async ({ page }) => {
  await option(page, 'Whole items only (0/1 knapsack: greedy can be wrong)');
  await expect(page.locator('.code')).toContainText('else: skip i');
  await press(page, 'Fill the knapsack');
  await toEnd(page);
  await expect(narration(page)).toContainText('Greedy with whole items gets 16');
  await expect(narration(page)).toContainText('The 0/1 knapsack table finds 22');
});

test('changes the capacity, and refuses one it cannot draw', async ({ page }) => {
  await form(page).getByLabel('Items or capacity', { exact: true }).fill('16');
  await press(page, 'Capacity');
  await expect(page.getByRole('alert')).toContainText('Use a capacity from 1 to 15.');
  await form(page).getByLabel('Items or capacity', { exact: true }).fill('3');
  await press(page, 'Capacity');
  await press(page, 'Fill the knapsack');
  await toEnd(page);
  await expect(narration(page)).toContainText('Total value 16, weight 3 of 3.');
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/fractional-knapsack/#practice=8080&n=3');
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

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations after filling (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await press(page, 'Fill the knapsack');
    await toEnd(page);
    await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
