import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Machine or word', { exact: true });

const A_OR_B =
  'start q0; accept q5; q0 eps -> q1; q0 eps -> q3; q1 a -> q2; q3 b -> q4; q2 eps -> q5; q4 eps -> q5';

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value: string) {
  await input(page).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function setClosure(page: Page, label: string) {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel(label).check();
  await page.getByText('Options', { exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/nfa/');
  await expect(
    page.getByRole('heading', { name: 'Nondeterministic finite automaton (NFA)', exact: true }),
  ).toBeVisible();
});

test('a run keeps a set of states and traces it', async ({ page }) => {
  await fast(page);
  await op(page, 'Run', '0110');
  await toEnd(page);
  await expect(narration(page)).toContainText('no state in');
  await expect(narration(page)).toContainText('accepts, so the machine rejects 0110.');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Run on 0110: rejected\. Active states: q0, q1\. Sets: start \{q0\}, after 0 \{q0,q1\}, after 1 \{q0,q2\}, after 1 \{q0\}, after 0 \{q0,q1\}\./,
  );
  // The trace panel lists the set after each symbol.
  for (const set of ['{q0,q1}', '{q0,q2}'])
    await expect(stage(page).locator('text', { hasText: set }).first()).toBeVisible();
  await expect(stage(page).locator('text', { hasText: '✗ reject' })).toHaveCount(1);
  // The branch that dies is narrated on its step.
  await page.getByRole('tab', { name: 'Trace' }).click();
  await expect(page.getByRole('region', { name: 'Trace table' })).toContainText(
    'q2 has no move on 1, so its branch dies.',
  );
});

test('the ε-closure is its own step, or folded into the symbol', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', A_OR_B);
  await op(page, 'Run', 'b');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'contains q5, an accept state, so the machine accepts b.',
  );
  await expect(page.locator('.code')).toContainText('S = E(S)');
  const slider = page.getByRole('slider', { name: 'Timeline' });
  const total = async () =>
    Number(((await slider.getAttribute('aria-valuetext')) ?? '').match(/of (\d+)$/)?.[1]);
  const separate = await total();
  await setClosure(page, 'Folded into the step for each symbol');
  await expect(page.locator('.code')).toContainText('S = E(move(S, c))');
  // Folding the closure in takes two steps fewer for b: one at the start, one after b.
  await expect.poll(total).toBe(separate - 2);
  await op(page, 'Run', 'a');
  await toEnd(page);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('and ε-moves add q5');
});

test('when every branch dies the run stops early', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', A_OR_B);
  await op(page, 'Run', 'abab');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'has a move on b, so every branch dies. The set is empty, so the machine rejects abab, without reading the other 2 symbols.',
  );
  await expect(page.locator('.vars')).toContainText(/active\s*=?\s*0/);
});

test('a test batch runs every word', async ({ page }) => {
  await fast(page);
  await op(
    page,
    'Load',
    'start q0; accept q3; q0 0,1 -> q0; q0 1 -> q1; q1 0,1 -> q2; q2 0,1 -> q3',
  );
  await op(page, 'Test', '+100 +0110 -0011 +11');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Done: 3 of 4 words do what they should. 11 is rejected but should be accepted.',
  );
});

test('the set trace stays readable', async ({ page }) => {
  await fast(page);
  await op(
    page,
    'Load',
    'start q0; accept q3; q0 0,1 -> q0; q0 1 -> q1; q1 0,1 -> q2; q2 0,1 -> q3',
  );
  await op(page, 'Run', '0100110101');
  await toEnd(page);
  // Sets in the trace, state names and tape symbols: at least 9 CSS pixels tall.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^(\{[q0-9,]+\}|q[0-3]|[01])$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await expect.poll(async () => (await heights()).length).toBeGreaterThan(20);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(9);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/nfa/#practice=13579&n=4');
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\.(\s|$)/)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /Run on /);
});

test('the concept page plays an example', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText('1101');
});

test('a run with a dying branch, the trace and the badge pass axe', async ({ page }) => {
  await fast(page);
  await op(page, 'Run', '0110');
  await toEnd(page);
  await page.getByRole('button', { name: 'Step back' }).click();
  await page.getByRole('button', { name: 'Step back' }).click();
  await settled(page);
  const scan = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect((await scan()).violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  await toEnd(page);
  await settled(page);
  expect((await scan()).violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});
