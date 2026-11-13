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
  await page.goto(emptyStart('moe-routing'));
  await expect(page.getByRole('heading', { name: 'Mixture-of-experts routing' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('a busy expert drops a token when the capacity is tight', async ({ page }) => {
  await option(page, '1: room for exactly an even share');
  await op(page, 'Load', 'the cat and the dog and the fox');
  await op(page, 'Route');
  await toEnd(page);
  await expect(narration(page)).toContainText('2 dropped');
  await expect(stage(page).locator('text', { hasText: 'C = 4' })).toBeVisible();
  await expect(page.locator('.vars')).toContainText(/tokens with no expert\s*1/);
});

test('expert choice fills every expert, and a bad sentence is refused', async ({ page }) => {
  await option(page, 'Expert choice: each expert picks its tokens (Zhou et al. 2022)');
  await op(page, 'Load', 'the cat sat on the mat');
  await op(page, 'Score (router)');
  await op(page, 'Route');
  await toEnd(page);
  await expect(narration(page)).toContainText('Expert choice');
  await expect(page.locator('.vars')).toContainText(/load-balance loss\s*1\s*$/);
  await page.getByLabel('Sentence', { exact: true }).fill('the elephant');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('six at most')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/moe-routing/#practice=13579&n=5');
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
  test(`no axe violations on a routing with drops (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await option(page, '1: room for exactly an even share');
    await op(page, 'Load', 'the cat and the dog and the fox');
    await op(page, 'Route');
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
