import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Sentence', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function option(page: Page, label: string) {
  const choice = page.getByLabel(label);
  if (!(await choice.isVisible())) await page.getByText('Options', { exact: true }).click();
  await choice.check();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('positional-encoding'));
  await expect(
    page.getByRole('heading', { name: 'Positional encoding (sinusoidal, RoPE)' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('the sinusoidal table and its constant diagonals', async ({ page }) => {
  await op(page, 'Load', 'the cat sat on the mat and');
  await op(page, 'Encode positions');
  await op(page, 'Score pairs');
  await toEnd(page);
  await expect(narration(page)).toContainText('Every diagonal of PE·PE holds one number');
  await expect(stage(page).locator('text', { hasText: 'pos ÷ 1000' })).toBeVisible();
  await expect(page.locator('.vars')).toContainText(/positions\s*7/);
});

test('RoPE scores depend on the distance, and a bad sentence is refused', async ({ page }) => {
  await option(page, 'RoPE: turn queries and keys (Su et al.)');
  await op(page, 'Load', 'the dog saw the dog saw');
  await op(page, 'Encode positions');
  await op(page, 'Score pairs');
  await toEnd(page);
  await expect(narration(page)).toContainText('never on m or n alone');
  await page.getByLabel('Sentence', { exact: true }).fill('the elephant');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('six at most')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/positional-encoding/#practice=13579&n=5');
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
  for (const scheme of [
    'RoPE: turn queries and keys (Su et al.)',
    'ALiBi: a linear penalty on scores (Press et al.)',
  ]) {
    test(`no axe violations, ${scheme.split(':')[0]} (${theme})`, async ({ page }) => {
      await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
      await option(page, scheme);
      await op(page, 'Load', 'the dog saw the ball and it');
      await op(page, 'Encode positions');
      await op(page, 'Score pairs');
      await toEnd(page);
      await settled(page);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(axeFindings(results)).toEqual([]);
    });
  }
}
