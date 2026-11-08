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
  for (let i = 0; i < 160; i++) {
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
  await page.goto('/introsort/');
  await expect(page.getByRole('heading', { name: 'Introsort', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('random values stay within the budget', async ({ page }) => {
  await load(page, '57 12 88 34 71 5 46 93 21 64 39 80');
  await form(page).getByRole('button', { name: 'Sort', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'The calls went 3 levels deep, within the budget of 6, so heap sort was never needed.',
  );
  await expect(stage(page)).toHaveAttribute('aria-label', /5, 12, 21, 34, 39, 46, 57, 64/);
});

test('the killer runs out the budget and heap sort takes over', async ({ page }) => {
  await example(page, 'A median-of-3 killer runs out the budget');
  await toEnd(page);
  await expect(narration(page)).toContainText('The budget of 8 ran out once');
  await backTo(page, 'Hand A[16..19] to heap sort');
  await expect(page.locator('.code li.active')).toContainText(['heapSort(A, p, r); return']);
  await expect(page.locator('.vars')).toContainText(/depth\s*=?\s*8/);
});

test('a practice question grades and plays its answer', async ({ page }) => {
  await page.goto('/introsort/#practice=3&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Not quite. The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Random values' }).first().click();
  await expect(page.getByText('Loaded "Random values: quicksort does all the work"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('no axe violations during heap sort (dark)', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
  await example(page, 'A smaller budget switches sooner');
  await toEnd(page);
  await backTo(page, 'is now a max-heap');
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});
