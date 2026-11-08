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

async function example(page: Page, title: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ has: page.getByText(title, { exact: true }) })
    .getByRole('button', { name: 'Load' })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/interpolation-search/');
  await expect(
    page.getByRole('heading', { name: 'Interpolation search', exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('guesses from the value and finds it in one probe', async ({ page }) => {
  await input(page, 'Search', '55');
  await toEnd(page);
  await expect(narration(page)).toContainText('Found it: return 6. That took 1 probe.');
  await expect(narration(page)).toContainText('Binary search would take 3 probes.');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('= 6.04, rounded down to 6');
});

test('skewed values make it crawl', async ({ page }) => {
  await example(page, 'Skewed values: the guess crawls');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'That took 12 probes. Binary search would take 4 probes.',
  );
});

test('refuses unsorted values until they are sorted', async ({ page }) => {
  await input(page, 'Load', '42 8 63 17');
  await expect(narration(page)).toContainText('A is not sorted');
  await input(page, 'Search', '17');
  await expect(narration(page)).toContainText('Interpolation search needs A in order');
  await form(page).getByRole('button', { name: 'Sort A', exact: true }).click();
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /8, 17, 42, 63/);
});

test('a practice question grades and plays its answer', async ({ page }) => {
  await page.goto('/interpolation-search/#practice=77&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Not quite. The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Evenly spread values' }).first().click();
  await expect(page.getByText('Loaded "Evenly spread values: one probe"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('no axe violations mid-search, with the guide line drawn', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
  await example(page, 'A guess just short');
  await toEnd(page);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Guess pos');
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});
