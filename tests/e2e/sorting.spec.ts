/**
 * Sorting and searching pages: load values, run the algorithm, change a textbook variant,
 * load a curated example. Every page also runs through all-vizzes.spec.ts.
 */
import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const code = (page: Page) => page.locator('.code');

async function open(page: Page, id: string, title: string) {
  await page.goto(`./#/${id}`);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

const form = (page: Page) => page.locator('form.controls');

async function load(page: Page, values: string) {
  await form(page).getByLabel('Values').fill(values);
  await form(page).getByRole('button', { name: 'Load', exact: true }).click();
}

async function run(page: Page, op: string) {
  await form(page).getByRole('button', { name: op, exact: true }).click();
}

/** Step back until the narration matches, at most `max` steps. */
async function backTo(page: Page, text: string, max = 12) {
  for (let i = 0; i < max; i++) {
    if ((await narration(page).textContent())?.includes(text)) return;
    await page.getByRole('button', { name: 'Step back' }).click();
  }
  await expect(narration(page)).toContainText(text);
}

/** Jump to the end of the history. */
async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (await next.isEnabled()) await next.click();
}

async function option(page: Page, label: string) {
  await page.getByText('Options').click();
  await page.getByLabel(label).check();
}

async function loadExample(page: Page, title: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Load' })
    .click();
}

test.describe('bubble sort', () => {
  test.beforeEach(({ page }) => open(page, 'bubble-sort', 'Bubble sort'));

  test('loads values, sorts them and counts the work', async ({ page }) => {
    await load(page, '5, 3 8 1');
    await expect(narration(page)).toContainText('Loaded 4 values into A: 5, 3, 8, 1.');
    await run(page, 'Sort');
    await toEnd(page);
    await expect(narration(page)).toContainText('Sorted: 1, 3, 5, 8. That took 6 comparisons');
    await expect(stage(page)).toHaveAttribute('aria-label', /Array A with 4 values: 1, 3, 5, 8\./);
    await expect(page.locator('.vars')).toContainText('swaps');
  });

  test('steps through comparisons and swaps', async ({ page }) => {
    await load(page, '2 1');
    await run(page, 'Sort');
    await toEnd(page);
    await backTo(page, '1 < 2, so swap them.');
    await expect(page.locator('.code li.active')).toContainText('swap A[j] and A[j - 1]');
  });

  test('the direction option mirrors the code', async ({ page }) => {
    await option(page, 'From the front: the largest value moves to the end');
    await page.getByRole('button', { name: 'sort', exact: true }).click();
    await expect(code(page)).toContainText('if A[j] > A[j + 1]');
  });

  test('rejects values it cannot draw', async ({ page }) => {
    await load(page, '5 300 2');
    await expect(page.getByRole('alert')).toContainText('300 is out of range');
    await load(page, '1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21');
    await expect(page.getByRole('alert')).toContainText('at most 20');
  });

  test('a curated example shows early exit', async ({ page }) => {
    await loadExample(page, 'Sorted input: early exit stops after one pass');
    await expect(narration(page)).toContainText('Loaded 7 values');
    await toEnd(page);
    await expect(narration(page)).toContainText('6 comparisons and no swaps');
  });
});

test.describe('cocktail shaker sort', () => {
  test.beforeEach(({ page }) => open(page, 'cocktail-sort', 'Cocktail shaker sort'));

  test('a backward pass carries a small value to the front', async ({ page }) => {
    await loadExample(page, 'A small value stuck at the end');
    await toEnd(page);
    await expect(narration(page)).toContainText('18 comparisons and 7 swaps');
    await backTo(page, 'End of the backward pass: A[0] = 10 is in its final place.', 30);
  });

  test('the shrink option changes the code', async ({ page }) => {
    await option(page, 'To where the pass last swapped');
    await expect(code(page)).toContainText('hi = last');
    await load(page, '4 3 2 1');
    await run(page, 'Sort');
    await toEnd(page);
    await expect(narration(page)).toContainText('Sorted: 1, 2, 3, 4.');
  });
});
