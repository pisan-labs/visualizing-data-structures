import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function loadExample(page: Page, title: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Load' })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/a-star/');
  await expect(page.getByRole('heading', { name: 'A* search' })).toBeVisible();
});

test('Manhattan expands fewer cells than h = 0 for the same path', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Find path', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('12 moves. A* expanded 22 cells');
  await expect(narration(page)).toContainText('With h = 0 (Dijkstra’s algorithm) it expands 60');
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Zero: Dijkstra’s algorithm').check();
  await page.getByRole('button', { name: 'Find path', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('12 moves. A* expanded 60 cells');
});

test('an overestimating heuristic returns a longer path, and says so', async ({ page }) => {
  await fast(page);
  await loadExample(page, 'Weight 5: nearly greedy');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'That is not the shortest path: the shortest takes 13',
  );
});

test('the open set is drawn under the grid', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Find path', exact: true }).click();
  await toEnd(page);
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Step back' }).click();
  await expect(page.locator('.stage > svg text', { hasText: 'OPEN' })).toBeVisible();
  await expect
    .poll(async () => page.locator('.stage > svg text', { hasText: /^[A-K]\d+:\d+$/ }).count())
    .toBeGreaterThan(0);
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question has a Show me that plays the answer', async ({ page }) => {
  await page.goto('/a-star/#practice=4242&n=4');
  const first = page.locator('.question').first();
  await expect(first).toBeVisible();
  // Show me appears once the question is checked (an empty answer counts as a try).
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-search (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await page.getByRole('button', { name: 'Find path', exact: true }).click();
    await toEnd(page);
    for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
