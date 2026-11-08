import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const coins = (page: Page) => stage(page).locator('circle').count();
const errors = (page: Page) => stage(page).locator('rect.role-error').count();

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/**
 * A run is one operation in the history, so go to the end of its n-th append or increment with
 * the Milestones detail level (one step per append), from the start.
 */
async function milestone(page: Page, n: number) {
  await page.getByRole('combobox', { name: 'Detail' }).selectOption('1');
  await page.getByRole('slider', { name: 'Timeline' }).press('Home');
  for (let i = 0; i < n; i++) await button(page, 'Step forward').click();
}

async function run(page: Page, k: string) {
  await page.getByLabel('k', { exact: true }).fill(k);
  await button(page, 'Run k operations').click();
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

/** Text in the drawing that runs past the drawing's left or right edge. */
const textOutside = (page: Page) =>
  stage(page).evaluate((svg) => {
    const box = svg.getBoundingClientRect();
    return Array.from(svg.querySelectorAll('text'))
      .map((t) => t.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1)).length;
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/amortized-analysis/');
  await expect(
    page.getByRole('heading', { name: 'Amortized analysis', exact: true }),
  ).toBeVisible();
});

test('the page opens on sixteen appends paid for with coins', async ({ page }) => {
  await expect(narration(page)).toContainText('16 appends cost 31 in all');
  await expect(narration(page)).toContainText(
    'The bank never went below zero: 17 coins left over.',
  );
  await expect(page.locator('.narration .muted')).toHaveText(/^Step (\d+) of \1$/);
  await expect(stage(page)).toHaveAttribute('aria-label', /size 16, capacity 16/);
  await expect(page.locator('.vars')).toContainText(/bank\s*17/);
  await settled(page);
  // One coin per unit in the bank: they sit on the cells.
  await expect.poll(() => coins(page)).toBe(17);
  await page.getByRole('slider', { name: 'Timeline' }).press('Home');
  await expect(narration(page)).toContainText('An empty dynamic array, with no slots yet.');
  await settled(page);
  await expect.poll(() => coins(page)).toBe(0);
});

test('a charge of 2 runs out on the fifth append', async ({ page }) => {
  await fast(page);
  await page.getByRole('tab', { name: 'Learn' }).click();
  // The lesson links it, and so does "Try this".
  await page.getByRole('link', { name: 'Two coins per append run out' }).first().click();
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'The bank first went below zero at append 5, so a charge of 2 is not enough.',
  );
  await expect(stage(page)).toHaveAttribute('aria-label', /after 8 appends/);
  // Back on the fifth append: the bank is short, and the page says so.
  await milestone(page, 5);
  await expect(narration(page)).toContainText('a charge of 2 per append is too small');
  await expect(page.locator('.vars')).toContainText(/bank\s*-2/);
  await settled(page);
  // The bank's bar for append 5 hangs below zero, and the readout is marked.
  await expect.poll(() => errors(page)).toBeGreaterThanOrEqual(2);
  await expect(
    stage(page).locator('text.role-error', { hasText: 'bank = −2 (short)' }),
  ).toHaveCount(1);
  await button(page, 'Step back').click();
  await expect(narration(page)).toContainText('Bank: 1 coin.');
});

test('the counter: two amortized per increment, with the potential', async ({ page }) => {
  await options(page, 'Binary counter: increment', 'Potential: actual cost + change in Φ');
  await expect(narration(page)).toContainText(
    'The amortized costs add up to 32, against an actual 31',
  );
  await expect(stage(page)).toHaveAttribute('aria-label', /00010000, which is 16/);
  await expect(page.locator('.vars')).toContainText(/Φ\s*1/);
  await fast(page);
  await run(page, '15');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /00011111, which is 31/);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('so the amortized cost is 1 + 1 = 2.');
});

test('growing by 4 makes the average climb past 3', async ({ page }) => {
  await options(page, 'Aggregate: total cost ÷ number of operations', 'capacity + 4 (a constant)');
  await fast(page);
  await run(page, '16');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Over all 32 appends so far: 144, which is 4.5 per append.',
  );
  await expect(page.locator('.vars')).toContainText(/average\s*4\.5/);
  await options(page, '2 × capacity');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Over all 32 appends so far: 63, which is 1.97 per append.',
  );
});

test('bad input and the page limit are explained', async ({ page }) => {
  await run(page, '40');
  await expect(page.getByRole('alert')).toContainText('Pick k from 1 to 32.');
  await run(page, 'ten');
  await expect(page.getByRole('alert')).toContainText('k must be a whole number');
  await fast(page);
  await run(page, '20');
  await expect(narration(page)).toContainText('Only 16 more fit');
  await toEnd(page);
  await button(page, 'One more').click();
  await expect(narration(page)).toContainText('This page stops at 32 operations');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await fast(page);
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  // It plays all 32 appends; jump to the end instead of watching them.
  await toEnd(page);
  await expect(narration(page)).toContainText('32 appends cost 63 in all');
  await expect(stage(page)).toHaveAttribute('aria-label', /after 32 appends/);
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/amortized-analysis/#practice=24680&n=4');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /(Dynamic array|Binary counter) after/);
});

test('the biggest drawing fits, with a wide font too', async ({ page }) => {
  // Growing by 1.5 to 41 slots draws three rows of cells and 32 bars.
  await options(page, '⌈1.5 × capacity⌉', 'Potential: actual cost + change in Φ');
  await fast(page);
  await run(page, '16');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /size 32, capacity 41/);
  await settled(page);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  // Cells stay at least 12 CSS pixels wide.
  const widths = await stage(page)
    .locator('rect.cell.live')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  expect(widths).toHaveLength(32);
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(12);
  // CI's default font (DejaVu Sans) is wider: the page must still fit, and no text may run
  // off the drawing.
  await page.addStyleTag({
    content: ":root { --font: 'DejaVu Sans', Verdana, sans-serif !important; }",
  });
  for (const labels of [
    [],
    ['Binary counter: increment', 'Accounting: charge coins, bank the spares'],
  ]) {
    if (labels.length) {
      await options(page, ...labels);
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
    await options(page, '2 coins');
    // Mid-copy on the fifth append: coins being spent, and the bank going short.
    await milestone(page, 4);
    await page.getByRole('combobox', { name: 'Detail' }).selectOption('3');
    for (let i = 0; i < 5; i++) await button(page, 'Step forward').click();
    await expect(narration(page)).toContainText('the bank is short, at −1');
    await settled(page);
    let results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await options(page, 'Binary counter: increment');
    await page.getByRole('slider', { name: 'Timeline' }).press('End');
    await settled(page);
    results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
