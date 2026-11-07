import { expect, test, type Page } from '@playwright/test';
import { showMe, settled } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Graph or vertex', { exact: true });

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

async function style(page: Page, label: string) {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel(label).check();
  await page.getByText('Options', { exact: true }).click();
}

const DEEP = '(A (B (D (G (E (C (F (H H) F) C) E) G) D) B) A)';

test.beforeEach(async ({ page }) => {
  await page.goto('/dfs/');
  await expect(
    page.getByRole('heading', { name: 'Depth-first search', exact: true }),
  ).toBeVisible();
});

test('DFS from A goes deep, and the times nest', async ({ page }) => {
  await fast(page);
  await op(page, 'Run DFS from', 'A');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'one depth-first tree, with 7 tree edges and 3 back edges',
  );
  await expect(narration(page)).toContainText(DEEP);
  await expect(stage(page)).toHaveAttribute('aria-label', /Times so far: A 1\/16, B 2\/15/);
});

test('a directed graph shows every kind of edge, with letters', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', 'A>B, A>C, B>C, C>A, C>F, D>B, D>E, E>D, E>F');
  await op(page, 'Run DFS from', 'A');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    '2 depth-first trees, rooted at A and D, with 4 tree edges, 2 back edges, 1 forward edge and 2 cross edges',
  );
  await expect(page.locator('.vars')).toContainText(/back\s*2/);
  await expect(page.locator('.vars')).toContainText(/forward\s*1/);
  await expect(page.locator('.vars')).toContainText(/cross\s*2/);
});

test('an explicit stack changes the order, and pushing in reverse restores it', async ({
  page,
}) => {
  await fast(page);
  await style(page, 'An explicit stack, neighbours pushed A to Z');
  await expect(page.locator('.code')).toContainText('PUSH(S, (v, u))');
  await op(page, 'Run DFS from', 'A');
  await toEnd(page);
  await expect(narration(page)).toContainText('(A (C (F (H (G (E (B (D D) B) E) G) H) F) C) A)');
  await page.getByRole('button', { name: 'Back to the previous operation' }).click();
  for (let i = 0; i < 12; i++) {
    if ((await narration(page).textContent())?.includes('A pushed B and C')) break;
    await page.getByRole('button', { name: 'Step forward' }).click();
  }
  await expect(narration(page)).toContainText(
    'A pushed B and C. The last one pushed, C, is on top, so it comes next, before B. The recursion would take B first.',
  );
  await style(page, 'An explicit stack, neighbours pushed Z to A');
  await toEnd(page);
  await expect(narration(page)).toContainText(DEEP);
});

test('ten vertices with the call stack, table and nesting stay readable', async ({ page }) => {
  await fast(page);
  await op(
    page,
    'Load',
    'A-B, A-C, A-D, B-E, B-F, C-F, C-G, D-G, D-H, E-I, F-I, F-J, G-J, H-J, I-J',
  );
  await op(page, 'Run DFS from', 'A');
  await toEnd(page);
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Step back' }).click();
  // Poll: right after stepping back, shapes that are fading in still measure 0 px tall.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^([A-J]|\d+|\d+\/\d*|\(?[A-J]\)?)$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await settled(page);
  await expect.poll(async () => (await heights()).length).toBeGreaterThan(40);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(9);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/dfs/#practice=13579&n=5');
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
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
  await expect(stage(page)).toHaveAttribute('aria-label', /DFS from \w+, time \d+\./);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Every kind' }).first().click();
  await expect(page.getByText('Loaded "A directed graph with every kind of edge"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});
