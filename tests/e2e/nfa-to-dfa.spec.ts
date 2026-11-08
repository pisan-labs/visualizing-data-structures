import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Automaton', { exact: true });

const THIRD = 'start q0; accept q3; q0 0,1 -> q0; q0 1 -> q1; q1 0,1 -> q2; q2 0,1 -> q3';

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function load(page: Page, text: string) {
  await input(page).fill(text);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
}

async function loadExample(page: Page, title: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Load' })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/nfa-to-dfa/');
  await expect(
    page.getByRole('heading', { name: 'NFA to DFA (subset construction)', exact: true }),
  ).toBeVisible();
});

test('the starting NFA becomes a DFA of 4 states with a dead state', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'The queue is empty, so the DFA is finished: 4 states, more than the NFA',
  );
  await expect(narration(page)).toContainText('D = ∅ is the dead state.');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /The DFA so far: A = \{q0,q1\}: on a to A, on b to B; B = \{q2\} \(accepts\)/,
  );
});

test('the third symbol from the end: 4 NFA states become 8, readable', async ({ page }) => {
  await fast(page);
  await load(page, THIRD);
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText("8 states, more than the NFA's 4");
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Step back' }).click();
  // State names, table sets and letters: each at least 8 CSS pixels tall. Poll: the last step
  // back is still animating.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^(q\d|[A-H]|\*?[A-H]|\{[q\d,]+\})$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await settled(page);
  await expect.poll(async () => (await heights()).length).toBeGreaterThan(30);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(8);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a step shows M, then the ε-closure, at the finest detail', async ({ page }) => {
  await fast(page);
  await page.getByRole('combobox', { name: 'Detail' }).selectOption('3');
  await loadExample(page, "a's, then b's, then c's");
  // The example opens on its Load step; then the start set, A from the queue, and M on a.
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(narration(page)).toContainText('On a: q0 goes to q0. So M = {q0}.');
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(narration(page)).toContainText(
    'Follow ε-moves from M: they reach q1 and q2. E(M) = {q0, q1, q2}.',
  );
});

test('all subsets: 8 states, and the unreachable ones are pointed out', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('All 2^|Q| of them (NFAs of up to 4 states)').check();
  await page.getByText('Options', { exact: true }).click();
  await expect(page.locator('.code')).toContainText("Q' = every subset of Q");
  await fast(page);
  await load(page, 'start q0; accept q2; q0 a,b -> q0; q0 a -> q1; q1 b -> q2');
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Every subset has its moves: a DFA with 8 states. Starting from B, it can only ever reach B, E and F.',
  );
});

test('bad text is explained, and an oversized DFA is refused', async ({ page }) => {
  await load(page, 'q0 ab -> q1');
  await expect(page.getByRole('alert')).toContainText('"ab" in "q0 ab -> q1" is not a symbol');
  await load(
    page,
    'start q0; accept q5; q0 0,1 -> q0; q0 1 -> q1; q1 0,1 -> q2; q2 0,1 -> q3; q3 0,1 -> q4; q4 0,1 -> q5',
  );
  await expect(page.getByRole('alert')).toContainText('a DFA with 32 states, too many to draw');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/nfa-to-dfa/#practice=24680&n=4');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /The DFA so far: A = /);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations mid-run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await page.getByRole('button', { name: 'Convert', exact: true }).click();
    await toEnd(page);
    for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
