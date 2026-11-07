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

// Eight vertices and fourteen edges, all from an earlier letter to a later one: a DAG.
const ROADS =
  'A>B:2, A>C:6, A>E:7, A>F:6, B>E:3, B>F:3, C>D:4, C>F:7, D>F:4, D>G:2, E>G:7, E>H:1, F>G:2, G>H:9';

test.beforeEach(async ({ page }) => {
  await page.goto('/dag-shortest-paths/');
  await expect(
    page.getByRole('heading', { name: 'Shortest paths in a DAG', exact: true }),
  ).toBeVisible();
});

test('sorts first, then relaxes each edge once', async ({ page }) => {
  await fast(page);
  await op(page, 'Run from', 'A');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Done: each of the 10 edges was relaxed exactly once, in topological order.',
  );
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Order: A, C, B, E, F, D, G\. Distances so far: A 0, B 3, C 2, D 6, E 5, F 9, G 9\./,
  );
});

test('a cycle is refused, named and drawn', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', 'A>B:2, B>C:3, C>D:1, D>B:-2, A>E:4');
  await op(page, 'Run from', 'A');
  await toEnd(page);
  await expect(narration(page)).toContainText('So B → C → D → B is a cycle');
  await expect(narration(page)).toContainText('cannot run here');
  await expect(page.locator('.narration')).toHaveClass(/error/);
  await expect(stage(page)).toHaveAttribute('aria-label', /Cycle: B → C → D → B\./);
});

test('longest paths find the critical path', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Longest paths: the critical path').check();
  await page.getByText('Options', { exact: true }).click();
  await expect(page.locator('.code')).toContainText('if v.d < u.d + w(u, v)');
  await fast(page);
  await op(page, 'Load', 'A>B:3, A>C:2, B>D:4, C>D:6, C>E:3, D>F:3, E>F:5, F>G:1');
  await op(page, 'Run from', 'A');
  await toEnd(page);
  await expect(narration(page)).toContainText('The critical path is A → C → D → F → G, total 12');
});

test('eight vertices and fourteen edges stay readable', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', ROADS);
  await op(page, 'Run from', 'A');
  await toEnd(page);
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Step back' }).click();
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^([A-H]|[0-9]{1,2}|∞)$/.test(e.textContent ?? ''))
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
  await page.goto('/dag-shortest-paths/#practice=24680&n=5');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /(DAG shortest|Longest) paths from A\./);
});

test('compare mode runs it beside Dijkstra on the same graph', async ({ page }) => {
  await page.goto('/dag-shortest-paths/#compare=dijkstra');
  await expect(
    page.getByRole('heading', { name: "Shortest paths in a DAG vs Dijkstra's shortest paths" }),
  ).toBeVisible();
  await fast(page);
  await op(page, 'Run from', 'A');
  await toEnd(page);
  const sides = page.locator('.sides > .side');
  for (const i of [0, 1]) {
    await expect(sides.nth(i).locator('.stage > svg')).toHaveAttribute(
      'aria-label',
      /Distances so far: A 0, B 3, C 2, D 6, E 5, F 9, G 9\./,
    );
  }
});
