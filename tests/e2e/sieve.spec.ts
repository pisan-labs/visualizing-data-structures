import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function sieve(page: Page, n: string) {
  await page.getByLabel('n', { exact: true }).fill(n);
  await page.getByRole('button', { name: 'Sieve up to n', exact: true }).click();
  await toEnd(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/sieve/');
  await expect(page.getByRole('heading', { name: 'Sieve of Eratosthenes' })).toBeVisible();
});

test('the primes up to 100, with 104 cross-outs', async ({ page }) => {
  await sieve(page, '100');
  await expect(narration(page)).toContainText('There are 25 primes up to 100');
  await expect(page.locator('.vars')).toContainText(/marks\s*104/);
  await expect(stage(page)).toHaveAttribute('aria-label', /25 primes, 2, 3, 5, 7, 11/);
});

test('starting at 2p crosses out more', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('2p (simpler, but crosses some numbers out twice more)').check();
  await expect(page.locator('.code')).toContainText('for j = 2p to n step p');
  await sieve(page, '60');
  await expect(page.locator('.vars')).toContainText(/marks\s*66/);
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'The primes up to 100' }));
  await expect(narration(page)).toContainText('100', { timeout: 60_000 });
});

test('a practice question can be shown', async ({ page }) => {
  await page.goto('/sieve/#practice=24680&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await sieve(page, '50');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
