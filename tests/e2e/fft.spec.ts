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
  await page.goto('/fft/');
  await expect(page.getByRole('heading', { name: 'Fast Fourier transform' })).toBeVisible();
});

test('a four-point transform', async ({ page }) => {
  await press(page, 'Transform', '1 2 3 4');
  await expect(narration(page)).toContainText('y = [10, −2−2i, −2, −2+2i]');
  await expect(page.locator('.vars')).toContainText(/butterflies\s*4/);
  await expect(stage(page).locator('text', { hasText: /^size 4$/ })).toBeVisible();
});

test('multiplying polynomials with the inverse transform', async ({ page }) => {
  await press(page, 'Multiply polynomials', '1 2 | 3 4');
  await expect(narration(page)).toContainText('A·B = 3 + 10x + 8x²');
});

test('the other sign convention swaps outputs', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('ω = e^(−2πi/n), as in numpy and signal processing').check();
  await expect(page.locator('.code')).toContainText('e^(−2πi/n)');
  await press(page, 'Transform', '1 2 3 4');
  await expect(narration(page)).toContainText('y = [10, −2+2i, −2, −2−2i]');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText('y = [10', { timeout: 60_000 });
});

test('a practice question can be shown', async ({ page }) => {
  await page.goto('/fft/#practice=24680&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await press(page, 'Transform', '1 1 1 1 0 0 0 0');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
