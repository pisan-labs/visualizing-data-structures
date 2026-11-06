import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/grid-bfs/');
  await expect(page.getByRole('heading', { name: 'Shortest path in a grid (BFS)' })).toBeVisible();
});

test('Find path goes around the wall in 12 moves', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Find path', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('That is 12 moves');
  await expect(page.locator('.vars')).toContainText(/T\.d\s*12/);
  await expect(stage(page)).toHaveAttribute('aria-label', /Path: B2/);
});

test('eight neighbours make the path shorter', async ({ page }) => {
  await fast(page);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('8 neighbours: diagonals too').check();
  await page.getByRole('button', { name: 'Find path', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('That is 8 moves');
});

test('a typed grid loads, and a bad one is refused with a reason', async ({ page }) => {
  await fast(page);
  const input = page.locator('#op-input');
  await input.fill('S.# ..');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Row 2 has 2 cells');
  await input.fill('S.# ..T');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Find path', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('That is 3 moves');
  // The drawing fits the 3 x 2 grid: two rows of cells.
  await expect.poll(async () => stage(page).locator('rect').count()).toBeGreaterThanOrEqual(6);
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question has a Show me that plays the answer', async ({ page }) => {
  await page.goto('/grid-bfs/#practice=777&n=4');
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
    for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Step back' }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
