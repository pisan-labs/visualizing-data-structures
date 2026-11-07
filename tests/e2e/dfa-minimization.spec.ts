import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Automaton', { exact: true });

const SUBSETS =
  'start B; accept D F G H; A a,b -> A; B a -> E; B b -> B; C a -> A; C b -> D; D a,b -> D; E a -> E; E b -> F; F a -> H; F b -> F; G a,b -> D; H a -> H; H b -> F';

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

async function method(page: Page, label: string) {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel(label).check();
  await page.getByText('Options', { exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dfa-minimization/');
  await expect(page.getByRole('heading', { name: 'DFA minimization', exact: true })).toBeVisible();
});

test('the starting DFA loses one state: q0 and q3 merge', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Minimize', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'the minimal DFA has 3 states, 1 fewer than the DFA loaded. q0 and q3 both become q0.',
  );
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Blocks: 1: q0, q3; 2: q2; 3: q1\. The minimal DFA has 3 states: q0 \(q0, q3\), q1 \(q1\), q2 \(q2\)\./,
  );
  await expect(stage(page).locator('text', { hasText: /^Minimal DFA$/ })).toHaveCount(1);
});

test('table filling marks pairs with the symbol that separates them', async ({ page }) => {
  await method(page, 'Table filling: mark pairs (Myhill–Nerode)');
  await expect(page.locator('.code')).toContainText('mark {p, q} with c');
  await fast(page);
  await page.getByRole('button', { name: 'Minimize', exact: true }).click();
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Marked pairs: q0 and q2 by ε; q1 and q2 by ε; q2 and q3 by ε; q0 and q1 by b; q1 and q3 by b\./,
  );
  await expect(stage(page).locator('text', { hasText: /^X b$/ })).toHaveCount(2);
  await expect(narration(page)).toContainText('the minimal DFA has 3 states');
});

test('a dead state comes first, then unreachable states go', async ({ page }) => {
  await fast(page);
  await load(page, 'start q0; accept q1 q3; q0 a -> q1; q1 a,b -> q1; q2 a,b -> q3; q3 a -> q2');
  await page.getByRole('button', { name: 'Minimize', exact: true }).click();
  await toEnd(page);
  await page.getByRole('button', { name: 'Back to the previous operation' }).click();
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(narration(page)).toContainText('add a dead state, dead, that never accepts');
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(narration(page)).toContainText('No word takes q0 to q2 and q3');
  await toEnd(page);
  await expect(narration(page)).toContainText('the minimal DFA has 3 states, 1 fewer');
});

test('eight states shrink to three, and the drawing stays readable', async ({ page }) => {
  await fast(page);
  await load(page, SUBSETS);
  await page.getByRole('button', { name: 'Minimize', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('the minimal DFA has 3 states, 5 fewer');
  await page.getByRole('button', { name: 'Step back' }).click();
  // State names and table cells: each at least 8 CSS pixels tall. Poll: still animating.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^([A-H]|\d|#\d)$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await settled(page);
  await expect.poll(async () => (await heights()).length).toBeGreaterThan(12);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(8);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('an NFA is refused with a reason', async ({ page }) => {
  await load(page, 'q0 a -> q1; q0 a -> q0; accept q1');
  await expect(page.getByRole('alert')).toContainText('That is an NFA: q0 has 2 moves on a.');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/dfa-minimization/#practice=13579&n=4');
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
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Minimizing by (partition refinement|table filling)\./,
  );
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations mid-run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await page.getByRole('button', { name: 'Minimize', exact: true }).click();
    await toEnd(page);
    await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
