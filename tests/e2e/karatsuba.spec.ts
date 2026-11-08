import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function multiply(page: Page, text: string) {
  await page.getByLabel('x y', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Multiply x·y', exact: true }).click();
  await toEnd(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/karatsuba/');
  await expect(page.getByRole('heading', { name: 'Karatsuba multiplication' })).toBeVisible();
});

test('1234·5678 with three products per split', async ({ page }) => {
  await multiply(page, '1234 5678');
  await expect(narration(page)).toContainText('1234·5678 = 7006652');
  await expect(page.locator('.vars')).toContainText(/calls\s*16/);
  await expect(stage(page).locator('text', { hasText: /^46·134$/ })).toBeVisible();
});

test('four products per split takes as many digit products as schoolbook', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Four: plain divide and conquer, ac, ad, bc, bd').check();
  await expect(page.locator('.code')).toContainText('MULTIPLY(a, d)');
  await multiply(page, '1234 5678');
  await expect(page.locator('.vars')).toContainText(/digit products\s*16/);
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText('1234·5678', { timeout: 60_000 });
});

test('a practice question can be shown', async ({ page }) => {
  await page.goto('/karatsuba/#practice=24680&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await multiply(page, '1234 5678');
    for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
