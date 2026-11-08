import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function run(page: Page, op: string, text: string) {
  await page.getByLabel('a b', { exact: true }).fill(text);
  await page.getByRole('button', { name: op, exact: true }).click();
  await toEnd(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/euclid/');
  await expect(page.getByRole('heading', { name: 'Euclid and extended Euclid' })).toBeVisible();
});

test('gcd replaces (a, b) with (b, a mod b) until b is 0', async ({ page }) => {
  await run(page, 'gcd(a, b)', '240 46');
  await expect(narration(page)).toContainText('gcd(240, 46) = 2');
  await expect(page.locator('.vars')).toContainText(/calls\s*5/);
  await expect(stage(page)).toHaveAttribute('aria-label', /\(46, 10\)/);
});

test('extended Euclid fills x and y on the way back up', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Extended Euclid: the gcd and x, y with ax + by = gcd').check();
  await expect(page.locator('.code')).toContainText('EXTENDED-EUCLID');
  await run(page, 'gcd(a, b)', '240 46');
  await expect(narration(page)).toContainText('240·(-9) + 46·47');
  await expect(stage(page).locator('text', { hasText: /^47$/ })).toBeVisible();
});

test('a modular inverse, and one that does not exist', async ({ page }) => {
  await run(page, 'Inverse of a mod b', '7 40');
  await expect(narration(page)).toContainText('The inverse is');
  await expect(page.locator('.vars')).toContainText(/inverse\s*23/);
  await run(page, 'Inverse of a mod b', '6 15');
  await expect(narration(page)).toContainText('no inverse');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText('gcd(240, 46)', { timeout: 60_000 });
});

test('a practice question can be shown', async ({ page }) => {
  await page.goto('/euclid/#practice=24680&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await run(page, 'Inverse of a mod b', '7 40');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
