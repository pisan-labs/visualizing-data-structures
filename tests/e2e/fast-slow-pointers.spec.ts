import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function press(page: Page, button: string, input?: string) {
  if (input !== undefined) await page.getByLabel('k, or values', { exact: true }).fill(input);
  await page.getByRole('button', { name: button, exact: true }).click();
  await toEnd(page);
}

/** Open Options, pick settings by their radio labels, and close it again. */
async function options(page: Page, ...labels: string[]) {
  const summary = page.locator('summary', { hasText: 'Options' });
  await summary.click();
  for (const l of labels) await page.getByRole('radio', { name: l }).check();
  await summary.click();
}

const NAIVE = 'Count the length first, or copy to an array';

test.beforeEach(async ({ page }) => {
  await page.goto('/fast-slow-pointers/');
  await expect(page.getByRole('heading', { name: 'Fast and slow pointers' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('slow stops at the middle in one walk, with the work beside it', async ({ page }) => {
  await press(page, 'Find middle');
  await expect(narration(page)).toContainText('the middle is 4, at index 3');
  await expect(narration(page)).toContainText('One walk took 9 hops; counting first takes 10');
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*10/);
  await expect(page.locator('.vars')).toContainText(/pattern total\s*=?\s*9/);
  await expect(stage(page)).toHaveAttribute('aria-label', /Middle: 4/);
});

test('counting first walks twice; the first of two middles is one node earlier', async ({
  page,
}) => {
  await options(page, NAIVE);
  await press(page, 'Find middle');
  await expect(narration(page)).toContainText('Counting first walked the list twice: 10 hops');
  await expect(page.locator('.code')).toContainText('count first');
  await options(page, 'Two pointers in one walk', 'The first (while fast.next and fast.next.next)');
  await press(page, 'Build', '3 8 1 9 4 7');
  await press(page, 'Find middle');
  await expect(narration(page)).toContainText('the middle is 1, at index 2');
});

test('a gap of k finds the k-th from the end, and a short list has none', async ({ page }) => {
  await press(page, 'k-th from end', '3');
  await expect(narration(page)).toContainText('the 3rd node from the end is 5');
  await press(page, 'k-th from end', '9');
  await expect(narration(page)).toContainText('There is no 9th node from the end');
});

test('the palindrome check turns half around and puts it back', async ({ page }) => {
  await press(page, 'Build', '1 2 3 2 1');
  await press(page, 'Palindrome?');
  await expect(narration(page)).toContainText(
    'the list is a palindrome, and it is back as it was: head → 1 → 2 → 3 → 2 → 1 → null',
  );
  await page.getByLabel('k, or values', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.getByText('too big')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/fast-slow-pointers/#practice=13579&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const verdict = first.locator('.feedback strong');
  await expect(verdict).toContainText('Not quite. The answer is');
  const answer = ((await verdict.textContent()) ?? '')
    .replace(/^Not quite\. The answer is /, '')
    .replace(/\.$/, '');
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Yes.');
  const show = first.getByRole('button', { name: 'Show me' });
  if (await show.count()) await showMe(page, show);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations on the palindrome check in place (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await press(page, 'Build', '1 2 3 4 3 2 1');
    await press(page, 'Palindrome?');
    await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on the array copy (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, NAIVE);
    await press(page, 'Palindrome?');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
