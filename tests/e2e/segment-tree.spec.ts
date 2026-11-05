import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const vars = (page: Page) => page.locator('.vars');

const SIXTEEN = '5 3 8 1 9 2 7 4 6 2 8 3 1 7 5 2';

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Numbers', { exact: true }).fill(value);
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible())) await page.getByText('More operations').click();
  await button.click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/segment-tree/');
  await expect(
    page.getByRole('heading', { name: 'Segment tree (lazy propagation)' }),
  ).toBeVisible();
});

test('a query names its three cases and takes whole nodes', async ({ page }) => {
  await fast(page);
  await op(page, 'Build', SIXTEEN);
  await toEnd(page);
  await expect(narration(page)).toContainText('31 nodes, each computed once');
  await op(page, 'Query', '2 9');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'query(2, 9) = 39: the sum of the 3 nodes taken whole, [2, 3], [4, 7], [8, 9]',
  );
  await expect(stage(page).getByText('sum(2, 9) = 39')).toBeVisible();
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Node [12, 15]: no overlap with [2, 9]');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Node [10, 11]: no overlap');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Node [8, 9]: full overlap');
  await expect(vars(page)).toContainText(/node\s*"\[8, 9\]"/);
});

test('a range add leaves tags, and a query pushes them down', async ({ page }) => {
  await fast(page);
  await op(page, 'Range add', '2 7 3');
  await toEnd(page);
  await expect(narration(page)).toContainText('2 tags now hold the rest of the work');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Pending tags: \[2, 3\] \+3, \[4, 7\] \+3\./,
  );
  await expect(stage(page).getByText('+3', { exact: true })).toHaveCount(2);
  await op(page, 'Query', '5 5');
  await toEnd(page);
  await expect(narration(page)).toContainText('query(5, 5) = 5');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Pending tags: \[2, 3\] \+3, \[6, 7\] \+3\./,
  );
});

test('an update walks one path and fixes it on the way back', async ({ page }) => {
  await fast(page);
  await op(page, 'Update', '5 10');
  await toEnd(page);
  await expect(narration(page)).toContainText('Done: 4 nodes changed');
  await expect(vars(page)).toContainText(/update cost\s*4/);
});

test('the minimum option keeps minimums and changes the code', async ({ page }) => {
  await fast(page);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('The minimum of its range').check();
  await page.getByText('Options', { exact: true }).click();
  await op(page, 'Query', '1 6');
  await toEnd(page);
  await expect(narration(page)).toContainText('query(1, 6) = 1');
  await expect(page.locator('.code')).toContainText('return ∞');
});

test('bad input is refused with a reason', async ({ page }) => {
  await fast(page);
  await op(page, 'Query', '6 2');
  await expect(narration(page)).toContainText('swap them');
  await op(page, 'Range add', '0 7 99');
  await expect(narration(page)).toContainText('A[0] would become 104');
  await op(page, 'Range add', '1 2');
  await expect(page.getByRole('alert')).toContainText('Range add needs l and r and an amount');
});

test('sixteen values and their tree stay readable', async ({ page }) => {
  await fast(page);
  await op(page, 'Build', SIXTEEN);
  await toEnd(page);
  await op(page, 'Range add', '1 14 2');
  await toEnd(page);
  // Every number in a node or a cell is drawn at least 9 CSS pixels tall, phone included.
  // Measure again until the last step has finished animating.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^-?\d+$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await expect.poll(async () => (await heights()).length).toBeGreaterThanOrEqual(47);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(9);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a practice set grades an answer and shows it', async ({ page }) => {
  await page.goto('/segment-tree/#practice=24680&n=5');
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
  await expect(narration(page)).toContainText(/build|Node|Leaf|query/);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-add and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await op(page, 'Range add', '2 7 3');
    await toEnd(page);
    await op(page, 'Query', '5 5');
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
