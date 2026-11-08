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
  await page.getByLabel('numbers', { exact: true }).fill(text);
  await page.getByRole('button', { name: button, exact: true }).click();
  await toEnd(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/rsa/');
  await expect(page.getByRole('heading', { name: 'RSA', exact: true })).toBeVisible();
});

test('keys from 61 and 53, then a round trip', async ({ page }) => {
  await press(page, 'Make keys', '61 53');
  await expect(narration(page)).toContainText('private (d, n) = (1783, 3233)');
  await expect(narration(page)).toContainText('Toy sizes');
  await expect(stage(page).locator('text', { hasText: 'toy key: 3233 = 61·53' })).toBeVisible();
  await press(page, 'Encrypt m', '65');
  await expect(page.locator('.vars')).toContainText(/c\s*1317/);
  await press(page, 'Decrypt c', '1317');
  await expect(narration(page)).toContainText('the message is back');
});

test('a message not below n is refused', async ({ page }) => {
  await press(page, 'Make keys', '11 13');
  await press(page, 'Encrypt m', '200');
  await expect(narration(page)).toContainText('less than n = 143');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText('143');
});

test('a practice question can be shown', async ({ page }) => {
  await page.goto('/rsa/#practice=24680&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await press(page, 'Make keys', '61 53');
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
