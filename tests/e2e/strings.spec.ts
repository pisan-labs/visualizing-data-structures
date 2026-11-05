/**
 * String-matching pages: load a text and a pattern, search, go one alignment at a time, read
 * the drawing on a phone, answer a practice question, and compare two matchers. Every page also
 * runs through all-vizzes.spec.ts.
 */
import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const form = (page: Page) => page.locator('form.controls');

async function open(page: Page, id: string, title: string) {
  await page.goto(`/${id}/`);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function load(page: Page, text: string) {
  await form(page).getByLabel('Text / pattern', { exact: true }).fill(text);
  await form(page).getByRole('button', { name: 'Load', exact: true }).click();
}

async function press(page: Page, button: string) {
  const more = form(page).locator('details.more');
  const target = form(page).getByRole('button', { name: button, exact: true });
  if (!(await target.isVisible()) && (await more.count())) await more.locator('summary').click();
  await target.click();
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

/** The smallest character drawn in a text or pattern cell, in screen pixels. */
function smallestLetter(page: Page) {
  return page.evaluate(() => {
    const svg = document.querySelector('.stage > svg') as SVGSVGElement;
    const scale = svg.getScreenCTM()!.a;
    const letters = [...svg.querySelectorAll('text')].filter(
      (t) =>
        t.getAttribute('font-weight') === '700' &&
        !t.classList.contains('label') &&
        /^[A-Z]$/.test(t.textContent ?? ''),
    );
    return Math.min(...letters.map((t) => Number(t.getAttribute('font-size')) * scale));
  });
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
  await first.getByRole('button', { name: 'Show me' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
}

test.describe('Brute-force string search', () => {
  test.beforeEach(({ page }) => open(page, 'brute-force-search', 'Brute-force string search'));

  test('finds every match and counts the comparisons', async ({ page }) => {
    await load(page, 'abracadabra / abra');
    await expect(narration(page)).toContainText(
      "T = 'abracadabra', 11 characters, and P = 'abra', 4 characters.",
    );
    await press(page, 'Search');
    await toEnd(page);
    await expect(narration(page)).toContainText(
      'Done. P occurs at shifts 0, 7. Brute force tried all 8 shifts and made 16 comparisons',
    );
    await expect(stage(page)).toHaveAttribute('aria-label', /Found at shifts 0 and 7\./);
    await expect(page.locator('.vars')).toContainText('comparisons');
    await backTo(page, 'Shift 3 fails: 1 character matched before T[4] ≠ P[1].');
    await expect(page.locator('.code li.active').filter({ hasText: 'if j == m' })).toHaveCount(1);
  });

  test('goes one shift at a time, and the text pointer goes back', async ({ page }) => {
    await press(page, 'Next alignment');
    await toEnd(page);
    await expect(narration(page)).toContainText('Shift 0 fails: the first characters differ.');
    await press(page, 'Next alignment');
    await toEnd(page);
    await expect(narration(page)).toContainText(
      'Shift 1 fails: 5 characters matched before T[6] ≠ P[5]. That took 6 comparisons. Slide P one place, to s = 2. The text pointer goes back 4 places, from T[6] to T[2]',
    );
    await expect(stage(page)).toHaveAttribute('aria-label', /Next shift: 2\./);
  });

  test('explains input it cannot read, and keeps the old text', async ({ page }) => {
    await load(page, 'two words / here / too');
    await expect(page.getByRole('alert')).toContainText('Use one slash');
    await load(page, 'ABAB');
    await expect(narration(page)).toContainText("P = 'ABAB', 4 characters. The text stays");
  });

  test('keeps 24 characters readable', async ({ page }) => {
    await load(page, 'ABCDABCDABCDABCDABCDABCD / ABCDAB');
    await press(page, 'Search');
    await toEnd(page);
    await expect(narration(page)).toContainText('P occurs at shifts 0, 4, 8, 12, 16');
    await expect.poll(() => smallestLetter(page)).toBeGreaterThanOrEqual(11);
  });

  test('a practice question is graded and played', async ({ page }) => {
    await practice(page, 'brute-force-search', 24680);
  });
});

test.describe('Knuth-Morris-Pratt', () => {
  test.beforeEach(({ page }) => open(page, 'kmp', 'Knuth-Morris-Pratt'));

  test('builds π, then slides past what matched without going back', async ({ page }) => {
    await press(page, 'Search');
    await toEnd(page);
    await expect(narration(page)).toContainText(
      'Done. P occurs at shifts 3, 9. Matching made 16 comparisons in 4 alignments; building π made 7.',
    );
    await expect(stage(page)).toHaveAttribute('aria-label', /π = 0, 0, 1, 2, 3, 0\./);
    await backTo(page, "Shift 1 matched 'ABABA', then T[6] ≠ P[5].");
    await expect(narration(page)).toContainText('i stays at 6: compare T[6] with P[3] next.');
    await expect(
      page.locator('.code li.active').filter({ hasText: 's = s + q − π[q − 1]' }),
    ).toHaveCount(1);
    await backTo(page, "π[4] = 3: 'ABA' is the longest proper prefix of P[0..4]");
  });

  test('calls the table the failure function when asked', async ({ page }) => {
    await page.locator('details.options > summary').click();
    await page.getByLabel('f, the failure function').check();
    await expect(page.locator('.code')).toContainText('q = f[q − 1]');
    await press(page, 'Build the table');
    await toEnd(page);
    await expect(narration(page)).toContainText('f is ready: [0, 0, 1, 2, 3, 0]');
  });

  test('a practice question is graded and played', async ({ page }) => {
    await practice(page, 'kmp', 13579);
  });
});

test.describe('Compare mode', () => {
  const sides = (page: Page) => page.locator('.sides > .side');
  const said = (page: Page, i: number) => sides(page).nth(i).locator('.narration p');
  const drawing = (page: Page, i: number) => sides(page).nth(i).locator('.stage > svg');

  test('brute force and KMP run on the same input', async ({ page }) => {
    await page.goto('/brute-force-search/#compare=kmp');
    await expect(
      page.getByRole('heading', { name: 'Brute-force string search vs Knuth-Morris-Pratt' }),
    ).toBeVisible();
    await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
    for (const i of [0, 1])
      await expect(drawing(page, i)).toHaveAttribute(
        'aria-label',
        /Text T = GABABABACABABACG, 16 characters\. Pattern P = ABABAC/,
      );
    await load(page, 'ABRACADABRA / ABRA');
    await form(page).getByRole('button', { name: 'Search', exact: true }).click();
    await toEnd(page);
    await expect(said(page, 0)).toContainText(
      'Done. P occurs at shifts 0, 7. Brute force tried all 8 shifts and made 16 comparisons',
    );
    await expect(said(page, 1)).toContainText(
      'Done. P occurs at shifts 0, 7. Matching made 13 comparisons',
    );
    for (const i of [0, 1])
      await expect(drawing(page, i)).toHaveAttribute(
        'aria-label',
        /Text T = ABRACADABRA.*Found at shifts 0 and 7\./,
      );
  });
});
