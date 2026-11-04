import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function run(page: Page, values: string) {
  await page.getByLabel('Values', { exact: true }).fill(values);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function options(page: Page) {
  await page.getByText('Options', { exact: true }).click();
}

async function loadExample(page: Page, title: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Load' })
    .click();
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
  await page.goto('/backtracking/');
  await expect(
    page.getByRole('heading', { name: 'Backtracking (subsets, permutations)' }),
  ).toBeVisible();
});

test('Run lists every subset, taking each value before skipping it', async ({ page }) => {
  await fast(page);
  await run(page, '1 2 3');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'It found 8 subsets: [1, 2, 3], [1, 2], [1, 3], [1], [2, 3], [2], [3] and [].',
  );
  await expect(page.locator('.vars')).toContainText(/calls\s*15/);
  await expect(stage(page)).toHaveAttribute('aria-label', /made 15 calls and found 8 outputs/);
});

test('each call chooses, explores, then unchooses', async ({ page }) => {
  await loadExample(page, 'Every subset of three values');
  const forward = page.getByRole('button', { name: 'Step forward' });
  await forward.click();
  await expect(narration(page)).toContainText('main starts the search with nothing chosen');
  await forward.click();
  await expect(narration(page)).toContainText('Choose 1: chosen is now [1].');
  await forward.click();
  await forward.click();
  await forward.click();
  await expect(narration(page)).toContainText('output [1, 2, 3]. That is subset 1.');
  await forward.click();
  await expect(narration(page)).toContainText('Unchoose 3: chosen is [1, 2] again');
  await expect(stage(page)).toHaveAttribute('aria-label', /chosen is \[1, 2\]/);
});

test('permutations pick the next unused value: 6 orders from 16 calls', async ({ page }) => {
  await fast(page);
  await options(page);
  await page.getByLabel('Permutations: pick the next unused value').check();
  await expect(page.locator('.code')).toContainText('for each value v not in chosen');
  await run(page, '1 2 3');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'It found 6 permutations: [1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2] and [3, 2, 1].',
  );
  await expect(page.locator('.vars')).toContainText(/calls\s*16/);
});

test('a target sum prunes branches and draws what they cut off dashed', async ({ page }) => {
  await fast(page);
  await options(page);
  const target = page.getByLabel('Target sum for subsets (0 for none)');
  await target.fill('9');
  await target.press('Tab');
  await run(page, '4 5 6 7');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'It found 1 subset with sum 9: [4, 5]. Pruning stopped 11 calls early.',
  );
  await expect(page.locator('.vars')).toContainText(/pruned\s*11/);
  // 31 calls is a big tree, so the badges say "cut"; the 8 calls that never happen are dashed.
  await expect(stage(page).locator('text', { hasText: /^cut$/ })).toHaveCount(11);
  await expect(stage(page).locator('rect.ghost')).toHaveCount(8);
});

test('values it cannot take are refused with a reason', async ({ page }) => {
  await run(page, '1 2 3 4 5');
  await expect(page.getByRole('alert')).toContainText('Type 1 to 4 values from 1 to 9');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Show me' }).first().click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(narration(page)).toContainText('chosen');
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/backtracking/#practice=31415&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = await answerFirst(page);
  await first.getByRole('button', { name: 'Show me' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(narration(page)).toContainText('chosen');
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-search with pruning (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await loadExample(page, 'Subsets with sum 9, pruned');
    for (let i = 0; i < 14; i++) await page.getByRole('button', { name: 'Step forward' }).click();
    await expect(stage(page).locator('rect.ghost').first()).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
