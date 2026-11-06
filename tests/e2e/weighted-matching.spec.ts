import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Cost matrix', { exact: true });

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/weighted-matching/');
  await expect(
    page.getByRole('heading', { name: 'Weighted matching (Hungarian)', exact: true }),
  ).toBeVisible();
});

test('the starting matrix needs two potential updates and costs 9', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Find the best assignment', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Done after 2 potential updates: A→2, B→4, C→3, D→1, total cost 9.',
  );
  await expect(stage(page)).toHaveAttribute('aria-label', /Matched: A→2, B→4, C→3, D→1/);
});

test('maximizing flips the costs and changes the pseudocode', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Maximize the total (profits instead of costs)').check();
  await page.getByText('Options', { exact: true }).click();
  await expect(page.locator('.code')).toContainText('c[i][j] = M - c[i][j]');
  await fast(page);
  await page.getByRole('button', { name: 'Find the best assignment', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('total value');
});

test('a matrix that is not square is refused', async ({ page }) => {
  await input(page).fill('1 2; 3');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('must be square');
});

test('a 6 x 6 matrix stays readable', async ({ page }) => {
  await fast(page);
  await input(page).fill(
    '1 2 3 4 5 6; 2 4 6 8 10 12; 3 6 9 12 15 18; 4 8 12 16 20 24; 5 10 15 20 25 30; 6 12 18 24 30 36',
  );
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Find the best assignment', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('total cost 56');
  await expect
    .poll(async () => {
      const heights = await stage(page)
        .locator('text.shape')
        .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      return Math.min(...heights.filter((h) => h > 0));
    })
    .toBeGreaterThan(6);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Every assignment ties' }).first().click();
  await expect(page.getByText('Loaded "Every assignment ties"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/weighted-matching/#practice=24680&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
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
  await expect(stage(page)).toHaveAttribute('aria-label', /Hungarian algorithm/);
});
