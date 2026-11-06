import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Cities or graph', { exact: true });

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function option(page: Page, label: string) {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel(label).check();
  await page.getByText('Options', { exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tsp/');
  await expect(
    page.getByRole('heading', { name: 'Traveling salesperson: exact vs approximate', exact: true }),
  ).toBeVisible();
});

test('the tree walk ends within twice the optimum', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Find a tour', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('length 310');
  await expect(narration(page)).toContainText('ratio 1.13');
  await expect(stage(page)).toHaveAttribute('aria-label', /Optimum 275\. Ratio 1\.13\./);
});

test('Held-Karp fills a readable table and finds the optimum', async ({ page }) => {
  await option(page, 'Held-Karp dynamic programming (exact)');
  await expect(page.locator('.code')).toContainText('HELD-KARP(G, d)');
  await fast(page);
  await input(page).fill('A(10,10) B(80,20) C(50,90) D(20,60) E(60,50)');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Find a tour', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('That is the optimum: ratio 1.');
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Step back' }).click();
  await expect
    .poll(async () => {
      const heights = await stage(page)
        .locator('text.shape')
        .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      return Math.min(...heights.filter((h) => h > 0));
    })
    .toBeGreaterThan(6);
});

test('nearest neighbour with 2-opt reaches the optimum here', async ({ page }) => {
  await option(page, 'Nearest neighbour (greedy, no guarantee)');
  await option(page, 'Improve the tour with 2-opt');
  await expect(page.locator('.code')).toContainText('2-OPT(H)');
  await fast(page);
  await page.getByRole('button', { name: 'Find a tour', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('2-opt took it from 310 to 275');
});

test('a graph that is not complete is refused', async ({ page }) => {
  await input(page).fill('A-B:1, B-C:2');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('A-C is missing');
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Held-Karp fills its table' }).first().click();
  await expect(page.getByText('Loaded "Held-Karp fills its table"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/tsp/#practice=24680&n=4');
  await expect(page.locator('.question')).toHaveCount(4);
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
  await expect(stage(page)).toHaveAttribute('aria-label', /Optimum \d+\./);
});
