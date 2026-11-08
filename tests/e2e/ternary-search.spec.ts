import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const form = (page: Page) => page.locator('form.controls');

async function input(page: Page, op: string, value: string) {
  await form(page).getByLabel('Values or x').fill(value);
  await form(page).getByRole('button', { name: op, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function option(page: Page, label: string) {
  const panel = page.locator('details.options');
  if ((await panel.getAttribute('open')) === null) await panel.locator('summary').click();
  await page.getByLabel(label).check();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/ternary-search/');
  await expect(page.getByRole('heading', { name: 'Ternary search', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('searches by thirds and counts more comparisons than binary search', async ({ page }) => {
  await input(page, 'Search', '20');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'That took 3 rounds and 10 comparisons with x. Binary search would take 4 rounds and 8 comparisons.',
  );
  await expect(page.locator('.vars')).toContainText('comparisons');
});

test('finds the peak of a hill, and refuses two hills', async ({ page }) => {
  await input(page, 'Load', '3 8 14 20 17 9');
  await expect(narration(page)).toContainText('A rises and then falls');
  await form(page).getByRole('button', { name: 'Find max', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('it is the peak, A[3] = 20. Return 3.');
  await input(page, 'Load', '10 40 25 15 50 80 30');
  await form(page).getByRole('button', { name: 'Find max', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('A is not unimodal');
});

test('the goal option starts on a hill and puts its code first', async ({ page }) => {
  await option(page, 'The maximum of values that rise, then fall');
  await expect(stage(page)).toHaveAttribute('aria-label', /5, 12, 26, 38, 51, 67, 80, 93/);
  await expect(page.locator('.code')).toContainText('ternaryMax(A, n)');
});

test('a practice question grades and plays its answer', async ({ page }) => {
  await page.goto('/ternary-search/#practice=31&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Not quite. The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Two points, three thirds' }).first().click();
  await expect(page.getByText('Loaded "Two points, three thirds"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('no axe violations mid-search (dark theme)', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
  await input(page, 'Search', '58');
  await toEnd(page);
  await page.getByRole('button', { name: 'Step back' }).click();
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});
