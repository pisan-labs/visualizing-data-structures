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
  for (let i = 0; i < 60; i++) {
    if (((await narration(page).textContent()) ?? '').includes(text)) return;
    await page.getByRole('button', { name: 'Step back' }).click();
  }
  await expect(narration(page)).toContainText(text);
}

async function option(page: Page, label: string) {
  const panel = page.locator('details.options');
  if ((await panel.getAttribute('open')) === null) await panel.locator('summary').click();
  await page.getByLabel(label).check();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/gnome-sort/');
  await expect(page.getByRole('heading', { name: 'Gnome sort', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('walks forward and back, and compares with insertion sort', async ({ page }) => {
  await load(page, '20 30 40 50 60 5');
  await form(page).getByRole('button', { name: 'Sort', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('That took 14 comparisons and 5 swaps.');
  await expect(narration(page)).toContainText('but only 9 comparisons');
  await backTo(page, 'Swap them and step back: 5 moves left to A[2], and pos = 2.');
  await expect(page.locator('.code li.active')).toContainText(['pos = pos - 1']);
  await expect(stage(page)).toHaveAttribute('aria-label', /pos at index 2/);
});

test('jumping back makes it insertion sort', async ({ page }) => {
  await option(page, 'Jump back to where the gnome left off');
  await expect(page.locator('.code')).toContainText('pos = far');
  await load(page, '20 30 40 50 60 5');
  await form(page).getByRole('button', { name: 'Sort', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'The same comparisons and swaps as insertion sort, 9 and 5.',
  );
});

test('a practice question grades and plays its answer', async ({ page }) => {
  await page.goto('/gnome-sort/#practice=12&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Not quite. The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'One gnome, one index' }).first().click();
  await expect(page.getByText('Loaded "One gnome, one index"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('no axe violations mid-sort (contrast)', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('contrast');
  await load(page, '42 17 63 8 35 24 91 5 77 13 58 30 86 2 49 70 21 95 38 66');
  await form(page).getByRole('button', { name: 'Sort', exact: true }).click();
  await toEnd(page);
  await backTo(page, 'step back');
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});
