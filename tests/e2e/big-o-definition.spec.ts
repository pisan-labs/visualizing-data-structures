/**
 * Big-O, Ω and Θ by definition: the page opens on a witness found for 3n² + 10n + 5, a wrong
 * witness lights its failures red, a finite check that passes says where it breaks past the
 * range, Ω and Θ change the check, the limit test names the limit, bad input is explained, and
 * the drawing reads on a phone. The page also runs through all-vizzes.spec.ts.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('c n₀, or f ; g', { exact: true });
const svgText = (page: Page, text: string | RegExp) =>
  stage(page).locator('text', { hasText: text });

type Button = 'Try c, n₀' | 'Find n₀ for c' | 'Compare f ; g';

async function op(page: Page, name: Button, value: string) {
  await input(page).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

/** Jump to the end of the history. Playback can disable the button between check and click. */
async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function option(page: Page, label: string) {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel(label).check();
  await page.getByText('Options', { exact: true }).click();
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.beforeEach(async ({ page }) => {
  await page.goto('/big-o-definition/');
  await expect(
    page.getByRole('heading', { name: 'Big-O, Ω and Θ by definition', exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('opens on a witness: c = 4 works from n₀ = 11, and the algebra covers the rest', async ({
  page,
}) => {
  await expect(narration(page)).toContainText(
    'The smallest n₀ for c = 4 within 1 to 50 is 11. Past 50, the algebra covers it',
  );
  await expect(page.locator('.narration .muted')).toHaveText(/^Step (\d+) of \1$/);
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Trying c = 4 and n₀ = 11: It holds for every n from 11 to 50\./,
  );
  await settled(page);
  await expect(svgText(page, 'n₀ = 11')).toHaveCount(1);
  // The strip: gray before n₀, green after it, nothing red.
  await expect(stage(page).locator('rect.role-done')).toHaveCount(1);
  await expect(stage(page).locator('rect.role-error')).toHaveCount(0);
  await expect(page.locator('.vars')).toContainText('proved');
});

test('a wrong witness shows every n that breaks it', async ({ page }) => {
  await op(page, 'Try c, n₀', '4 1');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Not a witness: with c = 4 and n₀ = 1, 10 of the 50 values of n from 1 to 50 break it, the first at n = 1.',
  );
  await settled(page);
  await expect(stage(page).locator('polygon.role-error')).toHaveCount(1);
  await expect(stage(page).locator('rect.role-error')).toHaveCount(1);
  await expect(stage(page).locator('rect.role-done')).toHaveCount(1);
  // Step back to the first n looked at, one at a time.
  await page.getByLabel('Detail').selectOption('3');
  await op(page, 'Try c, n₀', '3 1');
  await toEnd(page);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('n = 1: f(1) = 18 > 3·g(1) = 3. That breaks it.');
  await expect(page.locator('.code li.active', { hasText: 'return n' })).toHaveCount(1);
});

test('a range that passes is not a proof: 2ⁿ against n¹⁰ breaks at 59', async ({ page }) => {
  await page
    .getByLabel('Start over with', { exact: true })
    .selectOption({ label: '2ⁿ against n¹⁰' });
  await page.getByRole('button', { name: 'Fill', exact: true }).click();
  await op(page, 'Try c, n₀', '1 2');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'With c = 1 and n₀ = 2, it holds for every n from 2 to 50, the range checked. But it is not true for every n: past 50 it first breaks at n = 59',
  );
  await expect(page.locator('.vars')).toContainText('breaks at n = 59');
  // The values span 17 powers of ten, so the chart switched to a log scale.
  await settled(page);
  await expect(svgText(page, /^10¹⁷$/)).toHaveCount(1);
});

test('finding n₀ says when no n₀ works, and when one lies past the range', async ({ page }) => {
  await op(page, 'Compare f ; g', 'n^2 ; n');
  await op(page, 'Find n₀ for c', '10');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'No n₀ works for c = 10 at all, not even past 50: n² ≤ c·n is the same as n ≤ c.',
  );
  await op(page, 'Compare f ; g', '3n^2 + 10n + 5 ; n^2');
  await op(page, 'Find n₀ for c', '3.1');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'No n₀ up to 50 works for c = 3.1, but one does exist past the range: the algebra gives n₀ = 101.',
  );
});

test('Ω flips the inequality and Θ takes two constants', async ({ page }) => {
  await option(page, 'Ω: 0 ≤ c·g(n) ≤ f(n) for every n ≥ n₀');
  await expect(page.locator('.code')).toContainText('if not 0 ≤ c·g(n) ≤ f(n):');
  await op(page, 'Compare f ; g', 'n log n ; n');
  await op(page, 'Find n₀ for c', '3');
  await toEnd(page);
  await expect(narration(page)).toContainText('The smallest n₀ for c = 3 within 1 to 50 is 8.');
  await expect(narration(page)).toContainText('So f(n) = Ω(g(n)).');

  await option(page, 'Θ: 0 ≤ c₁·g(n) ≤ f(n) ≤ c₂·g(n) for every n ≥ n₀');
  await op(page, 'Compare f ; g', 'n^2/2 - 3n ; n^2');
  await op(page, 'Try c, n₀', '1/14 1/2 7');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'With c₁ = 1/14, c₂ = 1/2 and n₀ = 7, it holds for every n from 7 to 50',
  );
  await expect(narration(page)).toContainText('So f(n) = Θ(g(n)).');
  await settled(page);
  await expect(svgText(page, 'c₁ = 1/14')).toHaveCount(1);
  await expect(svgText(page, 'c₂ = 1/2')).toHaveCount(1);
  await op(page, 'Try c, n₀', '1/14 1/2');
  await toEnd(page);
  await expect(narration(page)).toContainText('Θ needs 3 numbers: type c₁, c₂ and n₀');
});

