/**
 * Sorting and searching pages: load values, run the algorithm, change a textbook variant,
 * load a curated example. Every page also runs through all-vizzes.spec.ts.
 */
import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const code = (page: Page) => page.locator('.code');

async function open(page: Page, id: string, title: string) {
  await page.goto(`/${id}/`);
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
  const panel = page.locator('details.options');
  if ((await panel.getAttribute('open')) === null) await panel.locator('summary').click();
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

test.describe('selection sort', () => {
  test.beforeEach(({ page }) => open(page, 'selection-sort', 'Selection sort'));

  test('says when equal values change order', async ({ page }) => {
    await load(page, '27 27 9 41 33');
    await run(page, 'Sort');
    await toEnd(page);
    await expect(narration(page)).toContainText('10 comparisons and 4 swaps');
    await expect(narration(page)).toContainText('The two 27s ended up in the opposite order');
    await expect(page.locator('.vars')).toContainText('swaps');
  });

  test('selecting the maximum mirrors the code', async ({ page }) => {
    await option(page, 'The maximum, which goes to the end');
    await expect(code(page)).toContainText('swap A[last] and A[max]');
    await load(page, '3 1 2');
    await run(page, 'Sort');
    await toEnd(page);
    await backTo(page, 'Swap A[2] = 2 with A[max] = 3.');
  });
});

test.describe('insertion sort', () => {
  test.beforeEach(({ page }) => open(page, 'insertion-sort', 'Insertion sort'));

  test('lifts the key and drops it into the gap', async ({ page }) => {
    await load(page, '3 1 2');
    await run(page, 'Sort');
    await toEnd(page);
    await expect(narration(page)).toContainText('That took 3 comparisons and 2 shifts.');
    await backTo(page, 'A[1] = key: 2 drops into the gap.');
    await expect(page.locator('.code li.active')).toContainText('A[j + 1] = key');
    await expect(stage(page)).toHaveAttribute('aria-label', /Array A with 3 values: 1, 2, 3\./);
    await backTo(page, 'key = 2: lift it out');
    await expect(stage(page)).toHaveAttribute('aria-label', /key = 2, held outside the array/);
  });

  test('swapping instead of shifting changes the code', async ({ page }) => {
    await option(page, 'Swapping the new value with its left neighbor');
    await expect(code(page)).toContainText('swap A[j - 1] and A[j]');
    await loadExample(page, 'Swap the new value left');
    await toEnd(page);
    await expect(narration(page)).toContainText('12 comparisons and 7 swaps');
  });
});

test.describe('shell sort', () => {
  test.beforeEach(({ page }) => open(page, 'shell-sort', 'Shell sort'));

  test('sorts with shrinking gaps, one milestone per gap', async ({ page }) => {
    await load(page, '62 83 18 53 7 17 95 86');
    await run(page, 'Sort');
    await toEnd(page);
    await expect(narration(page)).toContainText('That took 18 comparisons and 3 shifts.');
    await page.getByRole('combobox', { name: 'Detail' }).selectOption('1');
    await page.getByRole('button', { name: 'Step back' }).click();
    await expect(narration(page)).toContainText('Done with h = 2');
    await page.getByRole('button', { name: 'Step back' }).click();
    await expect(narration(page)).toContainText('Done with h = 4');
  });

  test('the gap sequence option and a preset', async ({ page }) => {
    await option(page, "Knuth's: ..., 40, 13, 4, 1 (each 3h + 1)");
    await expect(code(page)).toContainText('h = floor(h / 3)');
    await page.getByLabel('Start over with', { exact: true }).selectOption({ index: 5 });
    await page.getByRole('button', { name: 'Fill' }).click();
    await run(page, 'Sort');
    await toEnd(page);
    await expect(narration(page)).toContainText('Sorted:');
  });
});

test.describe('merge sort', () => {
  test.beforeEach(({ page }) => open(page, 'merge-sort', 'Merge sort'));

  test('splits, copies into L and R, and merges back', async ({ page }) => {
    await load(page, '30 10 20');
    await run(page, 'Sort');
    await toEnd(page);
    await expect(narration(page)).toContainText('Sorted: 10, 20, 30.');
    await backTo(page, 'merge(A, 0, 1, 2): copy A[0..1] into L and A[2] into R.', 30);
    await expect(stage(page)).toHaveAttribute('aria-label', /Auxiliary copies: 10, 30, 20\./);
    await expect(page.locator('.vars')).toContainText('depth');
  });

  test('bottom-up merges runs with loops', async ({ page }) => {
    await option(page, 'Bottom-up: merge runs of 1, 2, 4, ... with loops');
    await expect(code(page)).toContainText('width = 2 * width');
    await loadExample(page, 'Bottom-up: runs of 1, 2, 4, 8');
    await toEnd(page);
    await expect(narration(page)).toContainText('Sorted: 8, 19, 25, 33, 47, 52, 61, 74.');
  });
});

test.describe('quicksort', () => {
  test.beforeEach(({ page }) => open(page, 'quick-sort', 'Quicksort'));

  test('partitions around the pivot and places it', async ({ page }) => {
    await load(page, '30 10 20');
    await run(page, 'Sort');
    await toEnd(page);
    await expect(narration(page)).toContainText('Sorted: 10, 20, 30.');
    await backTo(page, 'Partition done: 20 is in its final place, A[1].', 30);
    await expect(page.locator('.vars')).toContainText('depth');
  });

  test('sorted input with the last pivot is the worst case', async ({ page }) => {
    await loadExample(page, 'Sorted input, last value as pivot: the worst case');
    await toEnd(page);
    await expect(narration(page)).toContainText('28 comparisons');
    await expect(narration(page)).toContainText('7 levels deep');
  });

  test("Hoare's partition changes the code", async ({ page }) => {
    await option(page, "Hoare's: two indices walk toward each other");
    await expect(code(page)).toContainText('hoarePartition(A, p, r)');
    await option(page, 'Median of first, middle and last');
    await expect(code(page)).toContainText('swap A[p] and A[median3(p, r)]');
  });
});

test.describe('quickselect', () => {
  test.beforeEach(({ page }) => open(page, 'quickselect', 'Quickselect'));

  test('finds the k-th smallest value', async ({ page }) => {
    await form(page).getByLabel('Values or k').fill('2');
    await run(page, 'Select');
    await toEnd(page);
    await expect(narration(page)).toContainText(
      'select(2) returns 17, the 2nd smallest of the 6 values.',
    );
    await expect(page.locator('.vars')).toContainText('result');
  });

  test('explains a k that is out of range', async ({ page }) => {
    await form(page).getByLabel('Values or k').fill('9');
    await run(page, 'Select');
    await expect(narration(page)).toContainText('k must be between 1 (the smallest) and 6');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('the worst case example and the Hoare option', async ({ page }) => {
    await loadExample(page, 'Sorted input, last value as pivot, k = 1: the worst case');
    await toEnd(page);
    await expect(narration(page)).toContainText(
      'select(1) returns 10, the smallest of the 8 values.',
    );
    await option(page, "Hoare's: two indices walk toward each other");
    await expect(code(page)).toContainText('return quickselect(A, p, q, k)');
  });
});

test.describe('linear search', () => {
  test.beforeEach(({ page }) => open(page, 'linear-search', 'Linear search'));

  test('finds the value and returns its index', async ({ page }) => {
    await form(page).getByLabel('Values or x').fill('35');
    await run(page, 'Search');
    await toEnd(page);
    await expect(narration(page)).toContainText('Yes: found 35 at index 4. Return 4.');
    await expect(stage(page)).toHaveAttribute('aria-label', /x = 35, held outside the array\./);
    await expect(page.locator('.vars')).toContainText('result');
  });

  test('a miss checks every value, and a sentinel saves the index checks', async ({ page }) => {
    await form(page).getByLabel('Values or x').fill('50');
    await run(page, 'Search');
    await toEnd(page);
    await expect(narration(page)).toContainText('none is 50. Return -1.');
    await loadExample(page, 'A sentinel saves the index checks');
    await toEnd(page);
    await expect(narration(page)).toContainText('A[6] is the sentinel');
    await expect(stage(page)).toHaveAttribute('aria-label', /Sentinel 50 in A\[6\]\./);
    await expect(code(page)).toContainText('A[n] = x');
  });
});

test.describe('binary search', () => {
  test.beforeEach(({ page }) => open(page, 'binary-search', 'Binary search'));

  test('halves the window until it finds x', async ({ page }) => {
    await form(page).getByLabel('Values or x').fill('42');
    await run(page, 'Search');
    await toEnd(page);
    await expect(narration(page)).toContainText('A[6] = 42 is x. Found it: return 6.');
    await expect(stage(page)).toHaveAttribute(
      'aria-label',
      /lo at index 6, mid at index 6, hi at index 6\./,
    );
    await expect(page.locator('.vars')).toContainText('probes');
  });

  test('refuses unsorted values until they are sorted', async ({ page }) => {
    await load(page, '42 17 63 8 35 24');
    await expect(narration(page)).toContainText('A is not sorted: A[0] = 42 comes before');
    await form(page).getByLabel('Values or x').fill('35');
    await run(page, 'Search');
    await expect(narration(page)).toContainText('Press Sort A to sort it first');
    await run(page, 'Sort A');
    await toEnd(page);
    await expect(narration(page)).toContainText('Sorted A with a library sort: 8, 17, 24, 35');
    await form(page).getByLabel('Values or x').fill('35');
    await run(page, 'Search');
    await toEnd(page);
    await expect(narration(page)).toContainText('Found it: return 3.');
  });

  test('lower bound and the recursive style change the code', async ({ page }) => {
    await option(page, 'Lower bound: the first value ≥ x');
    await expect(code(page)).toContainText('lo = 0; hi = n');
    await option(page, 'Recursive: a call for each half');
    await expect(code(page)).toContainText('return lowerBound(A, x, mid + 1, hi)');
    await loadExample(page, 'Recursive: one call per probe');
    await toEnd(page);
    await expect(narration(page)).toContainText(
      'Every call passes -1 back up, so search(A, x, 0, 19) returns -1',
    );
  });
});
