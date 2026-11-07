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

const TEN = 'A-B, A-C, A-D, B-E, B-F, C-F, C-G, D-G, D-H, E-I, F-I, F-J, G-J, H-J, I-J';

test.beforeEach(async ({ page }) => {
  await page.goto('/bfs/');
  await expect(
    page.getByRole('heading', { name: 'Breadth-first search', exact: true }),
  ).toBeVisible();
});

test('BFS from A finds every distance', async ({ page }) => {
  await fast(page);
  await op(page, 'Run BFS from', 'A');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'It reached 8 of 8 vertices, in the order A, B, C, D, E, F, G, H. The farthest are G and H, 3 edges away',
  );
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Distances so far: A 0, B 1, C 1, D 2, E 2, F 2, G 3, H 3\./,
  );
});

test('a directed graph leaves a vertex unreachable, and says so', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', 'A>B, B>C, D>A');
  await op(page, 'Run BFS from', 'A');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'D is not reachable from A along the edges’ directions, so it stays white, with d = ∞',
  );
  // A start vertex that is not there is explained instead of run.
  await op(page, 'Run BFS from', 'Q');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'There is no vertex Q. This graph has A, B, C and D.',
  );
});

test('a visited flag changes the pseudocode and the table', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('A visited flag: true or false').check();
  await page.getByText('Options', { exact: true }).click();
  await expect(page.locator('.code')).toContainText('v.visited = true');
  await fast(page);
  await op(page, 'Run BFS from', 'A');
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(stage(page).locator('text', { hasText: /^visited$/ })).toHaveCount(1);
});

test('ten vertices, fifteen edges, the queue and the table stay readable', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', TEN);
  await op(page, 'Run BFS from', 'A');
  await toEnd(page);
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Step back' }).click();
  // Vertex names, queue cells and table cells: every one at least 9 CSS pixels tall. Poll: the
  // last step back is still animating (mid-tween, half the labels are faded copies).
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^([A-J]|[0-9]|∞)$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await settled(page);
  await expect.poll(async () => (await heights()).length).toBeGreaterThan(40);
  expect(Math.min(...(await heights()))).toBeGreaterThanOrEqual(9);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/bfs/#practice=24680&n=5');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /BFS from \w+\./);
});

test('compare mode runs both sides on the same graph', async ({ page }) => {
  await page.goto('/bfs/#compare=bfs');
  await expect(
    page.getByRole('heading', { name: 'Breadth-first search vs Breadth-first search' }),
  ).toBeVisible();
  const sides = page.locator('.sides > .side');
  await sides.nth(1).getByText('Options').click();
  await sides.nth(1).getByLabel('A visited flag: true or false').check();
  await fast(page);
  await op(page, 'Run BFS from', 'C');
  await toEnd(page);
  for (const i of [0, 1]) {
    await expect(sides.nth(i).locator('.stage > svg')).toHaveAttribute(
      'aria-label',
      /BFS from C\. Queue: empty\. Distances so far: A 1, B 2, C 0, D 3, E 1, F 1, G 2, H 2\./,
    );
  }
});

test('compare mode puts BFS and DFS side by side on the same graph', async ({ page }) => {
  await page.goto('/bfs/#compare=dfs');
  await expect(
    page.getByRole('heading', { name: 'Breadth-first search vs Depth-first search' }),
  ).toBeVisible();
  const sides = page.locator('.sides > .side');
  // Both start from the same graph.
  for (const i of [0, 1]) {
    await expect(sides.nth(i).locator('.stage > svg')).toHaveAttribute(
      'aria-label',
      /^An undirected graph with 8 vertices and 10 edges\. A with B, C; B with A, D, E;/,
    );
  }
  await fast(page);
  await op(page, 'Load', 'A-B, A-C, B-D, C-D, D-E');
  await op(page, 'Run BFS from', 'A');
  await toEnd(page);
  await expect(sides.nth(0).locator('.narration .chip')).toHaveText('run("A")');
  await expect(sides.nth(1).locator('.narration .chip')).toHaveText('run("A")');
  await expect(sides.nth(0).locator('.stage > svg')).toHaveAttribute(
    'aria-label',
    /5 vertices and 5 edges.*BFS from A\. Queue: empty\. Distances so far: A 0, B 1, C 1, D 2, E 3\./,
  );
  await expect(sides.nth(1).locator('.stage > svg')).toHaveAttribute(
    'aria-label',
    /5 vertices and 5 edges.*DFS from A, time 10\. Times so far: A 1\/10, B 2\/9, C 4\/5, D 3\/8, E 6\/7\./,
  );
});
