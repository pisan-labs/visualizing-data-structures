/**
 * Regular expression to NFA: build one piece at a time, run words, switch the construction and
 * the union sign, read the drawing on a phone, and practice. The page also runs through
 * all-vizzes.spec.ts.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Expression or word', { exact: true });

async function op(page: Page, name: 'Build' | 'Run', value: string) {
  await input(page).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
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
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel(label).check();
  await page.getByText('Options', { exact: true }).click();
}

/** Where a state's name is on screen. */
/**
 * Where a state's name sits in the drawing, in scene units. Not screen pixels: the stage gets
 * narrower when the page grows a scrollbar, which moves every shape on screen.
 */
const circle = (page: Page, q: string) =>
  stage(page)
    .locator('text.shape')
    .evaluateAll(
      (els, name) =>
        els
          .filter((e) => e.textContent === name)
          // To a tenth of a unit: layouts may differ in the last float digits between steps.
          .map(
            (e) =>
              `${Number(e.getAttribute('x')).toFixed(1)},${Number(e.getAttribute('y')).toFixed(1)}`,
          )
          .join(' '),
      q,
    );

test.beforeEach(async ({ page }) => {
  await page.goto('/regex-to-nfa/');
  await expect(
    page.getByRole('heading', { name: 'Regular expression to NFA', exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('builds (a|b)*abb one piece at a time, inner parts first', async ({ page }) => {
  await op(page, 'Build', '(a|b)*abb');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Done: the NFA for (a|b)*abb has 14 states and 16 moves, with start q0 and accept state q13. The expression has m = 7 symbols and operators. That is exactly 2m',
  );
  await backTo(page, '(a|b): a new start q1 with ε-arrows into both branches');
  await expect(stage(page)).toHaveAttribute('aria-label', /3 of 10 parts built, 6 states so far\./);
  await expect(page.locator('.code li.active')).toContainText('R1|R2');
  await backTo(page, 'b: two new states, q4 and q5, and an arrow q4 → q5 labeled b.');
  await expect(page.locator('.vars')).toContainText('2 of 10');
});

test('runs words: one that ends in abb, one that does not, and one that dies', async ({ page }) => {
  await op(page, 'Run', 'aabb');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'All of aabb is read. S contains q13, an accept state, so the NFA accepts aabb.',
  );
  await expect(stage(page).getByText('accept', { exact: true })).toBeVisible();
  await backTo(page, 'Follow ε-arrows from q0: S = ε-closure(S)');
  await expect(page.locator('.code li.active')).toContainText('S = ε-closure(S)');
  await op(page, 'Run', 'abab');
  await toEnd(page);
  await expect(narration(page)).toContainText('so the NFA rejects abab.');
  await expect(stage(page).getByText('reject', { exact: true })).toBeVisible();
  await op(page, 'Run', 'cab');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'S is empty: every path has died. The NFA rejects cab without reading the rest.',
  );
});

test('explains input it cannot use, and keeps the NFA', async ({ page }) => {
  await op(page, 'Build', '(ab');
  await toEnd(page);
  await expect(narration(page)).toContainText('Nothing built. A ( is never closed');
  await op(page, 'Run', '(a|b)*');
  await toEnd(page);
  await expect(narration(page)).toContainText('looks like an expression');
  await expect(stage(page)).toHaveAttribute('aria-label', /An NFA for \(a\|b\)\*abb/);
});

test("Sipser's construction builds fewer states, and the code follows", async ({ page }) => {
  await option(page, "Sipser's: fewer states, several accept states");
  await expect(narration(page)).toContainText("Sipser's construction turned (a|b)*abb");
  await expect(page.getByRole('button', { name: 'build', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'build', exact: true }).click();
  await expect(page.locator('.code')).toContainText('F = F1 ∪ F2');
  await op(page, 'Build', '(a|b)*abb');
  await toEnd(page);
  await expect(narration(page)).toContainText('has 12 states and 15 moves');
  await op(page, 'Run', 'babb');
  await toEnd(page);
  await expect(narration(page)).toContainText('so the NFA accepts babb.');
});

test('with + for union, + is union and the pseudocode says so', async ({ page }) => {
  await option(page, 'a+b (as in Hopcroft and Ullman)');
  await page.getByRole('button', { name: 'build', exact: true }).click();
  await expect(page.locator('.code')).toContainText('P = R1+R2');
  await op(page, 'Build', '(0+1)*00');
  await toEnd(page);
  await expect(narration(page)).toContainText('the NFA for (0+1)*00 has');
  await op(page, 'Run', '1100');
  await toEnd(page);
  await expect(narration(page)).toContainText('accepts 1100');
  await op(page, 'Build', 'a|b');
  await toEnd(page);
  await expect(narration(page)).toContainText('| is not used with this setting');
});

test('pieces stay where they are while the build goes on', async ({ page }) => {
  await op(page, 'Build', '(a|b)*abb');
  await toEnd(page);
  await backTo(page, 'b: two new states, q4 and q5');
  await settled(page);
  const before = await circle(page, 'q2');
  await page.getByRole('button', { name: 'Step forward' }).click();
  await page.getByRole('button', { name: 'Step forward' }).click();
  await settled(page);
  // Within half a unit: layouts may differ by a fraction of a unit between steps; a real move
  // is many units.
  const gap = async () => {
    const [x0, y0] = before.split(',').map(Number);
    const [x1, y1] = (await circle(page, 'q2')).split(',').map(Number);
    return Math.hypot(x1! - x0!, y1! - y0!);
  };
  await expect.poll(gap).toBeLessThan(0.5);
});

test('the drawing stays readable and fits the screen', async ({ page }) => {
  await op(page, 'Build', '(a|b)*a(a|b)(a|b)');
  await op(page, 'Run', 'abab');
  await toEnd(page);
  await backTo(page, 'Read a, symbol 3 of 4');
  // State names: every one at least 9 CSS pixels tall. Poll: the last step is still animating.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^q\d+$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await settled(page);
  await expect.poll(async () => (await heights()).length).toBe(22);
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
  expect(axeFindings(results)).toEqual([]);
});

test('concept checks give feedback and Show me plays an example', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  const check = page.locator('.check').filter({ hasText: '(ab|c)*' });
  await check.getByRole('button', { name: '8', exact: true }).click();
  await expect(check).toContainText('Not quite.');
  await check.getByRole('button', { name: 'Try again' }).click();
  await check.getByRole('button', { name: '10', exact: true }).click();
  await expect(check).toContainText('Yes.');
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await page.getByRole('link', { name: "Sipser's construction", exact: true }).first().click();
  await expect(page.getByText('Loaded "Sipser\'s construction"')).toBeVisible();
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/regex-to-nfa/#practice=7&n=4');
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const first = page.locator('.question').first();
  await expect(first.locator('svg')).toBeVisible();
  // A blank answer is right when no state is active; otherwise it reveals the answer.
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
