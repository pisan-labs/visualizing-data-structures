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
  await page.goto(emptyStart('transformer-block'));
  await expect(page.getByRole('heading', { name: 'The transformer block' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('the block guesses a thing after an article that follows an animal', async ({ page }) => {
  await op(page, 'Load', 'the cat sat on the');
  await op(page, 'Run the block');
  await toEnd(page);
  await expect(narration(page)).toContainText('the block guesses mat');
  await expect(stage(page).getByText('x₂', { exact: true })).toBeVisible();
  await expect(page.locator('.vars')).toContainText(/block parameters\s*172/);
});

test('settings change the parameter count, and a bad sentence is refused', async ({ page }) => {
  await option(page, 'RMSNorm: divide by the root mean square (Llama)');
  await option(page, 'SwiGLU: a gated unit, three matrices (Llama)');
  await op(page, 'Load', 'the dog');
  await op(page, 'Run the block');
  await toEnd(page);
  await expect(narration(page)).toContainText('An animal is usually followed by an action');
  await expect(page.locator('.vars')).toContainText(/block parameters\s*176/);
  await page.getByLabel('Sentence', { exact: true }).fill('the elephant');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('six at most')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/transformer-block/#practice=13579&n=5');
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
  test(`no axe violations on the finished block (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Load', 'the cat sat on the');
    await op(page, 'Run the block');
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
