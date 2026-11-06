import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Bipartite graph', { exact: true });

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function run(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
  await page.getByRole('button', { name: 'Find a maximum matching', exact: true }).click();
  await toEnd(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/bipartite-matching/');
  await expect(
    page.getByRole('heading', { name: 'Bipartite matching', exact: true }),
  ).toBeVisible();
});

test("Kuhn's algorithm matches four and leaves E free", async ({ page }) => {
  const lines = () => stage(page).locator('line.arrow').count();
  await expect.poll(lines).toBeGreaterThan(0);
  const before = await lines();
  await run(page);
  await expect(narration(page)).toContainText(
    'a maximum matching of 4 edges, A–1, B–3, C–4 and D–2',
  );
  await expect(narration(page)).toContainText('Free on the left: E.');
  await expect(stage(page)).toHaveAttribute('aria-label', /Matching of 4 edges: A-1 B-3 C-4 D-2\./);
  // Matched edges are double lines: a twin beside each of the four.
  await expect.poll(lines).toBe(before + 4);
  await expect(stage(page).getByText('C–4', { exact: true })).toBeVisible();
});

test('an augmenting path is narrated with its alternating edges', async ({ page }) => {
  await run(page);
  await page.getByRole('button', { name: 'Back to the previous operation' }).click();
  const forward = page.getByRole('button', { name: 'Step forward' });
  const want = 'C – 2 = A – 1 = B – 3';
  let seen = false;
  for (let i = 0; i < 30 && !seen; i++) {
    seen = ((await narration(page).textContent()) ?? '').includes(want);
    if (!seen) await forward.click();
  }
  expect(seen).toBe(true);
});

test('Hopcroft-Karp works in phases, with layers in badges', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Hopcroft-Karp: all shortest paths per phase').check();
  await page.getByText('Options', { exact: true }).click();
  await expect(page.locator('.code')).toContainText('HOPCROFT-KARP');
  await run(page);
  await expect(narration(page)).toContainText('in 2 phases');
});

test('a graph with an odd cycle is refused', async ({ page }) => {
  await input(page).fill('A-B, B-C, C-A');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('not bipartite');
});

test('the rows layout fits a phone and a laptop', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Rows: left side on top').check();
  await page.getByText('Options', { exact: true }).click();
  await run(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(stage(page)).toHaveAttribute('aria-label', /It is maximum\./);
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/bipartite-matching/#practice=97531&n=5');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /A bipartite graph/);
});
