import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const form = (page: Page) => page.locator('form.controls');

async function search(page: Page, value: string) {
  await form(page).getByLabel('Values or x').fill(value);
  await form(page).getByRole('button', { name: 'Search', exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function backTo(page: Page, text: string) {
  for (let i = 0; i < 30; i++) {
    if (((await narration(page).textContent()) ?? '').includes(text)) return;
    await page.getByRole('button', { name: 'Step back' }).click();
  }
  await expect(narration(page)).toContainText(text);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/exponential-search/');
  await expect(
    page.getByRole('heading', { name: 'Exponential search', exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('doubles the bound, then binary searches the last jump', async ({ page }) => {
  await search(page, '26');
  await toEnd(page);
  await expect(narration(page)).toContainText('Found it: return 5. 7 probes in all.');
  await backTo(page, 'Phase 2: binary search A[4..8]');
  await expect(page.locator('.vars')).toContainText(/bound\s*=?\s*8/);
  await backTo(page, 'Double the bound: bound = 8.');
  await expect(page.locator('.code li.active')).toContainText(['bound = 2 * bound']);
});

test('a value near the front beats binary search', async ({ page }) => {
  await search(page, '3');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    '2 probes in all. Binary search on all of A would take 4 probes.',
  );
});

test('a practice question grades and plays its answer', async ({ page }) => {
  await page.goto('/exponential-search/#practice=5&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Not quite. The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Near the front' }).first().click();
  await expect(page.getByText('Loaded "Near the front: two probes"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('no axe violations mid-search (contrast theme)', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('contrast');
  await search(page, '58');
  await toEnd(page);
  await backTo(page, 'Phase 2');
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});
