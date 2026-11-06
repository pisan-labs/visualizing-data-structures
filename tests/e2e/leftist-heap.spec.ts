import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

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
  await page.goto('/leftist-heap/');
  await expect(page.getByRole('heading', { name: 'Leftist heap' })).toBeVisible();
});

test('inserts keys and shows the npl of every node', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '10 20 15 30');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /A leftist heap with 4 keys.*The root is 10/,
  );
  await expect(stage(page)).toHaveAttribute('aria-label', /10 \(npl 1\)/);
  await op(page, 'Insert', '25');
  await toEnd(page);
  await stepUntil(page, 'which breaks the leftist property');
  await expect(narration(page)).toContainText('Swap the children of 10');
  await expect(page.locator('.code li.active')).toContainText(['swap h1.left and h1.right']);
});

test('a merge walks the right paths and shows the calls', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '12 59 7 4 15 53');
  await toEnd(page);
  await op(page, 'Merge with', '24 47 5 38 46');
  await toEnd(page);
  await expect(narration(page)).toContainText('The two heaps are one. N = 11');
  await stepUntil(page, 'merge(38, 15)');
  await expect(stage(page).locator('text', { hasText: 'merge(38, 15)' })).toBeVisible();
  await expect(stage(page).locator('text', { hasText: 'merge(4, 5)' })).toBeVisible();
  await expect(page.locator('.vars')).toContainText(/depth\s*3/);
});

test('deleteMin returns the root and merges its subtrees', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '20 10 30 5 25 15 40 35');
  await toEnd(page);
  await op(page, 'Delete min');
  await toEnd(page);
  await expect(narration(page)).toContainText('Return 5');
  await expect(page.locator('.vars')).toContainText(/returned\s*5/);
  await expect(stage(page)).toHaveAttribute('aria-label', /The root is 10\./);
});

test('the npl convention changes only the numbers', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '5 9');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /5 \(npl 0\) has left 9/);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('npl(nil) = 0, so a leaf has 1 (rank, s-value)').check();
  await expect(stage(page)).toHaveAttribute('aria-label', /5 \(npl 1\) has left 9/);
  await expect(page.locator('.code')).toContainText('// npl(nil) = 0');
});

test('bad input is refused with a reason', async ({ page }) => {
  await op(page, 'Insert', 'cat');
  await expect(page.getByRole('alert')).toContainText('Keys are whole numbers');
  await op(page, 'Merge with', '1 2 x');
  await expect(page.getByRole('alert')).toContainText('"x"');
});

test('a practice set grades an answer and shows it on the heap', async ({ page }) => {
  await page.goto('/leftist-heap/#practice=31415&n=5');
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
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /A leftist heap with \d+ keys/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'An insert that swaps children' }).first().click();
  await expect(page.getByText('Loaded "An insert that swaps children"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText(/merge/);
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
    await settled(page);
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
