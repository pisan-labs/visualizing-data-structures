import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function press(page: Page, button: string, text: string) {
  await page.getByLabel('item or number', { exact: true }).fill(text);
  await page.getByRole('button', { name: button, exact: true }).click();
  await toEnd(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/reservoir-sampling/');
  await expect(page.getByRole('heading', { name: 'Reservoir sampling' })).toBeVisible();
});

test('offers fill the reservoir, then each item gets in with probability k/i', async ({ page }) => {
  await press(page, 'Offer', 'A B C');
  await expect(narration(page)).toContainText('Reservoir after 3 items');
  await expect(page.locator('.vars')).toContainText(/keep chance\s*"?2\/3/);
  await expect(stage(page).locator('text', { hasText: /^reservoir \(k = 2\)$/ })).toBeVisible();
  await expect(stage(page).locator('text', { hasText: /^item 3: chance 2\/3/ })).toBeVisible();
});

test('trials even out', async ({ page }) => {
  await press(page, 'Run trials', '2000');
  await expect(narration(page)).toContainText('the counts even out near 500');
  await expect(stage(page).locator('text', { hasText: 'kept, over 2000 trials' })).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText('the sample is', { timeout: 60_000 });
});

test('a practice question can be shown', async ({ page }) => {
  await page.goto('/reservoir-sampling/#practice=24680&n=3');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-stream (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await press(page, 'Stream 1 to n', '10');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
