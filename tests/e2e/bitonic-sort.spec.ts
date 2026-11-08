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
  await page.goto('/bitonic-sort/');
  await expect(
    page.getByRole('heading', { name: 'Bitonic sorting network', exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('sends the values through every column', async ({ page }) => {
  await load(page, '30 10 40 20');
  await form(page).getByRole('button', { name: 'Sort', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Sorted: 10, 20, 30, 40. 6 comparators in 3 columns, the same for any input of 4 values',
  );
  await backTo(page, 'Column 1 of 3');
  await expect(page.locator('.vars')).toContainText(/stage\s*=?\s*1/);
  await expect(stage(page)).toHaveAttribute('aria-label', /Columns done: 1\./);
  // Two wires' worth of comparators per column, three columns.
  await expect(stage(page).locator('circle')).toHaveCount(6);
});

test('refuses a length that is not a power of two', async ({ page }) => {
  await load(page, '5 3 8 1 9 2');
  await expect(narration(page)).toContainText('needs n to be a power of two');
  await form(page).getByRole('button', { name: 'Sort', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('Load 4 or 8 values');
});

test("Batcher's layout changes the code", async ({ page }) => {
  await option(page, "Batcher's: blocks sorted up and down in turn");
  await expect(page.locator('.code')).toContainText('up if (i and size) == 0, else down');
});

test('a practice question grades and plays its answer', async ({ page }) => {
  await page.goto('/bitonic-sort/#practice=9&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Not quite. The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Eight wires, six columns' }).first().click();
  await expect(page.getByText('Loaded "Eight wires, six columns"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('no axe violations mid-network and no sideways scroll (dark)', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
  await load(page, '57 12 88 34 71 5 46 93 21 64 39 80 27 50 16 75');
  await form(page).getByRole('button', { name: 'Sort', exact: true }).click();
  await toEnd(page);
  await backTo(page, 'Column 7 of 10');
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
