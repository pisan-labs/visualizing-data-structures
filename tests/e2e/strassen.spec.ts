import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('A * B', { exact: true });

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function multiply(page: Page, text: string) {
  await input(page).fill(text);
  await page.getByRole('button', { name: 'Multiply A·B', exact: true }).click();
  await toEnd(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('strassen'));
  await expect(
    page.getByRole('heading', { name: 'Strassen matrix multiplication', exact: true }),
  ).toBeVisible();
});

test('2 × 2 with seven products', async ({ page }) => {
  await multiply(page, '1 2; 3 4 * 5 6; 7 8');
  await expect(narration(page)).toContainText('7 scalar multiplications and 18 scalar additions');
  await expect(stage(page)).toHaveAttribute('aria-label', /= \[19 22; 43 50\]/);
  await expect(stage(page).getByText('C11 = P5 + P4 − P2 + P6', { exact: true })).toBeVisible();
  await expect(page.locator('.vars')).toContainText(/multiplications\s*7/);
});

test('4 × 4 recursion makes 49 multiplications', async ({ page }) => {
  await multiply(page, '1 2 3 4; 5 6 7 8; 9 0 1 2; 3 4 5 6 * 1 0 0 0; 0 1 0 0; 0 0 1 0; 0 0 0 1');
  await expect(narration(page)).toContainText('49 scalar multiplications');
  await expect(narration(page)).toContainText('The schoolbook method takes 64');
  await expect(stage(page).getByText('level 2: 49 calls of 1×1, 49 mults')).toBeVisible();
});

test('eight block products take n³', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Eight: plain block multiplication').check();
  await page.getByText('Options', { exact: true }).click();
  await expect(page.locator('.code')).toContainText('MULTIPLY(A, B)');
  await multiply(page, '1 2; 3 4 * 5 6; 7 8');
  await expect(narration(page)).toContainText('8 scalar multiplications and 4 scalar additions');
});

test('a 3 × 3 product is padded to 4 × 4', async ({ page }) => {
  await multiply(page, '1 2 3; 4 5 6; 7 8 9 * 9 8 7; 6 5 4; 3 2 1');
  await expect(narration(page)).toContainText('Drop the padding');
  await expect(stage(page).getByText('A·B, 4 × 4 (3 × 3 padded)')).toBeVisible();
});

test('a bad matrix is refused with a reason', async ({ page }) => {
  await input(page).fill('1 2; 3 * 5 6; 7 8');
  await page.getByRole('button', { name: 'Multiply A·B', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('must be square');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText('2 × 2', { timeout: 60_000 });
});

test('a practice question can be shown', async ({ page }) => {
  await page.goto('/strassen/#practice=24680&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

test('the page opens on a full 4 × 4 run and fits the screen', async ({ page }) => {
  await page.goto('/strassen/');
  await expect(narration(page)).toContainText('49 scalar multiplications');
  await settled(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await multiply(page, '1 2; 3 4 * 5 6; 7 8');
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
