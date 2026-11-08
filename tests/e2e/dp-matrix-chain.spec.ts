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

test.beforeEach(async ({ page }) => {
  await page.goto('/dp-matrix-chain/');
  await expect(
    page.getByRole('heading', { name: 'Matrix-chain order', exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('fills both tables and brackets the six matrices', async ({ page }) => {
  await press(page, 'Parenthesize');
  await expect(narration(page)).toContainText('Fill the tables first.');
  await press(page, 'Fill the tables');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'm[1][6] = 15125: the fewest scalar multiplications for the whole chain. The worst order needs 58000.',
  );
  await press(page, 'Parenthesize');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    '((A₁(A₂A₃))((A₄A₅)A₆)): 15125 scalar multiplications.',
  );
  await expect(stage(page).locator('text', { hasText: '((A₁(A₂A₃))((A₄A₅)A₆))' })).toBeVisible();
});

test('three matrices: the order matters ten times over', async ({ page }) => {
  await form(page).getByLabel('Dimensions', { exact: true }).fill('10 40 2 30');
  await press(page, 'Set dimensions');
  await form(page).locator('details.more > summary').click();
  await press(page, 'Fill one chain length');
  await press(page, 'Fill one chain length');
  await toEnd(page);
  await expect(narration(page)).toContainText('Chains of length 2 are done.');
  await press(page, 'Fill the tables');
  await toEnd(page);
  await expect(narration(page)).toContainText('m[1][3] = 1400');
  await expect(narration(page)).toContainText('The worst order needs 14400.');
});

test('refuses dimensions it cannot draw', async ({ page }) => {
  await form(page).getByLabel('Dimensions', { exact: true }).fill('3 50');
  await press(page, 'Set dimensions');
  await expect(page.getByRole('alert')).toContainText('50 is out of range');
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/dp-matrix-chain/#practice=1618&n=3');
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

test('no axe violations while filling (dark, every detail)', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
  await page.getByRole('combobox', { name: 'Detail' }).selectOption({ label: 'Every detail' });
  await press(page, 'Fill the tables');
  await toEnd(page);
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Step back' }).click();
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});
