import { expect, test, type Page } from '@playwright/test';
import { settled } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Graph or vertex', { exact: true });

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/prim/');
  await expect(
    page.getByRole('heading', { name: "Prim's minimum spanning tree", exact: true }),
  ).toBeVisible();
});

test('Prim from A adds the lightest edge out of the tree each time', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Run Prim', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('total weight 19');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Prim from A\. In the tree: A, C, D, B, E, G, F, H\. Queue: empty\./,
  );
});

test('the start vertex and the lazy queue are options', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Insert again, skip stale entries (heap code)').check();
  await page.getByRole('radio', { name: 'H', exact: true }).check();
  await page.getByText('Options', { exact: true }).click();
  await expect(page.locator('.code')).toContainText('INSERT(Q, (v, v.key))');
  await fast(page);
  await page.getByRole('button', { name: 'Run Prim', exact: true }).click();
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Prim from H\. In the tree: H, F, D, C, A, B, E, G\./,
  );
  await expect(narration(page)).toContainText('total weight 19');
});

test('a directed graph is refused', async ({ page }) => {
  await fast(page);
  await input(page).fill('A>B:1, B>C:2');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Run Prim', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('needs an undirected graph');
});

test('the tree and its panels stay readable', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Run Prim', exact: true }).click();
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
  await expect.poll(async () => (await heights()).length).toBeGreaterThan(30);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(8);
});

test('compare mode runs Prim and Kruskal on the same graph', async ({ page }) => {
  await page.goto('/prim/#compare=kruskal');
  await expect(
    page.getByRole('heading', {
      name: "Prim's minimum spanning tree vs Kruskal's minimum spanning tree",
    }),
  ).toBeVisible();
  const sides = page.locator('.sides > .side');
  for (const i of [0, 1])
    await expect(sides.nth(i).locator('.stage > svg')).toHaveAttribute(
      'aria-label',
      /^A weighted undirected graph with 8 vertices and 14 edges\./,
    );
  await fast(page);
  await input(page).fill('A-B:4, A-C:1, B-C:2, B-D:5, C-D:8');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Run Prim', exact: true }).click();
  await toEnd(page);
  await expect(sides.nth(0).locator('.stage > svg')).toHaveAttribute(
    'aria-label',
    /Tree edges: A-C, B-C, B-D\. Weight 8\./,
  );
  await expect(sides.nth(1).locator('.stage > svg')).toHaveAttribute(
    'aria-label',
    /Kruskal\. Tree edges: A-C, B-C, B-D, weight 8\./,
  );
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/prim/#practice=13579&n=4');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /Prim from A\./);
});