test('the limit test names the limit and what it means', async ({ page }) => {
  await page.getByRole('button', { name: 'Limit of f/g', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('The limit is 3, a positive constant: f = Θ(g).');
  await settled(page);
  await expect(svgText(page, 'f(n)/g(n) → 3 as n grows')).toHaveCount(1);
  await op(page, 'Compare f ; g', '100n ; n^2');
  await page.getByRole('button', { name: 'Limit of f/g', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('The limit is 0: f grows more slowly than g');
});

test('explains input it cannot use', async ({ page }) => {
  await input(page).fill('dog');
  await page.getByRole('button', { name: 'Try c, n₀', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Use numbers, n, log n');
  await op(page, 'Compare f ; g', '3n^^2 ; n');
  await toEnd(page);
  await expect(narration(page)).toContainText('Could not read f(n)');
  await op(page, 'Compare f ; g', 'n^2');
  await toEnd(page);
  await expect(narration(page)).toContainText('Type two functions separated by a semicolon');
  await op(page, 'Try c, n₀', '0 5');
  await toEnd(page);
  await expect(narration(page)).toContainText('c must be positive');
  await op(page, 'Try c, n₀', '4 60');
  await toEnd(page);
  await expect(narration(page)).toContainText('n₀ must be a whole number from 1 to 50');
});

test('the drawing stays readable and fits the screen, with a wide font too', async ({ page }) => {
  await option(page, 'Θ: 0 ≤ c₁·g(n) ≤ f(n) ≤ c₂·g(n) for every n ≥ n₀');
  await op(page, 'Compare f ; g', 'n^2/2 - 3n ; n^2');
  await op(page, 'Try c, n₀', '1/14 1/2 7');
  await page.getByRole('button', { name: 'Limit of f/g', exact: true }).click();
  await toEnd(page);
  // Tick numbers and labels: every one at least 9 CSS pixels tall.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  await settled(page);
  await expect.poll(async () => (await heights()).length).toBeGreaterThan(20);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(9);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const results = await new AxeBuilder({ page })
    .include('.stage')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  // CI's default font (DejaVu Sans) is wider: the page must still fit, and no text may run
  // off the drawing.
  await page.addStyleTag({
    content: ":root { --font: 'DejaVu Sans', Verdana, sans-serif !important; }",
  });
  await op(page, 'Compare f ; g', '3n^3 + 25n^2 log n + 100n + 17 ; n^3 + 1000');
  await toEnd(page);
  await settled(page);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const outside = await stage(page).evaluate((svg) => {
    const box = svg.getBoundingClientRect();
    return Array.from(svg.querySelectorAll('text'))
      .map((t) => t.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1)).length;
  });
  expect(outside).toBe(0);
});

test('concept checks give feedback and Show me plays an example', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  const check = page.locator('.check').filter({ hasText: 'Is 100n = O(n²)?' });
  await check.getByRole('button', { name: 'No: f has to stay under g', exact: true }).click();
  await expect(check).toContainText('Not quite.');
  await check.getByRole('button', { name: 'Try again' }).click();
  await check
    .getByRole('button', { name: 'Yes: c = 1 and n₀ = 100 are a witness', exact: true })
    .click();
  await expect(check).toContainText('Yes.');
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await page
    .getByRole('link', { name: 'A finite check can be fooled', exact: true })
    .first()
    .click();
  await expect(page.getByText('Loaded "A finite check can be fooled"')).toBeVisible();
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/big-o-definition/#practice=7&n=4');
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const first = page.locator('.question').first();
  await expect(first.locator('svg')).toBeVisible();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText(/Not quite\. The answer is|Yes\./);
  if (!(await feedback.textContent())?.startsWith('Yes.')) {
    const text = (await feedback.locator('strong').textContent()) ?? '';
    const answer = text.replace(/^Not quite\. The answer is /, '').replace(/\.$/, '');
    await first.getByRole('button', { name: 'Try again' }).click();
    const radio = first.getByRole('radio', { name: answer, exact: true });
    if (await radio.count()) await radio.check();
    else await first.getByRole('textbox').fill(answer);
    await first.getByRole('button', { name: 'Check' }).click();
    await expect(feedback).toContainText('Yes.');
  }
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});
