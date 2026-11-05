import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const vars = (page: Page) => page.locator('.vars');

const SIXTEEN = '3 8 1 6 2 9 4 7 5 2 8 3 6 1 7 4';

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

async function sixteen(page: Page) {
  await fast(page);
  await op(page, 'Build', SIXTEEN);
  await toEnd(page);
  await expect(narration(page)).toContainText('T is built with 15 additions');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/fenwick-tree/');
  await expect(page.getByRole('heading', { name: 'Fenwick tree' })).toBeVisible();
});

test('a prefix sum clears the lowest set bit, one entry per 1 bit', async ({ page }) => {
  await sixteen(page);
  await op(page, 'Prefix sum', '13');
  await toEnd(page);
  await expect(narration(page)).toContainText('prefix(13) = 64, from 3 entries of T');
  await expect(stage(page).getByText('prefix(13) = 6 + 18 + 40 = 64')).toBeVisible();
  await expect(stage(page).locator('line.arrow[marker-end]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('i = 8 = 1000₂, whose lowest set bit is 8');
  await expect(vars(page)).toContainText(/i & -i\s*8/);
});

test('an add climbs through every range that contains i', async ({ page }) => {
  await sixteen(page);
  await op(page, 'Add', '5 3');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'add changed 4 entries of T, every range that contains position 5: T[5], T[6], T[8], T[16]',
  );
  await expect(vars(page)).toContainText(/update cost\s*4/);
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /A holds 16 values, from A\[1\]: 3, 8, 1, 6, 5,/,
  );
});

test('a range sum is two prefix walks', async ({ page }) => {
  await sixteen(page);
  await op(page, 'Range sum', '7 7');
  await toEnd(page);
  await expect(narration(page)).toContainText('sum(7, 7) = prefix(7) − prefix(6) = 33 − 29 = 4');
  await expect(vars(page)).toContainText(/query cost\s*5/);
});

test('both builds make the same tree at different costs', async ({ page }) => {
  await sixteen(page);
  const tree = await stage(page).getAttribute('aria-label');
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('One add per value (O(n log n))').check();
  await toEnd(page);
  await expect(narration(page)).toContainText('T is built with 48 additions');
  await expect(stage(page)).toHaveAttribute('aria-label', tree!);
  await expect(page.locator('.code')).toContainText('add(k, A[k])');
});

test('bad input is refused with a reason', async ({ page }) => {
  await fast(page);
  await op(page, 'Prefix sum', '17');
  await expect(narration(page)).toContainText('There is no A[17]');
  await op(page, 'Add', '3 99');
  await expect(narration(page)).toContainText('A[3] would become 107');
  await op(page, 'Range sum', '4');
  await expect(page.getByRole('alert')).toContainText('Range sum needs l and r');
});

test('sixteen values stay readable', async ({ page }) => {
  await sixteen(page);
  await op(page, 'Prefix sum', '15');
  await toEnd(page);
  // Every number in a box or cell is drawn at least 9 CSS pixels tall, phone included. Measure
  // again until the last step has finished animating.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^-?\d+$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await expect.poll(async () => (await heights()).length).toBeGreaterThanOrEqual(48);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(9);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a practice set grades an answer and shows it', async ({ page }) => {
  await page.goto('/fenwick-tree/#practice=24680&n=5');
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
  await page.getByRole('link', { name: 'The longest query' }).first().click();
  await expect(page.getByText('Loaded "The longest query: every bit set"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Show me' }).first().click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(narration(page)).toContainText(/build|prefix\(13\)|i = /);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-add and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await op(page, 'Add', '3 2');
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
