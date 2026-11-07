import { expect, test, type Page } from '@playwright/test';
import { showMe, settled } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Graph or vertex', { exact: true });

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await input(page).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

const LOOP = 'A>B:3, A>C:8, B>C:2, B>D:7, C>D:1, D>A:2';
const ROADS =
  'A-B:2, A-C:6, A-E:7, A-F:6, B-E:3, B-F:3, C-D:4, C-F:7, D-F:4, D-G:2, E-G:7, E-H:1, F-G:2, G-H:9';

test.beforeEach(async ({ page }) => {
  await page.goto('/floyd-warshall/');
  await expect(page.getByRole('heading', { name: 'Floyd-Warshall', exact: true })).toBeVisible();
});

test('every pair, then a path read backwards from Π', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', LOOP);
  await op(page, 'Run Floyd-Warshall');
  await toEnd(page);
  await expect(narration(page)).toContainText('D holds the shortest distance between every pair');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /D rows: A: 0 3 5 6; B: 5 0 2 3; C: 3 6 0 1; D: 2 5 7 0\./,
  );
  await op(page, 'Path', 'A D');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'The shortest path from A to D is A → B → C → D, with weight D[A][D] = 6.',
  );
});

test('the cell being updated and the two it reads are marked', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', LOOP);
  await op(page, 'Run Floyd-Warshall');
  await toEnd(page);
  // Back past "Round 4 done" to the round's last improvement: D[C][B] through D.
  const back = page.getByRole('button', { name: 'Step back' });
  await back.click();
  await back.click();
  await expect(narration(page)).toContainText('D[C][B] = min(D[C][B], D[C][D] + D[D][B])');
  await expect(narration(page)).toContainText('Going through D is shorter');
  // D[C][B] and Π[C][B] are updated; D[C][D], D[D][B] and Π[D][B] are read.
  await expect.poll(() => stage(page).locator('rect.role-active').count()).toBe(2);
  await expect.poll(() => stage(page).locator('rect.role-compare').count()).toBe(3);
});

test('a negative cycle shows on the diagonal and is narrated', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', 'A>B:1, B>C:-2, C>A:-1, C>D:2');
  await op(page, 'Run Floyd-Warshall');
  await toEnd(page);
  await expect(narration(page)).toContainText('A, B and C lie on a negative cycle');
  await expect(page.locator('.narration')).toHaveClass(/error/);
  await expect(stage(page).locator('rect.role-error')).toHaveCount(3);
  await op(page, 'Path', 'A D');
  await toEnd(page);
  await expect(narration(page)).toContainText('No shortest path from A to D');
});

test('a next-hop matrix changes the pseudocode and reads forwards', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('next: the first step from i').check();
  await page.getByText('Options', { exact: true }).click();
  await expect(page.locator('.code')).toContainText('next_ij = next_ik');
  await fast(page);
  await op(page, 'Load', LOOP);
  await op(page, 'Path', 'A D');
  await toEnd(page);
  await expect(narration(page)).toContainText('A → B → C → D');
});

test('eight vertices and fourteen edges stay readable', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', ROADS);
  await op(page, 'Run Floyd-Warshall');
  await toEnd(page);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Step back' }).click();
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^([A-H]|[0-9]{1,2}|∞)$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await settled(page);
  await expect.poll(async () => (await heights()).length).toBeGreaterThan(100);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(9);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/floyd-warshall/#practice=24680&n=5');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /Floyd-Warshall\. /);
});

test('compare mode runs Π and next side by side on the same graph', async ({ page }) => {
  await page.goto('/floyd-warshall/#compare=floyd-warshall');
  const sides = page.locator('.sides > .side');
  await sides.nth(1).getByText('Options').click();
  await sides.nth(1).getByLabel('next: the first step from i').check();
  await fast(page);
  await op(page, 'Run Floyd-Warshall');
  await toEnd(page);
  for (const i of [0, 1]) {
    await expect(sides.nth(i).locator('.stage > svg')).toHaveAttribute(
      'aria-label',
      /Floyd-Warshall\. Done\. D rows: A: 0 3 2 6 5 9 9;/,
    );
  }
});
