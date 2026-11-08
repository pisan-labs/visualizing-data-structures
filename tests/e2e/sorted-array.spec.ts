import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const variable = (page: Page, name: string) =>
  page
    .locator('.vars dl > div')
    .filter({ has: page.locator('dt', { hasText: new RegExp(`^${name}$`) }) })
    .locator('dd');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function press(page: Page, button: string, input?: string) {
  if (input !== undefined) await page.getByLabel('Number', { exact: true }).fill(input);
  await page.getByRole('button', { name: button, exact: true }).click();
}

async function openExample(page: Page, title: string, jumpTo: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Load' })
    .click();
  await page.getByRole('tab', { name: 'History' }).click();
  await page.getByRole('button', { name: jumpTo }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/sorted-array/');
  await expect(page.getByRole('heading', { name: 'Sorted vs unsorted array' })).toBeVisible();
});

test('insert keeps the array in order', async ({ page }) => {
  await fast(page);
  await press(page, 'Insert', '50 10 30');
  await expect(narration(page)).toContainText('Increment size to 3', { timeout: 20_000 });
  await expect(stage(page)).toHaveAttribute('aria-label', /3 of 10 slots used: 10, 30, 50\./);
  await expect(variable(page, 'moves')).toHaveText('1');
});

test('binary search needs 3 comparisons where a scan needs 7', async ({ page }) => {
  await openExample(page, 'Binary search halves the range', '10. search(70)');
  await expect(narration(page)).toContainText('found it after 3 comparisons');
  await expect(variable(page, 'comparisons')).toHaveText('3');
  await expect(stage(page).getByText('returned')).toBeVisible();

  await page.getByText('Options').click();
  await page.getByLabel('Unsorted: add new items at the end').check();
  await page.getByRole('button', { name: '10. search(70)' }).click();
  await expect(narration(page)).toContainText('Found it at index 6 after 7 comparisons');
  await expect(page.locator('.code')).toContainText('for i = 0 to size - 1');
});

test('lower and upper bound bracket duplicates, and need sorted order', async ({ page }) => {
  await openExample(page, 'Lower and upper bound around duplicates', '8. upperBound(20)');
  await expect(narration(page)).toContainText('Return 4');
  await page.getByText('Options').click();
  await page.getByLabel('Unsorted: add new items at the end').check();
  await page.getByRole('button', { name: '8. upperBound(20)' }).click();
  await expect(narration(page)).toContainText('needs a sorted array');
  await expect(page.locator('.narration')).toHaveClass(/error/);
});

test('only whole numbers go in', async ({ page }) => {
  await press(page, 'Insert', '2.5');
  await expect(page.getByRole('alert')).toContainText('Type a whole number from -999 to 999.');
});

test('a binary search step has no axe violations in high contrast', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('contrast');
  await openExample(page, 'Searching for a value that is not there', '10. search(55)');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(stage(page).getByText('mid', { exact: true })).toBeVisible();
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});
