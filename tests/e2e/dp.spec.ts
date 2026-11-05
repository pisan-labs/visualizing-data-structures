/**
 * Dynamic programming pages: fill a table, follow the settings, trace back, and answer a
 * practice question. Every page also runs through all-vizzes.spec.ts.
 */
import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

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
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
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

test.describe('Longest common subsequence', () => {
  test.beforeEach(({ page }) => open(page, 'dp-lcs', 'Longest common subsequence'));

  test('fills the table, then walks back to BCBA', async ({ page }) => {
    await press(page, 'Trace back');
    await expect(narration(page)).toContainText('Fill the table first.');
    await press(page, 'Fill the table');
    await toEnd(page);
    await expect(narration(page)).toContainText(
      "c[7][6] = 4: the longest common subsequence of 'ABCBDAB' and 'BDCABA' has length 4.",
    );
    await press(page, 'Trace back');
    await toEnd(page);
    await expect(narration(page)).toContainText("the LCS is 'BCBA', 4 characters.");
    await expect(stage(page)).toHaveAttribute('aria-label', /LCS found so far: B C B A\./);
    await backTo(
      page,
      "'B' ≠ 'A' at c[7][6]: c[6][6] = c[7][5] = 4, a tie, so go up as CLRS does.",
    );
  });

  test('ties going left find a different LCS from the same table', async ({ page }) => {
    await option(page, 'Go left');
    await expect(code(page)).toContainText('else if c[i][j - 1] >= c[i - 1][j]');
    await press(page, 'Fill the table');
    await press(page, 'Trace back');
    await toEnd(page);
    await expect(narration(page)).toContainText("the LCS is 'BDAB', 4 characters.");
  });

  test('loads two words and fills one row at a time', async ({ page }) => {
    await type(page, 'Two strings', 'STONE LONGEST');
    await press(page, 'Load');
    await expect(narration(page)).toContainText("X = 'STONE' gives the rows");
    await form(page).locator('details.more > summary').click();
    await press(page, 'Fill one row');
    await toEnd(page);
    await expect(narration(page)).toContainText('Row 0 and column 0 are 0');
    await press(page, 'Fill one row');
    await toEnd(page);
    await expect(narration(page)).toContainText('Row 1 is done');
    await type(page, 'Two strings', 'TOO-LONG X');
    await press(page, 'Load');
    await expect(page.getByRole('alert')).toContainText('Use only letters and digits');
  });

  test('a practice question is graded and played', async ({ page }) => {
    await practice(page, 'dp-lcs', 97531);
  });
});

test.describe('Edit distance', () => {
  test.beforeEach(({ page }) => open(page, 'dp-edit-distance', 'Edit distance'));

  test('turns kitten into sitting and shows the alignment', async ({ page }) => {
    await press(page, 'Fill the table');
    await toEnd(page);
    await expect(narration(page)).toContainText(
      "D[6][7] = 3: turning 'kitten' into 'sitting' costs 3.",
    );
    await press(page, 'Trace back');
    await toEnd(page);
    await expect(narration(page)).toContainText(
      'Read the alignment from left to right: 2 substitutions, 1 insert, and 4 matches. Total cost 3.',
    );
    await expect(stage(page)).toHaveAttribute(
      'aria-label',
      /Alignment so far: k to s \(substitute\), i to i \(match\),/,
    );
    await backTo(page, "D[6][7] = 3 came from D[6][6] = 2, left: insert 'g', cost 1.");
  });

  test('a substitution that costs 2 changes the distance', async ({ page }) => {
    const panel = page.locator('details.options');
    await panel.locator('summary').click();
    await page.getByLabel('A substitution costs').fill('2');
    await page.getByLabel('A substitution costs').press('Tab');
    await expect(code(page)).toContainText('cost = 0 if A[i] == B[j] else 2');
    await type(page, 'Two words', 'intention execution');
    await press(page, 'Load');
    await press(page, 'Fill the table');
    await toEnd(page);
    await expect(narration(page)).toContainText("turning 'intention' into 'execution' costs 8.");
  });

  test('a practice question is graded and played', async ({ page }) => {
    await practice(page, 'dp-edit-distance', 86420);
  });
});

test.describe('0/1 knapsack', () => {
  test.beforeEach(({ page }) => open(page, 'dp-knapsack', '0/1 knapsack'));

  test('the table beats the best value per weight first', async ({ page }) => {
    await press(page, 'Fill the table');
    await toEnd(page);
    await expect(narration(page)).toContainText(
      'K[3][5] = 22: the best value that fits in capacity 5.',
    );
    await press(page, 'Trace back');
    await toEnd(page);
    await expect(narration(page)).toContainText(
      'Take items 2 and 3: weight 5 of 5, value 22. Greedy by value per weight gets 16.',
    );
    await expect(stage(page)).toHaveAttribute(
      'aria-label',
      /Greedy by value per weight takes 1, 2, worth 16\./,
    );
  });

  test('loads items and a capacity typed in the box', async ({ page }) => {
    await type(page, 'Items or capacity', '2:3 3:4 4:5 5:6');
    await press(page, 'Load items');
    await expect(narration(page)).toContainText('item 4 weighs 5 and is worth 6');
    await type(page, 'Items or capacity', '7');
    await press(page, 'Capacity');
    await press(page, 'Fill the table');
    await press(page, 'Trace back');
    await toEnd(page);
    await expect(narration(page)).toContainText('Take items 2 and 3: weight 7 of 7, value 9.');
    await type(page, 'Items or capacity', '1:x');
    await press(page, 'Load items');
    await expect(page.getByRole('alert')).toContainText('is not weight:value');
  });

  test('a practice question is graded and played', async ({ page }) => {
    await practice(page, 'dp-knapsack', 31415);
  });
});
