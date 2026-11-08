import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function press(page: Page, button: string, text?: string) {
  if (text !== undefined) await page.getByLabel('values or trials', { exact: true }).fill(text);
  await page.getByRole('button', { name: button, exact: true }).click();
  await toEnd(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/fisher-yates/');
  await expect(page.getByRole('heading', { name: 'Fisher-Yates shuffle' })).toBeVisible();
});

test('a shuffle moves one random unshuffled item into place per step', async ({ page }) => {
  await press(page, 'Load values', 'A B C D E');
  await press(page, 'Shuffle');
  await expect(narration(page)).toContainText('after 4 swaps');
  await expect(page.locator('.vars')).toContainText(/swaps\s*4/);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(stage(page).locator('text', { hasText: 'unshuffled' })).toBeVisible();
});

test('trials of the naive shuffle show its bias', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Any position at all (naive, biased)').check();
  await expect(page.locator('.code')).toContainText('RANDOM(0, n − 1)');
  await press(page, 'Run trials', '2700');
  await expect(narration(page)).toContainText('5/27');
  await expect(stage(page).locator('text', { hasText: 'odds: 4/27 5/27' })).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText('Shuffled', { timeout: 60_000 });
});

test('a practice question can be shown', async ({ page }) => {
  await page.goto('/fisher-yates/#practice=24680&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-shuffle (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await press(page, 'Run trials', '600');
    await press(page, 'Shuffle');
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
