/**
 * Dynamic programming pages: fill a table, follow the settings, trace back, and answer a
 * practice question. Every page also runs through all-vizzes.spec.ts.
 */
import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const code = (page: Page) => page.locator('.code');
const form = (page: Page) => page.locator('form.controls');

async function open(page: Page, id: string, title: string) {
  await page.goto(`/${id}/`);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function type(page: Page, label: string, text: string) {
  await form(page).getByLabel(label, { exact: true }).fill(text);
}

async function press(page: Page, button: string) {
  await form(page).getByRole('button', { name: button, exact: true }).click();
}

/** Jump to the end of the history. Playback can disable the button between check and click. */
async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** Step back until the narration matches, at most `max` steps. */
async function backTo(page: Page, text: string, max = 40) {
  for (let i = 0; i < max; i++) {
    if ((await narration(page).textContent())?.includes(text)) return;
    await page.getByRole('button', { name: 'Step back' }).click();
  }
  await expect(narration(page)).toContainText(text);
}

async function option(page: Page, label: string) {
  const panel = page.locator('details.options');
  if ((await panel.getAttribute('open')) === null) await panel.locator('summary').click();
  await page.getByLabel(label).check();
}

/** Open a practice set, answer the first question from the answer a wrong try reveals, and
 * play it with Show me. */
async function practice(page: Page, id: string, seed: number) {
  await page.goto(`/${id}/#practice=${seed}&n=3`);
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const first = page.locator('.question').first();
  await expect(first.locator('svg')).toBeVisible();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const text = (await feedback.locator('strong').textContent()) ?? '';
  const answer = text.replace(/^Not quite\. The answer is /, '').replace(/\.$/, '');
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer === '(nothing)' ? '' : answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await first.getByRole('button', { name: 'Show me' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
}

test.describe('Fibonacci numbers', () => {
  test.beforeEach(({ page }) => open(page, 'dp-fibonacci', 'Fibonacci numbers'));

  test('fills the table bottom-up and returns F(n)', async ({ page }) => {
    await type(page, 'n', '10');
    await press(page, 'Compute F(n)');
    await toEnd(page);
    await expect(narration(page)).toContainText('Return F[10] = 55.');
    await expect(stage(page)).toHaveAttribute(
      'aria-label',
      'Table F[0..10]: 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55.',
    );
    await backTo(page, 'F[7] = F[6] + F[5] = 8 + 5 = 13.');
    await expect(page.locator('.code li.active').last()).toContainText(
      'F[i] = F[i - 1] + F[i - 2]',
    );
    await expect(page.locator('.vars')).toContainText('additions');
  });

  test('top-down fills the memo as the calls finish', async ({ page }) => {
    await option(page, 'Top-down with a memo: recurse, and remember each answer');
    await expect(code(page)).toContainText('if memo[k] != NIL');
    await type(page, 'n', '5');
    await press(page, 'Compute F(n)');
    await toEnd(page);
    await expect(narration(page)).toContainText('fib(5) returns F(5) = 5. memoFib ran 9 times');
    await backTo(page, 'F[2] = 1 is already in the memo');
    await expect(stage(page)).toHaveAttribute(
      'aria-label',
      /Calls on the stack: memoFib\(5\), memoFib\(4\), memoFib\(2\)\./,
    );
  });

  test('refuses an n it cannot draw', async ({ page }) => {
    await type(page, 'n', '16');
    await press(page, 'Compute F(n)');
    await expect(page.getByRole('alert')).toContainText('16 is out of range');
  });

  test('a practice question is graded and played', async ({ page }) => {
    await practice(page, 'dp-fibonacci', 24680);
  });
});

test.describe('Making change', () => {
  test.beforeEach(({ page }) => open(page, 'dp-change', 'Making change'));

  test('pays 6 with 3 + 3 where greedy needs three coins', async ({ page }) => {
    await type(page, 'Amount or coins', '6');
    await press(page, 'Make change');
    await toEnd(page);
    await expect(narration(page)).toContainText('change(6) needs 2 coins: 3 + 3. Greedy needs 3.');
    await expect(stage(page)).toHaveAttribute(
      'aria-label',
      /Fewest coins F\[0\.\.6\]: 0, 1, 2, 1, 1, 2, 2\. Coin used: none, 1, 1, 3, 4, 1, 3\./,
    );
    await backTo(page, 'F[6] = min(F[5] + 1, F[3] + 1, F[2] + 1) = min(3, 2, 3) = 2, using a 3.');
  });

  test('greedy gets stuck without a coin worth 1', async ({ page }) => {
    await type(page, 'Amount or coins', '3 5');
    await press(page, 'Set coins');
    await expect(narration(page)).toContainText('With no coin worth 1');
    await type(page, 'Amount or coins', '11');
    await press(page, 'Make change');
    await toEnd(page);
    await expect(narration(page)).toContainText('change(11) needs 3 coins: 3 + 3 + 5.');
    await expect(stage(page)).toHaveAttribute('aria-label', /Greedy pays 5, 5 and gets stuck\./);
  });

  test('counts the ways in a table with a row per coin', async ({ page }) => {
    await option(page, 'The number of ways to make the amount');
    await expect(code(page)).toContainText('W[i][a] = W[i - 1][a]');
    await type(page, 'Amount or coins', '6');
    await press(page, 'Make change');
    await toEnd(page);
    await expect(narration(page)).toContainText(
      'There are 4 ways to make 6 with coins 1, 3 and 4. They are 4 + 1 + 1, 3 + 3, 3 + 1 + 1 + 1 and 1 + 1 + 1 + 1 + 1 + 1.',
    );
  });

  test('a practice question is graded and played', async ({ page }) => {
    await practice(page, 'dp-change', 13579);
  });
});
