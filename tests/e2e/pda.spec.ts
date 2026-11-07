import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Machine or word', { exact: true });

const PALINDROMES =
  'start q0; accept q0 q3; q0 eps, eps -> q1 $; q1 a, eps -> q1 a; q1 b, eps -> q1 b; q1 eps, eps -> q2 eps; q2 a, a -> q2 eps; q2 b, b -> q2 eps; q2 eps, $ -> q3 eps';
const LEFT_RECURSION =
  'start q0; accept q2; q0 eps, eps -> q1 S$; q1 eps, S -> q1 Sa; q1 eps, S -> q1 b; q1 a, a -> q1 eps; q1 b, b -> q1 eps; q1 eps, $ -> q2 eps';
const ONE_STATE =
  'start q0; stack S; q0 eps, S -> q0 aSb; q0 eps, S -> q0 eps; q0 a, a -> q0 eps; q0 b, b -> q0 eps';

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

async function option(page: Page, label: string) {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel(label).check();
  await page.getByText('Options', { exact: true }).click();
}

const total = async (page: Page) =>
  Number(
    (
      (await page.getByRole('slider', { name: 'Timeline' }).getAttribute('aria-valuetext')) ?? ''
    ).match(/of (\d+)$/)?.[1],
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/pda/');
  await expect(
    page.getByRole('heading', { name: 'Pushdown automaton', exact: true }),
  ).toBeVisible();
});

test('a deterministic run pushes and pops, then accepts or rejects', async ({ page }) => {
  await fast(page);
  await op(page, 'Run', 'aabb');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'The machine has read all of aabb, and it is in q3, an accept state, so it accepts aabb.',
  );
  await expect(stage(page).locator('text', { hasText: '✓ accept' })).toHaveCount(1);
  await expect(stage(page)).toHaveAttribute('aria-label', /Run on aabb: at \(q3, ε, ε\)/);
  // Step back to the middle: two a's on the stack over $.
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Now (q1, bb, aa$).');
  await expect(page.locator('.vars')).toContainText(/height\s*=?\s*3/);
  await op(page, 'Run', 'aab');
  await toEnd(page);
  await expect(narration(page)).toContainText('So the machine rejects aab.');
  await expect(stage(page).locator('text', { hasText: '✗ reject' })).toHaveCount(1);
});

test('a guess shows every branch, the ones that die, then the accepting computation', async ({
  page,
}) => {
  await fast(page);
  await op(page, 'Load', PALINDROMES);
  await expect(narration(page)).toContainText('It is nondeterministic because in q1');
  await op(page, 'Run', 'abba');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'The accepting computation takes 7 moves; the search explored 15 configurations to find it.',
  );
  const every = await total(page);
  await page.getByRole('tab', { name: 'Trace' }).click();
  const trace = page.getByRole('region', { name: 'Trace table' });
  await expect(trace).toContainText('2 branches die');
  await expect(trace).toContainText('Now play back the accepting computation');
  // Only the computation: fewer steps, and a sentence about the search first.
  await option(page, 'The accepting computation only');
  await expect.poll(() => total(page)).toBeLessThan(every);
  await expect(trace).toContainText('it explored 15 configurations and found an accepting');
});

test('a search that cannot end stops at the cap and says so', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', LEFT_RECURSION);
  await op(page, 'Run', 'ab');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'The search has made 200 configurations, its cap, without finding an accepting one',
  );
  await expect(narration(page)).toContainText('It does not mean ab is rejected');
  await expect(stage(page).locator('text', { hasText: '? stopped' })).toHaveCount(1);
  // The deep stack shows its top and a count of the cells below.
  await expect(stage(page).locator('text', { hasText: /^\+\d+$/ })).toHaveCount(1);
});

test('accepting by empty stack is an option, and the pseudocode follows it', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', ONE_STATE);
  await expect(narration(page)).toContainText('so by final state it accepts nothing');
  await option(page, 'Empty stack (Hopcroft and Ullman)');
  await expect(page.locator('.code')).toContainText('its stack is ε: accept');
  await op(page, 'Run', 'aabb');
  await toEnd(page);
  await expect(narration(page)).toContainText('and its stack is empty, so it accepts aabb.');
});

test('a batch is tested word by word', async ({ page }) => {
  await fast(page);
  await op(page, 'Test', '+ab +aabb -aab +ba');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Done: 3 of 4 words do what they should. ba is rejected but should be accepted.',
  );
});

test('text it cannot read is refused with the item named', async ({ page }) => {
  await op(page, 'Load', 'q0 a, ZZ -> q1 AZ');
  await expect(page.getByRole('alert')).toContainText(
    '"ZZ" in "q0 a, ZZ -> q1 AZ" cannot be popped',
  );
  await op(page, 'Run', 'a%b');
  await expect(page.getByRole('alert')).toContainText('"a%b" is not a word');
  await op(page, 'Run', 'abc');
  await expect(narration(page)).toContainText('"c" is not in the input alphabet');
});

test('the panels sit beside the diagram on a laptop and under it on a phone', async ({
  page,
}, info) => {
  await fast(page);
  await op(page, 'Run', 'aabb');
  const box = (text: string | RegExp) =>
    stage(page).locator('text', { hasText: text }).first().boundingBox();
  await expect
    .poll(async () => {
      // The label of the last move, into q3 at the end of the diagram, and the stack's heading.
      const label = await box('ε, $ → ε');
      const stack = await box(/^stack$/);
      if (!label || !stack) return 'not drawn';
      if (stack.x > label.x + label.width) return 'beside';
      if (stack.y > label.y + 40) return 'under';
      return 'overlapping';
    })
    .toBe(info.project.name === 'phone' ? 'under' : 'beside');
  // Move labels, state names, tape symbols and configurations: at least 9 CSS pixels tall.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /→|^q\d$|^[ab$]$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await expect.poll(async () => (await heights()).length).toBeGreaterThan(10);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(9);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/pda/#practice=24680&n=4');
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText(/Not quite|Yes\./);
  if ((await feedback.textContent())?.includes('Not quite')) {
    const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\.(\s|$)/)![1]!;
    await first.getByRole('button', { name: 'Try again' }).click();
    const radio = first.getByRole('radio', { name: answer, exact: true });
    if (await radio.count()) await radio.check();
    else await first.getByRole('textbox').fill(answer);
    await first.getByRole('button', { name: 'Check' }).click();
    await expect(feedback).toContainText('Yes.');
  }
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /Run on /);
});

test('the concept page loads and plays examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Even palindromes' }).first().click();
  await expect(page.getByText('Loaded "Even palindromes: guess the middle"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText('aab');
});

test('a run with dying branches, the stack and the badge pass axe', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', PALINDROMES);
  await op(page, 'Run', 'abba');
  await toEnd(page);
  const scan = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  await settled(page);
  expect((await scan()).violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  // Back to a move where two branches die.
  for (let i = 0; i < 11; i++) await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('2 branches die');
  await settled(page);
  expect((await scan()).violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});
