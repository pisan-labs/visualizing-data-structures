import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Graph or terminals', { exact: true });

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/steiner-tree/');
  await expect(page.getByRole('heading', { name: 'Steiner tree', exact: true })).toBeVisible();
});

test('the approximation misses the shared junction on the starting graph', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Find a tree', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('weight 17');
  await expect(narration(page)).toContainText('ratio 1.13');
  await expect(stage(page)).toHaveAttribute('aria-label', /Weight 17\. Optimum 15\. Ratio 1\.13\./);
});

test('the exact method tries every set of Steiner vertices', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Exact: try every set of Steiner vertices').check();
  await page.getByText('Options', { exact: true }).click();
  await expect(page.locator('.code')).toContainText('EXACT-STEINER(G, w, T)');
  await fast(page);
  await page.getByRole('button', { name: 'Find a tree', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('That is a minimum Steiner tree: ratio 1.');
});

test('terminals can be set, and unknown ones are refused', async ({ page }) => {
  await fast(page);
  await input(page).fill('A H');
  await page.getByRole('button', { name: 'Set terminals', exact: true }).click();
  await expect(narration(page)).toContainText('Terminals: A and H.');
  await page.getByRole('button', { name: 'Find a tree', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('weight 9');
  await input(page).fill('A Z');
  await page.getByRole('button', { name: 'Set terminals', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('no vertex Z');
});

test('the hidden hub stays readable and reaches the bound', async ({ page }) => {
  await fast(page);
  await input(page).fill(
    'A-B:2, A-C:2, A-D:2, A-E:2, A-F:1, B-C:2, B-D:2, B-E:2, B-F:1, C-D:2, C-E:2, C-F:1, D-E:2, D-F:1, E-F:1',
  );
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await input(page).fill('A B C D E');
  await page.getByRole('button', { name: 'Set terminals', exact: true }).click();
  await page.getByRole('button', { name: 'Find a tree', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('ratio 1.6');
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
  await page.getByRole('link', { name: 'A hub the approximation never sees' }).first().click();
  await expect(page.getByText('Loaded "A hub the approximation never sees"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/steiner-tree/#practice=24680&n=3');
  await expect(page.locator('.question')).toHaveCount(3);
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
