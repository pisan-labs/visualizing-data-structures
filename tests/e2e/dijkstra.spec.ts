import { expect, test, type Page } from '@playwright/test';

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

const ROADS =
  'A-B:2, A-C:6, A-E:7, A-F:6, B-E:3, B-F:3, C-D:4, C-F:7, D-F:4, D-G:2, E-G:7, E-H:1, F-G:2, G-H:9';

test.beforeEach(async ({ page }) => {
  await page.goto('/dijkstra/');
  await expect(
    page.getByRole('heading', { name: "Dijkstra's shortest paths", exact: true }),
  ).toBeVisible();
});

test('Dijkstra from A settles the closest vertex first', async ({ page }) => {
  await fast(page);
  await op(page, 'Run Dijkstra from', 'A');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Shortest distances from A: B 3, C 2, D 6, E 5, F 9, G 9.',
  );
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Dijkstra from A\. Settled: A, C, B, E, D, F, G\. Queue: empty\./,
  );
});

test('a negative edge is refused, and the page says why and where to go', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', 'A>B:2, A>C:4, C>B:-3, B>D:2');
  await expect(narration(page)).toContainText('Dijkstra refuses those');
  await op(page, 'Run Dijkstra from', 'A');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Here it would settle B with d = 2, but A → C → B costs 1.',
  );
  await expect(narration(page)).toContainText('/bellman-ford/');
  await expect(page.locator('.narration')).toHaveClass(/error/);
  // The graph is left as it was typed.
  await expect(stage(page)).toHaveAttribute('aria-label', /C to B \(weight -3\)/);
});

test('the lazy queue inserts again and skips stale entries', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Insert again, skip stale entries (heap code)').check();
  await page.getByText('Options', { exact: true }).click();
  await expect(page.locator('.code')).toContainText('INSERT(Q, (v, v.d))');
  await fast(page);
  await op(page, 'Run Dijkstra from', 'A');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /Settled: A, C, B, E, D, F, G\./);
  // Step back to the last stale entry being skipped.
  const back = page.getByRole('button', { name: 'Step back' });
  for (let i = 0; i < 4; i++) await back.click();
  await expect(narration(page)).toContainText('It is stale, so skip it.');
});

test('eight vertices and fourteen edges stay readable', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', ROADS);
  await op(page, 'Run Dijkstra from', 'A');
  await toEnd(page);
  for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Step back' }).click();
  // Vertex names and table cells: every one at least 9 CSS pixels tall, once drawing settles.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^([A-H]|[0-9]{1,2}|∞)$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await expect.poll(async () => (await heights()).length).toBeGreaterThan(40);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(9);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/dijkstra/#practice=24680&n=5');
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
  await first.getByRole('button', { name: 'Show me' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(stage(page)).toHaveAttribute('aria-label', /Dijkstra from A\./);
});

test('compare mode puts Dijkstra and Bellman-Ford on the same graph', async ({ page }) => {
  await page.goto('/dijkstra/#compare=bellman-ford');
  await expect(
    page.getByRole('heading', { name: "Dijkstra's shortest paths vs Bellman-Ford" }),
  ).toBeVisible();
  const sides = page.locator('.sides > .side');
  // Both start from the same weighted graph.
  for (const i of [0, 1]) {
    await expect(sides.nth(i).locator('.stage > svg')).toHaveAttribute(
      'aria-label',
      /^A weighted directed graph with 7 vertices and 10 edges\. A to B \(weight 5\), C \(weight 2\);/,
    );
  }
  await fast(page);
  await op(page, 'Load', 'A>B:4, A>C:1, C>B:2, B>D:1, C>D:5');
  await op(page, 'Run Dijkstra from', 'A');
  await toEnd(page);
  await expect(sides.nth(0).locator('.narration .chip')).toHaveText('run("A")');
  await expect(sides.nth(1).locator('.narration .chip')).toHaveText('run("A")');
  await expect(sides.nth(0).locator('.stage > svg')).toHaveAttribute(
    'aria-label',
    /4 vertices and 5 edges.*Dijkstra from A\. Settled: A, C, B, D\. Queue: empty\. Distances so far: A 0, B 3, C 1, D 4\./,
  );
  await expect(sides.nth(1).locator('.stage > svg')).toHaveAttribute(
    'aria-label',
    /4 vertices and 5 edges.*Bellman-Ford from A\..*Distances so far: A 0, B 3, C 1, D 4\./,
  );
});

test('compare mode runs both queues on the same graph', async ({ page }) => {
  await page.goto('/dijkstra/#compare=dijkstra');
  const sides = page.locator('.sides > .side');
  await sides.nth(1).getByText('Options').click();
  await sides.nth(1).getByLabel('Insert again, skip stale entries (heap code)').check();
  await fast(page);
  await op(page, 'Run Dijkstra from', 'A');
  await toEnd(page);
  for (const i of [0, 1]) {
    await expect(sides.nth(i).locator('.stage > svg')).toHaveAttribute(
      'aria-label',
      /Dijkstra from A\. Settled: A, C, B, E, D, F, G\. Queue: empty\. Distances so far: A 0, B 3, C 2, D 6, E 5, F 9, G 9\./,
    );
  }
});
