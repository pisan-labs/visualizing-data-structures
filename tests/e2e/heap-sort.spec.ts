import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const vars = (page: Page) => page.locator('.vars');
const form = (page: Page) => page.locator('form.controls');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function load(page: Page, values: string) {
  await form(page).getByLabel('Values').fill(values);
  await form(page).getByRole('button', { name: 'Load', exact: true }).click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function stepUntil(page: Page, text: string) {
  const back = page.getByRole('button', { name: 'Step back' });
  for (let i = 0; i < 80; i++) {
    if (((await narration(page).textContent()) ?? '').includes(text)) return;
    await back.click();
  }
  throw new Error(`no step says "${text}"`);
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
  await page.goto('/heap-sort/');
  await expect(page.getByRole('heading', { name: 'Heap sort', exact: true })).toBeVisible();
});

test('builds a max-heap, then sorts and counts the work', async ({ page }) => {
  await fast(page);
  await load(page, '5 3 8 1');
  await expect(narration(page)).toContainText('Loaded 4 values into A: 5, 3, 8, 1.');
  await form(page).getByRole('button', { name: 'Sort', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Sorted: 1, 3, 5, 8. That took 6 comparisons and 6 swaps.',
  );
  await expect(stage(page)).toHaveAttribute('aria-label', /Array A with 4 values: 1, 3, 5, 8\./);
  await stepUntil(page, 'so A is now a max-heap');
  await expect(vars(page)).toContainText(/heapSize\s*=?\s*4/);
  await expect(stage(page)).toHaveAttribute('aria-label', /8, 3, 5, 1/);
});

test('phase 2 swaps the root to the end and sifts the new root down', async ({ page }) => {
  await example(page, 'Build a max-heap from the bottom up');
  await fast(page);
  await toEnd(page);
  await expect(narration(page)).toContainText('42 comparisons and 30 swaps');
  await stepUntil(page, 'heapSize = 9: 16 leaves the heap');
  await expect(page.locator('.code li.active')).toContainText(['heapSize = heapSize − 1']);
  await expect(stage(page)).toHaveAttribute('aria-label', /The heap is A\[1\.\.9\]/);
  // The sorted value fades in the tree: its node is drawn as done.
  await expect(stage(page).locator('circle[class*="role-done"]')).toHaveCount(1);
});

test('the indexing option changes the code, the narration and the labels', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('From 0: children of i are 2i + 1 and 2i + 2').check();
  await expect(page.locator('.code')).toContainText('l = 2i + 1; r = 2i + 2');
  await fast(page);
  await load(page, '3 1 2');
  await form(page).getByRole('button', { name: 'Sort', exact: true }).click();
  await toEnd(page);
  await stepUntil(page, 'A[1..2] are leaves');
});

test('reverse-sorted input is already a heap, and equal values change order', async ({ page }) => {
  await example(page, 'Reverse sorted: already a max-heap');
  await fast(page);
  await toEnd(page);
  await expect(narration(page)).toContainText('18 comparisons and 11 swaps');
  await stepUntil(page, 'Building it took 6 comparisons and no swaps');
  await example(page, 'Equal values can change order');
  await toEnd(page);
  await expect(narration(page)).toContainText('The two 7s ended up in the opposite order');
});

test('a practice set grades an answer and shows it', async ({ page }) => {
  await page.goto('/heap-sort/#practice=4242&n=5');
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const verdict = (await feedback.locator('strong').textContent()) ?? '';
  const answer = verdict.match(/The answer is (.+)\.$/)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /Array A with \d+ values/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Sorted input' }).first().click();
  await expect(
    page.getByText('Loaded "Sorted input: every value sinks while building"'),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-sort and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await load(page, '42 17 63 8 35 24 91 5 77 13 58 30 86 2 49 70 21 95 38 66');
    await form(page).getByRole('button', { name: 'Sort', exact: true }).click();
    await toEnd(page);
    await stepUntil(page, 'so swap them');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
