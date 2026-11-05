import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Network', { exact: true });

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function run(page: Page) {
  await fast(page);
  await page.getByRole('button', { name: 'Find min-cost flow', exact: true }).click();
  await toEnd(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/min-cost-flow/');
  await expect(page.getByRole('heading', { name: 'Min-cost flow', exact: true })).toBeVisible();
});

test('the cheapest maximum flow on the starting network', async ({ page }) => {
  await run(page);
  await expect(narration(page)).toContainText('4 × 15 + 4 × 20 + 5 × 21 + 8 × 22 + 2 × 23 = 467');
  await expect(stage(page)).toHaveAttribute('aria-label', /Finished: flow 23, cost 467\./);
  await expect(stage(page).getByText('2×$23: s a b d c t', { exact: true })).toBeVisible();
});

test('a reverse arc gives its cost back', async ({ page }) => {
  await input(page).fill('s>a:1:1, a>b:1:1, b>t:1:1, s>b:1:3, a>t:1:4');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await run(page);
  await expect(narration(page)).toContainText('a maximum flow of 2 at the least possible cost, 9');
  const back = page.getByRole('button', { name: 'Step back' });
  const want = 'b→a (-1) (sending back)';
  let seen = false;
  for (let i = 0; i < 30 && !seen; i++) {
    seen = ((await narration(page).textContent()) ?? '').includes(want);
    if (!seen) await back.click();
  }
  expect(seen).toBe(true);
});

test('Dijkstra with potentials adds h to the table and the pseudocode', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Dijkstra with potentials (reduced costs)').check();
  await page.getByText('Options', { exact: true }).click();
  await expect(page.locator('.code')).toContainText('h(v) = h(v) + d(v)');
  await run(page);
  await expect(narration(page)).toContainText('467');
  await expect(stage(page).locator('text.shape', { hasText: /^h$/ })).toHaveCount(1);
});

test('a target stops early at the cheapest flow of that size', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Units to send (0 for as many as possible)').fill('10');
  await page.getByText('Options', { exact: true }).click();
  await expect(page.locator('.code')).toContainText('while |f| < k and t in reach');
  await run(page);
  await expect(narration(page)).toContainText('10 units sent, the target, at a total cost of 182');
});

test('arcs both ways are refused', async ({ page }) => {
  await input(page).fill('s>a:3:1, a>s:2:1, a>t:2:1');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('go both ways');
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/min-cost-flow/#practice=13579&n=5');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /A flow network/);
});
