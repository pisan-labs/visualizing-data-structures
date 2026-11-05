import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function options(page: Page) {
  await page.getByText('Options', { exact: true }).click();
}

/** Answer the first practice question by reading the answer a wrong try reveals. */
async function answerFirst(page: Page) {
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
  return first;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/n-queens/');
  await expect(page.getByRole('heading', { name: 'N-Queens' })).toBeVisible();
});

test('Solve places four queens, backtracking at dead ends', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Solve', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('solution 1, columns 2 4 1 3');
  await expect(page.locator('.vars')).toContainText(/placements\s*8/);
  await expect(page.locator('.vars')).toContainText(/backtracks\s*4/);
  await expect(stage(page)).toHaveAttribute('aria-label', /That is a solution/);
});

test('Next move shows a dead end, then the backtrack', async ({ page }) => {
  await fast(page);
  const next = page.getByRole('button', { name: 'Next move', exact: true });
  await next.click();
  await next.click();
  await next.click();
  await toEnd(page);
  await expect(narration(page)).toContainText('take back the queen in row 2');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('dead end');
  // Queens in columns 1 and 3 of rows 1 and 2 attack all 4 squares of row 3 and 3 of row 4.
  await expect(stage(page).locator('text', { hasText: /^×$/ })).toHaveCount(7);
});

test('counting every solution finds 10 for five queens', async ({ page }) => {
  await fast(page);
  await options(page);
  await page.getByLabel('Count all the solutions').check();
  await page.getByLabel('Board size N').fill('5');
  await page.getByLabel('Board size N').press('Tab');
  await page.getByRole('button', { name: 'Solve', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('It found 10 solutions for 5 queens');
  await expect(stage(page).locator('text', { hasText: 'solutions found: 10' })).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/n-queens/#practice=16180&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = await answerFirst(page);
  await first.getByRole('button', { name: 'Show me' }).click();
  // Show me plays the next move, which can be a single step, so look at what it says.
  await expect(narration(page)).toContainText(/row \d/i);
  await expect(page.locator('.narration .chip')).toContainText(/step|solve/);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-search (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await page.getByRole('combobox', { name: 'Detail' }).selectOption({ label: 'Every detail' });
    await fast(page);
    await page.getByRole('tab', { name: 'Examples' }).click();
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Eight queens: 113 placements' })
      .getByRole('button', { name: 'Load' })
      .click();
    for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Step forward' }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
