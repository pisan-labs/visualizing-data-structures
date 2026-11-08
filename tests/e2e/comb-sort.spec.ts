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
  await page.goto('/comb-sort/');
  await expect(page.getByRole('heading', { name: 'Comb sort', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('shrinks the gap and compares with bubble sort at the end', async ({ page }) => {
  await load(page, '20 30 40 50 60 70 80 10');
  await form(page).getByRole('button', { name: 'Sort', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Sorted: 10, 20, 30, 40, 50, 60, 70, 80. That took 6 passes, 31 comparisons and 7 swaps.',
  );
  await expect(narration(page)).toContainText('Bubble sort would make 28 comparisons');
  await backTo(page, 'Swap them: 10 jumps 6 slots left to A[1]');
  await expect(page.locator('.code li.active')).toContainText(['swap A[i] and A[i + gap]']);
  await expect(stage(page)).toHaveAttribute('aria-label', /i at index 1, i\+gap at index 7/);
});

test('the shrink option changes the code and the gaps', async ({ page }) => {
  await option(page, '2 (halving, too fast)');
  await expect(page.locator('.code')).toContainText('gap = floor(gap / 2)');
  await load(page, '9 8 7 6 5 4 3 2');
  await form(page).getByRole('button', { name: 'Sort', exact: true }).click();
  await toEnd(page);
  await backTo(page, 'Pass 1: gap = floor(8 / 2) = 4.');
});

test('a practice question grades and plays its answer', async ({ page }) => {
  await page.goto('/comb-sort/#practice=8&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Not quite. The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Two turtles' }).first().click();
  await expect(page.getByText('Loaded "Two turtles at the end jump home"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('no axe violations mid-sort and no sideways scroll (dark)', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
  await load(page, '42 17 63 8 35 24 91 5 77 13 58 30 86 2 49 70 21 95 38 66');
  await form(page).getByRole('button', { name: 'Sort', exact: true }).click();
  await toEnd(page);
  await backTo(page, 'Swap them');
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
