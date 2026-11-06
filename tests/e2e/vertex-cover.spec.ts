import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Graph or vertex', { exact: true });

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
  await page.goto('/vertex-cover/');
  await expect(
    page.getByRole('heading', { name: 'Minimum vertex cover', exact: true }),
  ).toBeVisible();
});

test('the matching method takes twice the optimum on the starting graph', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Find a cover', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('8 vertices');
  await expect(narration(page)).toContainText('ratio 2');
  await expect(stage(page)).toHaveAttribute('aria-label', /Uncovered edges: none\. Optimum 4\./);
});

test('branching finds a minimum cover', async ({ page }) => {
  await option(page, 'Exact: branch on an uncovered edge');
  await expect(page.locator('.code')).toContainText('BRANCH(C ∪ {u})');
  await fast(page);
  await page.getByRole('button', { name: 'Find a cover', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('That is a minimum cover: ratio 1.');
});

test('greedy falls into its trap', async ({ page }) => {
  await option(page, 'Greedy: the vertex with most uncovered edges');
  await fast(page);
  await input(page).fill(
    'A-I, A-J, A-K, A-L, A-M, A-N, B-I, B-J, B-K, B-L, B-M, C-I, C-J, C-K, C-L, D-I, D-J, D-K, E-L, E-M, E-N, F-I, F-J, G-K, G-L, H-M, H-N',
  );
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Find a cover', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('A minimum cover has 6');
  await expect
    .poll(async () => {
      const heights = await stage(page)
        .locator('text.shape')
        .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      return Math.min(...heights.filter((h) => h > 0));
    })
    .toBeGreaterThan(6);
});

test('a directed graph is refused', async ({ page }) => {
  await fast(page);
  await input(page).fill('A>B, B>C');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Find a cover', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('This graph is directed');
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Greedy takes the wrong side' }).first().click();
  await expect(page.getByText('Loaded "Greedy takes the wrong side"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/vertex-cover/#practice=24680&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\.(?:\s|$)/)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /Optimum \d+\./);
});
