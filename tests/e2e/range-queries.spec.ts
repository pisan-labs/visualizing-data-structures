import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const vars = (page: Page) => page.locator('.vars');

const SIXTEEN = '12 7 19 3 25 14 8 21 5 30 17 9 26 2 11 16';

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Numbers', { exact: true }).fill(value);
  const button = page.getByRole('button', { name, exact: true });
  // Less common operations sit under "More operations".
  if (!(await button.isVisible())) await page.getByText('More operations').click();
  await button.click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function sparse(page: Page) {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Sparse table: min(i, j)').check();
  await page.getByText('Options', { exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/range-queries/');
  await expect(page.getByRole('heading', { name: 'Prefix sums and sparse tables' })).toBeVisible();
});

test('a range sum is two entries of P, drawn as two arrows', async ({ page }) => {
  await fast(page);
  await op(page, 'Query', '2 5');
  await toEnd(page);
  await expect(narration(page)).toContainText('sum(2, 5) = P[6] − P[2] = 28 − 8 = 20');
  await expect(stage(page).getByText('P[6] = 28', { exact: true })).toBeVisible();
  await expect(stage(page).getByText('P[2] = 8', { exact: true })).toBeVisible();
  await expect(stage(page).locator('line.arrow[marker-end]')).toHaveCount(2);
  await expect(vars(page)).toContainText(/sum\s*20/);
  await expect(vars(page)).toContainText(/query cost\s*1/);
});

test('build fills P one addition at a time, half-open and from 0', async ({ page }) => {
  await fast(page);
  await op(page, 'Build', '4 -2 7');
  await toEnd(page);
  await expect(narration(page)).toContainText('P is built with 3 additions');
  await expect(stage(page)).toHaveAttribute('aria-label', /P, from P\[0\]: 0, 4, 2, 9\./);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('P[3] = P[2] + A[2] = 2 + 7 = 9');
  await page.getByRole('button', { name: 'Back to the previous operation' }).click();
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(narration(page)).toContainText('half-open');
});

test('the sparse table answers min with two windows that overlap', async ({ page }) => {
  await fast(page);
  await sparse(page);
  await op(page, 'Build', SIXTEEN);
  await toEnd(page);
  await expect(narration(page)).toContainText('38 min() calls');
  await op(page, 'Query', '2 11');
  await toEnd(page);
  await expect(narration(page)).toContainText('min(2, 11) = min(3, 5) = 3');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('They overlap on A[4..9]');
  await expect(stage(page).getByText('M[3][2] = 3', { exact: true })).toBeVisible();
  await expect(stage(page).getByText('M[3][4] = 5', { exact: true })).toBeVisible();
  await expect(page.locator('.code')).toContainText('return min(M[k][i], M[k][j − 2^k + 1])');
});

test('an update rewrites P, and lives under More operations', async ({ page }) => {
  await fast(page);
  await op(page, 'Update', '0 9');
  await toEnd(page);
  await expect(narration(page)).toContainText('8 entries of P changed, P[1] to P[8]');
  await expect(vars(page)).toContainText(/update cost\s*8/);
});

test('bad input is refused with a reason', async ({ page }) => {
  await fast(page);
  await op(page, 'Query', '5 2');
  await expect(narration(page)).toContainText('swap them');
  await op(page, 'Query', '0 8');
  await expect(narration(page)).toContainText('There is no A[8]');
  await op(page, 'Query', '1 2 3');
  await expect(page.getByRole('alert')).toContainText('Query needs i and j');
  await op(page, 'Build', '1 2 x');
  await expect(page.getByRole('alert')).toContainText('"x" is not a whole number');
});

test('sixteen values stay readable', async ({ page }) => {
  await fast(page);
  await op(page, 'Build', SIXTEEN);
  await toEnd(page);
  await op(page, 'Query', '3 15');
  await toEnd(page);
  // Every number in a cell is drawn at least 9 CSS pixels tall, phone included. Measure again
  // until the last step has finished animating.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^-?\d+$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await expect.poll(async () => (await heights()).length).toBeGreaterThanOrEqual(33);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(9);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a practice set grades an answer and shows it', async ({ page }) => {
  await page.goto('/range-queries/#practice=24680&n=5');
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.question')).toHaveCount(5);
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
  await first.getByRole('button', { name: 'Show me' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(stage(page)).toHaveAttribute('aria-label', /A holds \d+ values/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'A query of the whole array' }).first().click();
  await expect(page.getByText('Loaded "A query of the whole array"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Show me' }).first().click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(narration(page)).toContainText(/build|P\[|sum\(2, 5\)/);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-query and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await sparse(page);
    await op(page, 'Query', '1 6');
    await toEnd(page);
    await page.getByRole('button', { name: 'Step back' }).click();
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
