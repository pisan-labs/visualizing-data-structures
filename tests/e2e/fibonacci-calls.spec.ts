import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function fib(page: Page, n: string) {
  await page.getByLabel('n', { exact: true }).fill(n);
  await page.getByRole('button', { name: 'Call fib', exact: true }).click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
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
  await page.goto('/fibonacci-calls/');
  await expect(page.getByRole('heading', { name: 'Fibonacci call tree' })).toBeVisible();
});

test('fib(5) makes 15 calls and marks the repeated subproblems', async ({ page }) => {
  await fast(page);
  await fib(page, '5');
  await toEnd(page);
  await expect(narration(page)).toContainText('15 calls');
  await expect(page.locator('.vars')).toContainText(/calls\s*15/);
  await expect(stage(page).locator('text', { hasText: /^2nd$/ })).toHaveCount(2);
  await expect(stage(page).locator('text', { hasText: /^3rd$/ })).toHaveCount(1);
  await expect(stage(page)).toHaveAttribute('aria-label', /returned 5 after 15 calls/);
});

test('the memo cuts calls off and draws them dashed', async ({ page }) => {
  await fast(page);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Yes: look n up in a memo first').check();
  await expect(page.locator('.code')).toContainText('memo[n] = x + y');
  await fib(page, '5');
  await toEnd(page);
  await expect(narration(page)).toContainText('9 calls instead of 15: the memo cut off 6');
  // Two memo hits, fib(2) and fib(3), each with a badge; their 6 calls are dashed.
  await expect(stage(page).locator('rect.tag')).toHaveCount(2);
  await expect(stage(page).locator('rect.ghost')).toHaveCount(6);
});

test('milestones jump from repeat to repeat', async ({ page }) => {
  await fast(page);
  await fib(page, '6');
  await toEnd(page);
  await page.getByRole('combobox', { name: 'Detail' }).selectOption({ label: 'Milestones' });
  await page.getByRole('button', { name: 'Back to the previous operation' }).click();
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(narration(page)).toContainText('time fib(');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText('fib(');
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/fibonacci-calls/#practice=31415&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = await answerFirst(page);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(narration(page)).toContainText('fib(');
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations deep in a big tree (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await fib(page, '7');
    await toEnd(page);
    for (let i = 0; i < 30; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
