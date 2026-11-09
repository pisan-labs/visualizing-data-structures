import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Key', { exact: true }).fill(value);
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible())) await page.getByText('More operations').click();
  await button.click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

const TEN = '10 20 30 40 50 60 70 80 90 100';

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('b-plus-tree'));
  await expect(page.getByRole('heading', { name: 'B+ tree', exact: true })).toBeVisible();
});

test('leaf splits copy up and internal splits push up', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', TEN);
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /10 keys in 5 leaves, height 2\. Root \[70\]/,
  );
  await expect(narration(page)).toContainText('is pushed up into a new root');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('copied up into the parent');
  await expect(page.locator('.vars')).toContainText(/leaves\s*5/);
});

test('a range query walks down once and then along the leaves', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', TEN);
  await op(page, 'Range', '25 65');
  await toEnd(page);
  await expect(narration(page)).toContainText('range(25, 65) = 30 40 50 60');
  await expect(page.locator('.vars')).toContainText(/visited\s*4/);
  await expect(stage(page).locator('text', { hasText: 'output' })).toBeVisible();
});

test('the range button needs two keys', async ({ page }) => {
  await op(page, 'Range', '25');
  await expect(page.getByRole('alert')).toContainText('Range needs a low key and a high key');
});

test('delete borrows or merges and may leave a signpost', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '10 20 30 40 50 60 70 80 90');
  await op(page, 'Delete', '50');
  await toEnd(page);
  await expect(narration(page)).toContainText('Borrow:');
  await expect(page.locator('.vars')).toContainText(/borrows\s*1/);
  await op(page, 'Delete', '10');
  await toEnd(page);
  await expect(page.locator('.vars')).toContainText(/merges\s*1/);
  await op(page, 'Clear');
  await op(page, 'Insert', '10 20 30 40 50 60 70 80 90');
  await op(page, 'Delete', '70');
  await toEnd(page);
  await expect(narration(page)).toContainText('70 still appears above as a separator');
  await expect(stage(page)).toHaveAttribute('aria-label', /Root \[30 50 70\]/);
});

test('a practice set grades an answer and shows it on the tree', async ({ page }) => {
  await page.goto('/b-plus-tree/#practice=24680&n=5');
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
  else await first.getByRole('textbox').fill(answer === '(nothing)' ? '' : answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /A B\+ tree of order 4/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'A range query walks along the leaves' }).click();
  await expect(page.getByText('Loaded "A range query walks along the leaves"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText(/search\(|≥|leaf/);
});

test('a twenty-key tree stays readable', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '15 82 47 3 66 29 91 54 8 73 38 60 21 95 12 44 77 33 58 86');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /20 keys/);
  // Measure again until the last step has finished animating.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^-?\d+$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(9);
});

test('no axe violations mid-range in the contrast theme, and no sideways scroll', async ({
  page,
}) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('contrast');
  await fast(page);
  await op(page, 'Insert', TEN);
  await op(page, 'Range', '25 65');
  await page.getByRole('button', { name: 'Step back' }).click();
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
