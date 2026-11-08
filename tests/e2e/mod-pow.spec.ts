import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function compute(page: Page, text: string) {
  await page.getByLabel('a b m', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Compute a^b mod m', exact: true }).click();
  await toEnd(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/mod-pow/');
  await expect(page.getByRole('heading', { name: 'Fast modular exponentiation' })).toBeVisible();
});

test('square-and-multiply over the bits of 13', async ({ page }) => {
  await compute(page, '7 13 11');
  await expect(narration(page)).toContainText('7^13 mod 11 = 2');
  await expect(page.locator('.vars')).toContainText(/mults\s*7/);
  await expect(page.locator('.vars')).toContainText(/naive\s*12/);
  await expect(stage(page)).toHaveAttribute('aria-label', /exponent bits 1101 = 2/);
});

test('reading the bits from the right gives the same answer', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('From the right, lowest first').check();
  await expect(page.locator('.code')).toContainText('result · p mod m');
  await compute(page, '7 13 11');
  await expect(narration(page)).toContainText('7^13 mod 11 = 2');
  await expect(stage(page).locator('text', { hasText: 'p = a^(2^i)' })).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText('7^13 mod 11', { timeout: 60_000 });
});

test('a practice question can be shown', async ({ page }) => {
  await page.goto('/mod-pow/#practice=24680&n=3');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await compute(page, '7 560 561');
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
