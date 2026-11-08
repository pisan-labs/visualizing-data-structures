import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const form = (page: Page) => page.locator('form.controls');

async function load(page: Page, values: string) {
  await form(page).getByLabel('Values').fill(values);
  await form(page).getByRole('button', { name: 'Load', exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function backTo(page: Page, text: string) {
  for (let i = 0; i < 120; i++) {
    if (((await narration(page).textContent()) ?? '').includes(text)) return;
    await page.getByRole('button', { name: 'Step back' }).click();
  }
  await expect(narration(page)).toContainText(text);
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
  await page.goto('/timsort/');
  await expect(page.getByRole('heading', { name: 'Timsort', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('finds runs, reverses a falling one, and merges', async ({ page }) => {
  await load(page, '9 7 5 3 1 2 4 6 8');
  await form(page).getByRole('button', { name: 'Sort', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('Sorted: 1, 2, 3, 4, 5, 6, 7, 8, 9.');
  await backTo(page, 'Reverse it in place: 1, 3, 5, 7, 9.');
  await expect(page.locator('.code li.active')).toContainText([
    'if it strictly goes down: reverse it',
  ]);
});

test('the stack rules merge runs of similar size', async ({ page }) => {
  await example(page, 'The stack keeps its runs growing');
  await toEnd(page);
  await backTo(page, '|Z| = 8 ≤ |Y| + |X| = 4 + 4. Merge Y and X.');
  await expect(page.locator('.vars')).toContainText('8, 4, 4');
  await expect(stage(page)).toHaveAttribute('aria-label', /Array A with 20 values/);
});

test('a practice question grades and plays its answer', async ({ page }) => {
  await page.goto('/timsort/#practice=21&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Not quite. The answer is');
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Natural runs: up, down, up' }).first().click();
  await expect(page.getByText('Loaded "Natural runs: up, down, up"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('no axe violations mid-merge (dark)', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
  await example(page, 'Random values: short runs grow to minrun');
  await toEnd(page);
  await backTo(page, 'from tmp into');
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});
