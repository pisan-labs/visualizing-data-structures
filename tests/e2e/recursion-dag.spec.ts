import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function run(page: Page, input: string) {
  await page.getByLabel('n, or n k', { exact: true }).fill(input);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function binomial(page: Page) {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Binomial coefficients: C(n, k) = C(n - 1, k - 1) + C(n - 1, k)').check();
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
  await page.goto('/recursion-dag/');
  await expect(page.getByRole('heading', { name: 'Recursion tree vs memoized DAG' })).toBeVisible();
});

test('the tree makes 15 calls where the DAG has 6 subproblems', async ({ page }) => {
  await fast(page);
  await run(page, '5');
  await toEnd(page);
  await expect(narration(page)).toContainText('with a memo the same recursion makes 9');
  await expect(page.locator('.vars')).toContainText(/tree calls\s*15/);
  await expect(page.locator('.vars')).toContainText(/dag nodes\s*6/);
  await expect(stage(page).locator('text', { hasText: /^×5$/ })).toBeVisible();
  await expect(stage(page)).toHaveAttribute('aria-label', /15 calls in the tree, 6 subproblems/);
});

test('binomial coefficients build Pascal’s triangle', async ({ page }) => {
  await fast(page);
  await binomial(page);
  await expect(page.locator('.code')).toContainText('x = C(n - 1, k - 1)');
  await run(page, '4 2');
  await toEnd(page);
  await expect(narration(page)).toContainText('C(4, 2) = 6. The tree made 11 calls');
  // C(2, 1) is called twice in the tree and drawn once in the DAG.
  await expect(stage(page).locator('text', { hasText: /^C\(2,1\)$/ })).toHaveCount(3);
  await expect(stage(page).locator('text', { hasText: /^×2$/ })).toHaveCount(3);
});

test('C(n, k) explains what it needs', async ({ page }) => {
  await binomial(page);
  await run(page, '5');
  await expect(narration(page)).toContainText('C(n, k) needs two whole numbers');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText('fib(');
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/recursion-dag/#practice=27182&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = await answerFirst(page);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations while the DAG fills (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await binomial(page);
    await run(page, '5 2');
    await toEnd(page);
    for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Step back' }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
