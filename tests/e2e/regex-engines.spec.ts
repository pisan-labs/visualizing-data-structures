/**
 * Regex engines: the page opens on the growth chart, Match shows the backtracker's dead ends
 * and stack and then the simulation's sets, a long run skips ahead to the cap, the options
 * change the order and the engine shown, and the drawing reads on a phone. The page also runs
 * through all-vizzes.spec.ts.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Expression ; word', { exact: true });
const svgText = (page: Page, text: string | RegExp) =>
  stage(page).locator('text', { hasText: text });

async function op(page: Page, name: 'Match' | 'Grow', value: string) {
  await input(page).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

/** Jump to the end of the history. Playback can disable the button between check and click. */
async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** Step back until the narration matches, at most `max` steps. */
async function backTo(page: Page, text: string, max = 60) {
  for (let i = 0; i < max; i++) {
    if ((await narration(page).textContent())?.includes(text)) return;
    await page.getByRole('button', { name: 'Step back' }).click();
  }
  await expect(narration(page)).toContainText(text);
}

async function option(page: Page, label: string) {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel(label).check();
  await page.getByText('Options', { exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/regex-engines/');
  await expect(
    page.getByRole('heading', { name: 'Regex engines: backtracking vs NFA', exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('opens on the chart: the backtracker doubles and gives up at n = 13', async ({ page }) => {
  await expect(narration(page)).toContainText(
    'At n = 13 it passed 100,000 steps and the page stopped it.',
  );
  await expect(page.locator('.narration .muted')).toHaveText(/^Step (\d+) of \1$/);
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /n = 12: backtracking 57,336, NFA 102; n = 13: backtracking gave up at 100,000, NFA 110\./,
  );
  await expect(svgText(page, /^gave up$/)).toHaveCount(1);
  await expect(svgText(page, /^cap$/)).toHaveCount(1);
  // Thirteen pairs of bars (and a key for each color); the last backtracking bar is red.
  await expect(stage(page).locator('rect.role-g1')).toHaveCount(13 + 1);
  await expect(stage(page).locator('rect.role-g2')).toHaveCount(12 + 1);
});

test('Match shows each dead end and the stack, then the sets, then both counts', async ({
  page,
}) => {
  await op(page, 'Match', '(a|a)*b ; aaa');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Both reject aaa: the backtracker in 104 steps, the NFA simulation in 30 steps. The backtracker did 3.5 times the work',
  );
  await backTo(page, 'Read a, symbol 2 of 3');
  await expect(
    page.locator('.code li.active', { hasText: 'S = ε-closure(move(S, c))' }),
  ).toHaveCount(1);
  await backTo(page, 'Back up: pop (q4, 2) off the stack');
  await expect(svgText(page, /^\(q4, 2\)$/)).toHaveCount(1);
  await expect(svgText(page, /^\d+ choices$/)).toHaveCount(1);
  await expect(page.locator('.code li.active', { hasText: 'back up' })).toHaveCount(1);
  await expect(page.locator('.vars')).toContainText('backtracks');
});

test('every detail shows each visit, with the choice pushed', async ({ page }) => {
  await page.getByLabel('Detail').selectOption('3');
  await op(page, 'Match', '(a|a)*b ; aa');
  await toEnd(page);
  await backTo(page, 'Step 1: at q0, nothing read. Two ε-arrows leave it.', 120);
  await expect(narration(page)).toContainText('Try q1 first and push (q7, 0) on the stack');
  await expect(page.locator('.code li.active')).toContainText('push the second');
  await expect(svgText(page, /^\(q7, 0\)$/)).toHaveCount(1);
});

test('a long run skips ahead as the count doubles and stops at the cap', async ({ page }) => {
  await op(page, 'Match', '(a|a)*b ; aaaaaaaaaaaaaa');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'The backtracker gave up after 100,000 steps without an answer; the NFA simulation rejects aaaaaaaaaaaaaa in 118.',
  );
  await backTo(page, 'Step 100,000: still no answer');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Step 65,536:');
  await expect(svgText(page, /top 7 shown$/)).toHaveCount(1);
});

test('a match on the first path is quick, and lazy order changes the count', async ({ page }) => {
  await op(page, 'Match', '(a|a)*b ; aaaab');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Both accept aaaab: the backtracker in 23 steps, the NFA simulation in 39 steps. Here the backtracker did less work',
  );
  await op(page, 'Match', 'a?a?a?aaa ; aaa');
  await toEnd(page);
  await expect(narration(page)).toContainText('the backtracker in 66 steps');
  await option(page, 'Lazy: around a star, then into it (like *?)');
  await page.getByRole('button', { name: 'match', exact: true }).click();
  await expect(page.locator('.code')).toContainText('around a star first');
  await op(page, 'Match', 'aaa');
  await toEnd(page);
  await expect(narration(page)).toContainText('the backtracker in 12 steps');
});

test('the NFA-only setting shows the sets and still counts both', async ({ page }) => {
  await option(page, 'The NFA simulation only');
  await op(page, 'Match', '(a|b)*abb ; aababb');
  await toEnd(page);
  await expect(narration(page)).toContainText('Both accept aababb');
  await backTo(page, 'Read b, symbol 6 of 6');
  await expect(stage(page)).toHaveAttribute('aria-label', /NFA simulation: S = \{/);
});

test('Grow charts a*b without a blowup', async ({ page }) => {
  await op(page, 'Grow', 'a*b ; a');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    "From n = 1 to 16, the backtracker's steps went from 8 to 68, adding 4 with each extra a: linear.",
  );
  await expect(svgText(page, /^gave up$/)).toHaveCount(0);
});

test('explains input it cannot use', async ({ page }) => {
  await input(page).fill('a ; b ; c');
  await page.getByRole('button', { name: 'Match', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Use one semicolon');
  await op(page, 'Match', '(a|a)*b');
  await toEnd(page);
  await expect(narration(page)).toContainText('"(a|a)*b" is an expression with no word.');
  await op(page, 'Grow', '(a|a)*b ; eps');
  await toEnd(page);
  await expect(narration(page)).toContainText('Grow repeats a word, so it needs one');
});

test('the drawing stays readable and fits the screen', async ({ page }) => {
  await op(page, 'Match', '(a|b)*abb ; abababababab');
  await toEnd(page);
  await backTo(page, 'Read a, symbol 9 of 12');
  // State names: every one at least 9 CSS pixels tall. Poll: the step is still animating.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^q\d+$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await settled(page);
  await expect.poll(async () => (await heights()).length).toBe(14);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(9);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await settled(page);
  const results = await new AxeBuilder({ page })
    .include('.stage')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test('concept checks give feedback and Show me plays an example', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  const check = page.locator('.check').filter({ hasText: 'against aaaa?' });
  await check.getByRole('button', { name: '156', exact: true }).click();
  await expect(check).toContainText('Not quite.');
  await check.getByRole('button', { name: 'Try again' }).click();
  await check.getByRole('button', { name: '216', exact: true }).click();
  await expect(check).toContainText('Yes.');
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await page.getByRole('link', { name: 'A match on the first path', exact: true }).first().click();
  await expect(page.getByText('Loaded "A match on the first path"')).toBeVisible();
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/regex-engines/#practice=7&n=4');
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const first = page.locator('.question').first();
  await expect(first.locator('svg')).toBeVisible();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText(/Not quite\. The answer is|Yes\./);
  if (!(await feedback.textContent())?.startsWith('Yes.')) {
    const text = (await feedback.locator('strong').textContent()) ?? '';
    const answer = text.replace(/^Not quite\. The answer is /, '').replace(/\.$/, '');
    await first.getByRole('button', { name: 'Try again' }).click();
    const radio = first.getByRole('radio', { name: answer, exact: true });
    if (await radio.count()) await radio.check();
    else await first.getByRole('textbox').fill(answer);
    await first.getByRole('button', { name: 'Check' }).click();
    await expect(feedback).toContainText('Yes.');
  }
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});
