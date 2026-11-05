/**
 * The sorts that do not compare values: counting, radix and bucket sort. Every page also runs
 * through all-vizzes.spec.ts.
 */
import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const code = (page: Page) => page.locator('.code');
const form = (page: Page) => page.locator('form.controls');

async function open(page: Page, id: string, title: string) {
  await page.goto(`/${id}/`);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function load(page: Page, values: string) {
  await form(page).getByLabel('Values', { exact: true }).fill(values);
  await form(page).getByRole('button', { name: 'Load', exact: true }).click();
}

async function sort(page: Page) {
  await form(page).getByRole('button', { name: 'Sort', exact: true }).click();
}

/** Jump to the end of the history. Playback can disable the button between check and click. */
async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** Step back until the narration matches, at most `max` steps. */
async function backTo(page: Page, text: string, max = 60) {
  for (let i = 0; i < max; i++) {
    if ((await narration(page).textContent())?.includes(text)) return;
    await page.getByRole('button', { name: 'Step back' }).click();
  }
  await expect(narration(page)).toContainText(text);
}

async function option(page: Page, label: string) {
  const panel = page.locator('details.options');
  if ((await panel.getAttribute('open')) === null) await panel.locator('summary').click();
  await page.getByLabel(label).check();
}

/** Open a practice set, answer the first question from the answer a wrong try reveals, and
 * play it with Show me. */
async function practice(page: Page, id: string, seed: number) {
  await page.goto(`/${id}/#practice=${seed}&n=3`);
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const first = page.locator('.question').first();
  await expect(first.locator('svg')).toBeVisible();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const text = (await feedback.locator('strong').textContent()) ?? '';
  const answer = text.replace(/^Not quite\. The answer is /, '').replace(/\.$/, '');
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer === '(nothing)' ? '' : answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
}

test.describe('counting sort', () => {
  test.beforeEach(({ page }) => open(page, 'counting-sort', 'Counting sort'));

  test('counts, adds up and places from the right', async ({ page }) => {
    await load(page, '3 1 3 0 1 3');
    await sort(page);
    await toEnd(page);
    await expect(narration(page)).toContainText(
      'Sorted: 0, 1, 1, 3, 3, 3. No comparisons at all: 6 counts, 3 additions, 6 placements and 6 copies, 21 steps for n = 6 and k = 3.',
    );
    await expect(stage(page)).toHaveAttribute(
      'aria-label',
      /Array A with 6 values: 0, 1, 1, 3, 3, 3\./,
    );
    await backTo(page, 'A[5] = 3: take 1 from C[3], leaving 5, and put the 3 in B[5].');
    await expect(stage(page)).toHaveAttribute('aria-label', /Counts C\[0\.\.3\]: 1, 3, 3, 5\./);
    await expect(page.locator('.code li.active').last()).toContainText('B[C[A[j]]] = A[j]');
    await expect(page.locator('.vars')).toContainText('comparisons');
  });

  test('bars show the counts, and values out of range are refused', async ({ page }) => {
    await option(page, 'Bars (height shows the value)');
    await expect(code(page)).toContainText('for i = 1 to k: C[i] = C[i] + C[i - 1]');
    await load(page, '3 25');
    await expect(page.getByRole('alert')).toContainText('25 is out of range');
  });

  test('a practice question is graded and played', async ({ page }) => {
    await practice(page, 'counting-sort', 11235);
  });
});

test.describe('radix sort', () => {
  test.beforeEach(({ page }) => open(page, 'radix-sort', 'Radix sort'));

  test('sorts by the last digit first, through buckets', async ({ page }) => {
    await load(page, '21 11 22 12');
    await sort(page);
    await toEnd(page);
    await expect(narration(page)).toContainText(
      'Sorted: 11, 12, 21, 22. 2 passes of 4 values and 10 buckets, and not a single comparison.',
    );
    await backTo(page, 'After pass 1, A is sorted by its last digit: 21, 11, 22, 12.');
    await backTo(
      page,
      'A[3] = 12: its digit worth the 1s is 2, so it goes to the back of bucket 2.',
    );
    await expect(stage(page)).toHaveAttribute('aria-label', /Buckets: 1: 21 11; 2: 22 12\./);
  });

  test('a smaller base means more passes', async ({ page }) => {
    const panel = page.locator('details.options');
    await panel.locator('summary').click();
    await page.getByRole('spinbutton', { name: /^Base/ }).fill('2');
    await page.getByRole('spinbutton', { name: /^Base/ }).press('Tab');
    await expect(code(page)).toContainText('mod 2]');
    await load(page, '13 6 9 2 11 4');
    await sort(page);
    await toEnd(page);
    await expect(narration(page)).toContainText('4 passes of 6 values and 2 buckets');
  });

  test('a practice question is graded and played', async ({ page }) => {
    await practice(page, 'radix-sort', 27182);
  });
});

test.describe('bucket sort', () => {
  test.beforeEach(({ page }) => open(page, 'bucket-sort', 'Bucket sort'));

  test('scatters, sorts each bucket and joins them', async ({ page }) => {
    await sort(page);
    await toEnd(page);
    await expect(narration(page)).toContainText(
      'Sorted: 0.12, 0.17, 0.21, 0.23, 0.26, 0.39, 0.68, 0.72, 0.78, 0.94. Insertion sort made 5 comparisons in all; the fullest bucket held 3 values.',
    );
    await backTo(page, 'A[0] = 0.78: 10 × 0.78 = 7.8, so it goes to the back of bucket 7.');
    await expect(stage(page)).toHaveAttribute('aria-label', /Buckets: 7: 0\.78\./);
    await load(page, '0.5 1.5');
    await expect(page.getByRole('alert')).toContainText('is not a value like 0.78');
  });

  test('whole numbers: one outlier crowds one bucket', async ({ page }) => {
    await option(page, 'Whole numbers, buckets split [min, max]');
    await expect(code(page)).toContainText('floor(n * (v - min) / (max - min + 1))');
    await load(page, '7 3 6 1 5 2 4 99');
    await sort(page);
    await toEnd(page);
    await expect(narration(page)).toContainText('the fullest bucket held 7 values');
  });

  test('a practice question is graded and played', async ({ page }) => {
    await practice(page, 'bucket-sort', 31416);
  });
});
