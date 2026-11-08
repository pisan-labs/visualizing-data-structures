import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const vars = (page: Page) => page.locator('.vars');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Key', { exact: true }).fill(value);
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

async function seven(page: Page) {
  await fast(page);
  await op(page, 'Build heap', '40 30 35 10 20 25 15');
  await toEnd(page);
  await expect(narration(page)).toContainText('A is a max-heap');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/binary-heap/');
  await expect(page.getByRole('heading', { name: 'Binary heap' })).toBeVisible();
});

test('builds a heap from a list and draws the tree and the array', async ({ page }) => {
  await fast(page);
  await op(page, 'Build heap', '5 10 15 20 25 30 35');
  await toEnd(page);
  await expect(narration(page)).toContainText('N = 7, height = 2');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /A max-heap with 7 keys.*The root is 35\./,
  );
  await expect(stage(page).locator('circle')).toHaveCount(7);
  await expect(stage(page).locator('rect.live')).toHaveCount(7);
  await expect(vars(page)).toContainText(/swaps\s*4/);
});

test('the two build methods count different work on the same keys', async ({ page }) => {
  await fast(page);
  await op(page, 'Build heap', '5 10 15 20 25 30 35 40 45 50 55 60');
  await toEnd(page);
  await expect(narration(page)).toContainText('16 comparisons and 9 swaps');
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Insert the keys one at a time (O(n log n))').check();
  await toEnd(page);
  await expect(narration(page)).toContainText('25 comparisons and 25 swaps');
  await expect(page.locator('.code')).toContainText('for each key in list');
});

test('a sift highlights the same key in the tree and in the array', async ({ page }) => {
  await seven(page);
  await op(page, 'Insert', '50');
  await toEnd(page);
  await expect(narration(page)).toContainText('50 is at the root');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('so swap them. 50 moves up to A[1]');
  await expect(stage(page).locator('circle.role-active')).toHaveCount(1);
  await expect(stage(page).locator('rect.role-active')).toHaveCount(1);
  await expect(page.locator('.code li.active').first()).toContainText('swap A[i] and A[parent(i)]');
});

test('extract moves the last key to the root and sifts it down', async ({ page }) => {
  await seven(page);
  await op(page, 'Extract');
  await toEnd(page);
  await expect(narration(page)).toContainText('Return max = 40');
  await expect(vars(page)).toContainText(/returned\s*40/);
  await expect(stage(page)).toHaveAttribute('aria-label', /The root is 35\./);
});

test('update key and delete live under More operations', async ({ page }) => {
  await seven(page);
  await op(page, 'Update key', '7 45');
  await toEnd(page);
  await expect(narration(page)).toContainText('45 is at the root');
  await op(page, 'Delete at index', '9');
  await expect(narration(page)).toContainText('there is no A[9]');
});

test('zero-based indexing changes the formulas and the labels', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('From 0: parent(i) = ⌊(i − 1)/2⌋').check();
  await seven(page);
  await expect(page.locator('.code')).toContainText('for i = ⌊n/2⌋ − 1 downto 0');
  await expect(stage(page)).toHaveAttribute('aria-label', /A\[0\.\.6\] holds/);
});

test('bad input is refused with a reason', async ({ page }) => {
  await op(page, 'Insert', 'cat');
  await expect(page.getByRole('alert')).toContainText('Keys are whole numbers');
  await op(page, 'Build heap', '1 2 x');
  await expect(page.getByRole('alert')).toContainText('"x"');
});

test('a practice set grades an answer and shows it on the heap', async ({ page }) => {
  await page.goto('/binary-heap/#practice=24680&n=5');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /-heap with \d+ keys/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'A min-heap indexed from 0' }).first().click();
  await expect(page.getByText('Loaded "A min-heap indexed from 0"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText(/insert\(50\)|50 moves up|50 is at the root/);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-extract and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await seven(page);
    await op(page, 'Extract');
    await toEnd(page);
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
}
