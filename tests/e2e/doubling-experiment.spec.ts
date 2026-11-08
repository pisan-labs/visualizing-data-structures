/**
 * Doubling experiments: the page opens on a finished experiment with a checked prediction, a
 * run fills one row (and one point) per size, 3-sum from tiny n shows the lower-order terms,
 * the least-squares fit drags b, merge sort's b slides, noise makes ratios jump, bad input is
 * explained, and the drawing fits with a wide font. The page also runs through
 * all-vizzes.spec.ts. Most algorithms take random inputs from the session's seed, so tests
 * that read exact numbers use 3-sum (its count is the same for every input) or a curated
 * example (a fixed seed).
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const svgText = (page: Page, text: string | RegExp) =>
  stage(page).locator('text', { hasText: text });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
/** The measured points and the reading that checks a guess: filled circles. */
const dots = (page: Page) => stage(page).locator('circle.arrowhead');

async function op(page: Page, name: 'Run from n' | 'Predict T(n)', n: string) {
  await page.getByLabel('n', { exact: true }).fill(n);
  await button(page, name).click();
}

/** Jump to the end of the history. Playback can disable the button between check and click. */
async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** Open Options, pick settings by their radio labels, and close it again. */
async function options(page: Page, ...labels: string[]) {
  const summary = page.locator('summary', { hasText: 'Options' });
  await summary.click();
  for (const l of labels) await page.getByRole('radio', { name: l }).check();
  await summary.click();
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Texts drawn past the left or right edge of the drawing. */
const textOutside = (page: Page) =>
  stage(page).evaluate((svg) => {
    const box = svg.getBoundingClientRect();
    return Array.from(svg.querySelectorAll('text'))
      .map((t) => t.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1)).length;
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/doubling-experiment/');
  await expect(
    page.getByRole('heading', { name: 'Doubling experiments', exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('the page opens on a finished experiment and a checked prediction', async ({ page }) => {
  await expect(narration(page)).toContainText('Check: run it at n = 20,000:');
  await expect(narration(page)).toContainText(/The guess was (\d+\.\d% (high|low)|spot on)\./);
  await expect(page.locator('.narration .muted')).toHaveText(/^Step (\d+) of \1$/);
  await expect(stage(page)).toHaveAttribute('aria-label', /n = 12,800: [\d,]+, b = [12]\.\d\d/);
  await expect(stage(page)).toHaveAttribute('aria-label', /Guess T\(20,000\) ≈ [\d,]+, measured/);
  await settled(page);
  // Eight sizes and the reading at the guess; the guess itself is a ring.
  await expect.poll(() => dots(page).count()).toBe(9);
  await expect(stage(page).locator('circle:not(.arrowhead)')).toHaveCount(1);
  await expect(svgText(page, /^T\(n\) ≈ 0\.\d+·n\^[12]\.\d\d$/)).toHaveCount(1);
  await expect(svgText(page, /^slope b = [12]\.\d\d$/)).toHaveCount(1);
  await expect(page.locator('.vars')).toContainText('error');
});

test('a run measures one size per step, and small n hides the exponent', async ({ page }) => {
  await options(page, 'Brute-force 3-sum: every triple');
  await op(page, 'Run from n', '3');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'b settles near 3 (4.32, 3.46, 3.20, 3.10, 3.05, 3.02 and 3.01)',
  );
  await expect(narration(page)).toContainText('at n = 3 the lower-order terms still count');
  await settled(page);
  await expect.poll(() => dots(page).count()).toBe(8);
  for (const b of [/^4\.32$/, /^3\.46$/, /^3\.01$/]) await expect(svgText(page, b)).toHaveCount(1);

  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Fit: take b from the last row, 3.01, then a =');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText(
    'n = 384: 9,363,584 triples checked. That is 8.06 times T(192), so b = log₂ 8.06 = 3.01.',
  );
  await expect(page.locator('.vars')).toContainText('8.06');
  // The slope triangle on the newest segment: n × 2 across, T × 8.06 up.
  await expect(svgText(page, /^×2$/)).toHaveCount(1);
  await expect(svgText(page, /^×8\.06$/)).toHaveCount(1);
  await expect(stage(page).locator('polygon')).toHaveCount(1);
});

test('fitting every point drags b, and the prediction misses', async ({ page }) => {
  await options(page, 'Brute-force 3-sum: every triple', 'A least-squares line through every size');
  await op(page, 'Run from n', '3');
  await op(page, 'Predict T(n)', '1000');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Check: run it at n = 1,000: 166,167,000 triples checked. The guess was 64.4% high.',
  );
  await settled(page);
  await expect(svgText(page, 'slope b = 3.24')).toHaveCount(1);
  await expect(svgText(page, 'least-squares line through every row')).toHaveCount(1);
  await expect(stage(page).locator('circle.role-error')).toHaveCount(1);
  await options(page, 'The last two sizes (Sedgewick and Wayne)');
  await expect(narration(page)).toContainText('The guess was');
  await expect(narration(page)).not.toContainText('64.4%');
});

test('merge sort reads as n^1.1 and keeps sliding', async ({ page }) => {
  await options(page, 'Merge sort on random input');
  await op(page, 'Run from n', '1000');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    /so b reads 1\.\d\d and is still sliding down .*a doubling test cannot see a log factor/,
  );
  await settled(page);
  await expect.poll(() => dots(page).count()).toBe(8);
  // The reading marks the b column.
  await expect(stage(page).locator('text.role-active')).toHaveCount(7);
});

test('noise makes single ratios jump, and says so', async ({ page }) => {
  await options(page, 'On: one timed run per size');
  await op(page, 'Run from n', '10');
  await toEnd(page);
  await expect(narration(page)).toContainText('With noise on, b went');
  await expect(narration(page)).toContainText('The true count grows like n².');
  await expect(svgText(page, 'T(n): one timed run per size, with noise')).toHaveCount(1);
  await options(page, 'On: the median of 5 timed runs per size');
  await expect(narration(page)).toContainText('with one run per size, b would have gone');
  await page.getByRole('button', { name: 'Step back' }).click();
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText(/five timed runs read .*; their median is/);
  await expect(page.locator('.vars')).toContainText('true count');
});

test('bad input is explained', async ({ page }) => {
  await op(page, 'Run from n', 'ten');
  await expect(page.getByRole('alert')).toContainText('n must be a whole number');
  await options(page, 'Brute-force 3-sum: every triple');
  await op(page, 'Run from n', '5000');
  await expect(narration(page)).toContainText(
    'Pick a starting n from 3 to 1,000 for brute-force 3-sum. Nothing changed.',
  );
  await op(page, 'Run from n', '600');
  await toEnd(page);
  await expect(narration(page)).toContainText('Start smaller to get a ratio.');
  await op(page, 'Predict T(n)', '800');
  await expect(narration(page)).toContainText('Run an experiment first');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText('b settles near 2', { timeout: 20_000 });
  await expect(stage(page)).toHaveAttribute('aria-label', /n = 12,800: 40,635,840, b = 1\.99/);
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/doubling-experiment/#practice=24680&n=3');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\.(\s|$)/)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /Doubling experiment, seed \d+: n = /);
});

test('the table and the plot fit, with a wide font too', async ({ page }) => {
  await options(page, 'Brute-force 3-sum: every triple');
  await op(page, 'Run from n', '3');
  await op(page, 'Predict T(n)', '1000');
  await toEnd(page);
  await settled(page);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  // Every table row is at least 9 CSS pixels tall on screen, phone included.
  const heights = await svgText(page, /^\d{1,3}(,\d{3})*$/).evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().height),
  );
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(9);
  // CI's default font (DejaVu Sans) is wider: the page must still fit, and no text may run
  // off the drawing.
  await page.addStyleTag({
    content: ":root { --font: 'DejaVu Sans', Verdana, sans-serif !important; }",
  });
  for (const n of ['1000', '20000']) {
    if (n === '20000') {
      await options(page, 'Insertion sort on random input', 'On: one timed run per size');
      await op(page, 'Predict T(n)', n);
      await toEnd(page);
    }
    await settled(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await expect.poll(() => textOutside(page)).toBe(0);
  }
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'On: the median of 5 timed runs per size');
    await op(page, 'Run from n', '100');
    await toEnd(page);
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    let results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
    await op(page, 'Predict T(n)', '20000');
    await toEnd(page);
    await settled(page);
    results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
