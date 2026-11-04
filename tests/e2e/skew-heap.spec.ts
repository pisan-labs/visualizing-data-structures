import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Key', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function stepUntil(page: Page, text: string) {
  const back = page.getByRole('button', { name: 'Step back' });
  for (let i = 0; i < 40; i++) {
    if (((await narration(page).textContent()) ?? '').includes(text)) return;
    await back.click();
  }
  throw new Error(`no step says "${text}"`);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/skew-heap/');
  await expect(page.getByRole('heading', { name: 'Skew heap' })).toBeVisible();
});

test('every winner on the merge path swaps its children', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '10 20 15 30 25');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /A skew heap with 5 keys.*10 has left 15 and right 20/,
  );
  await stepUntil(page, 'swap the children of 15, always');
  await expect(page.locator('.code li.active')).toContainText(['swap h1.left and h1.right']);
  // No npl anywhere on a skew heap, and no options to set.
  await expect(page.locator('.vars')).not.toContainText('npl');
  await expect(page.getByText('Options', { exact: true })).toHaveCount(0);
});

test('a long right path is walked once, then the heap is cheap again', async ({ page }) => {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ has: page.getByText('A long right path, paid for once', { exact: true }) })
    .getByRole('button', { name: 'Load' })
    .click();
  await fast(page);
  await page.getByRole('button', { name: 'Forward to the next operation' }).click();
  await expect(narration(page)).toContainText('60 is in');
  await expect(page.locator('.vars')).toContainText(/swaps\s*5/);
  await page.getByRole('button', { name: 'Forward to the next operation' }).click();
  await expect(narration(page)).toContainText('70 is in');
  await expect(page.locator('.vars')).toContainText(/swaps\s*2/);
});

test('deleteMin returns the root and merges its subtrees', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '20 10 30 5 25 15 40 35');
  await toEnd(page);
  await op(page, 'Delete min');
  await toEnd(page);
  await expect(narration(page)).toContainText('Return 5');
  await expect(stage(page)).toHaveAttribute('aria-label', /The root is 10\./);
});

test('a practice set grades an answer and shows it on the heap', async ({ page }) => {
  await page.goto('/skew-heap/#practice=27182&n=5');
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\./)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await first.getByRole('button', { name: 'Show me' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(stage(page)).toHaveAttribute('aria-label', /A skew heap with \d+ keys/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Every winner swaps' }).first().click();
  await expect(page.getByText('Loaded "Every winner swaps"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Show me' }).first().click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(narration(page)).toContainText(/insert\(60\)|merge|60/);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-merge and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await op(page, 'Insert', '12 59 7 4 15 53');
    await toEnd(page);
    await op(page, 'Merge with', '24 47 5 38 46');
    await toEnd(page);
    await stepUntil(page, 'merge(38, 15)');
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
