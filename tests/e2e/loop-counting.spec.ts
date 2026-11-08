import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const svgText = (page: Page, text: string | RegExp) =>
  stage(page).locator('text', { hasText: text });
/** Lit cells: the counted line's box on the code card is drawn lit too, so leave it out. */
const litCells = async (page: Page) => (await stage(page).locator('rect.role-done').count()) - 1;

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function run(page: Page, n: string, op = 'Run') {
  await page.getByLabel('n', { exact: true }).fill(n);
  await button(page, op).click();
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

test.beforeEach(async ({ page }) => {
  await page.goto('/loop-counting/');
  await expect(
    page.getByRole('heading', { name: 'Counting steps in loops', exact: true }),
  ).toBeVisible();
});

test('the page opens on the triangle, counted and simplified', async ({ page }) => {
  await expect(narration(page)).toContainText('Half a square is still a square.');
  await expect(narration(page)).toContainText('So the count is O(n²).');
  await expect(page.locator('.narration .muted')).toHaveText(/^Step (\d+) of \1$/);
  await expect(stage(page)).toHaveAttribute('aria-label', /36 of 64 cells lit, count = 36/);
  await expect(svgText(page, /^T\(8\) = 8·9\/2 = 36 ✓$/)).toHaveCount(1);
  await page.getByRole('slider', { name: 'Timeline' }).press('Home');
  await settled(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /Not run yet/);
  await expect(svgText(page, 'count = count + 1')).toHaveCount(1);
});

test('a run lights one cell per run of the line, and the formula agrees', async ({ page }) => {
  await options(page, 'Nested: for i = 1 to n, for j = 1 to n');
  await fast(page);
  await run(page, '5');
  await toEnd(page);
  await expect(narration(page)).toContainText('So the count is O(n²).');
  await expect(page.locator('.vars')).toContainText(/count\s*25T/);
  await settled(page);
  await expect.poll(() => litCells(page)).toBe(25);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('T(5) = 5·5 = 25, the same as the run.');
});

test('a doubling outer loop with a dependent inner loop is only linear', async ({ page }) => {
  await options(page, 'Outer loop doubles: i = 1, 2, 4, …, for j = 1 to i');
  await fast(page);
  await run(page, '16');
  await toEnd(page);
  await expect(narration(page)).toContainText('So the count is O(n).');
  await expect(stage(page)).toHaveAttribute('aria-label', /31 of 80 cells lit/);
  await expect(svgText(page, /^T\(16\) = 2⁵ − 1 = 31 ✓$/)).toHaveCount(1);
});

test('the early exit has a best and a worst case', async ({ page }) => {
  await options(page, 'Early exit: look for x in A', 'First in A (the best case)');
  await fast(page);
  await run(page, '8');
  await toEnd(page);
  await expect(narration(page)).toContainText('that is only the best case');
  await expect(page.locator('.vars')).toContainText(/count\s*1T/);
  await expect(svgText(page, /^x = 17$/)).toHaveCount(1);
  await options(page, 'Not in A (the worst case)');
  await toEnd(page);
  await expect(page.locator('.vars')).toContainText(/count\s*8T/);
  await expect(narration(page)).toContainText('An early exit does not help the worst case.');
});

test('Grow doubles n three times and reads the order from the ratios', async ({ page }) => {
  await fast(page);
  await run(page, '4', 'Grow: n, 2n, 4n, 8n');
  await toEnd(page);
  await expect(narration(page)).toContainText('the count grows about ×4 (×3.88 the last time)');
  await expect(stage(page)).toHaveAttribute('aria-label', /n = 32: 528/);
  for (const r of ['×3.6', '×3.78', '×3.88']) await expect(svgText(page, r)).not.toHaveCount(0);
  await options(page, 'Halving: i = n, while i > 1, i = i / 2');
  await toEnd(page);
  await expect(narration(page)).toContainText('The counts went 2, 3, 4 and 5');
});

test('bad input is explained', async ({ page }) => {
  await run(page, '17');
  await expect(page.getByRole('alert')).toContainText('Pick n from 1 to 16.');
  await run(page, 'ten');
  await expect(page.getByRole('alert')).toContainText('n must be a whole number');
  await options(page, 'Three nested loops: i ≤ j ≤ k');
  await run(page, '9');
  await expect(narration(page)).toContainText('The triple loop is drawn for n up to 6');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await fast(page);
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText('O(n²)', { timeout: 20_000 });
  await expect(stage(page)).toHaveAttribute('aria-label', /The nested loops for n = 6/);
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/loop-counting/#practice=24680&n=4');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /(cells lit|Counts for)/);
});

test('sixteen by sixteen stays readable and fits, with a wide font too', async ({ page }) => {
  await options(page, 'Nested: for i = 1 to n, for j = 1 to n');
  await fast(page);
  await run(page, '16');
  await toEnd(page);
  await expect(narration(page)).toContainText('So the count is O(n²).');
  await settled(page);
  await expect.poll(() => litCells(page)).toBe(256);
  // Every cell is at least 12 CSS pixels wide, and every header at least 8 pixels tall.
  const cellWidths = await stage(page)
    .locator('rect.role-done')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  expect(Math.min(...cellWidths)).toBeGreaterThanOrEqual(12);
  const headers = await svgText(page, /^16$/).evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().height),
  );
  expect(Math.min(...headers)).toBeGreaterThanOrEqual(8);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  // CI's default font (DejaVu Sans) is wider: the page must still fit, and no text may run
  // off the drawing.
  await page.addStyleTag({
    content: ":root { --font: 'DejaVu Sans', Verdana, sans-serif !important; }",
  });
  for (const step of ['end', 'grow']) {
    if (step === 'grow') {
      await run(page, '16', 'Grow: n, 2n, 4n, 8n');
      await toEnd(page);
    }
    await settled(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const outside = await stage(page).evaluate((svg) => {
      const box = svg.getBoundingClientRect();
      return Array.from(svg.querySelectorAll('text'))
        .map((t) => t.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1)).length;
    });
    expect(outside).toBe(0);
  }
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'Early exit: look for x in A', 'In the middle of A');
    await fast(page);
    await run(page, '9');
    await toEnd(page);
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    let results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await run(page, '4', 'Grow: n, 2n, 4n, 8n');
    await toEnd(page);
    await settled(page);
    results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
