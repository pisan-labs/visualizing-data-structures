import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Points', { exact: true }).fill(value);
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible())) await page.getByText('More operations').click();
  await button.click();
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

/** Step forward up to n times, stopping at the last step shown at this detail level. */
async function stepForward(page: Page, n: number) {
  const fwd = page.getByRole('button', { name: 'Step forward' });
  for (let i = 0; i < n && !(await fwd.isDisabled()); i++) await fwd.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('delaunay'));
  await expect(
    page.getByRole('heading', { name: 'Delaunay triangulation and Voronoi' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('inserting points builds triangles with empty circles', async ({ page }) => {
  await op(page, 'Insert', '2,2 10,3 6,10 6,5');
  await toEnd(page);
  await expect(narration(page)).toContainText('4 points, 3 triangles');
  await op(page, 'Check empty circles');
  await toEnd(page);
  await expect(narration(page)).toContainText('All 3 circles are empty');
});

test('the Voronoi option draws the dual', async ({ page }) => {
  await loadExample(page, 'The Voronoi diagram is the dual');
  await toEnd(page);
  await expect(stage(page).locator('text', { hasText: 'Voronoi edges in colour' })).toBeVisible();
  await expect(narration(page)).toContainText('10 points, 12 triangles');
});

test('points on a line make no triangles until one steps off', async ({ page }) => {
  await loadExample(page, 'Points on a line make no triangles');
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  await next.click();
  await expect(narration(page)).toContainText('4 points, 0 triangles');
  await toEnd(page);
  await expect(narration(page)).toContainText('5 points, 3 triangles');
});

test('bad input is explained', async ({ page }) => {
  await op(page, 'Insert', '2,20');
  await expect(page.getByRole('alert')).toContainText('from 0 to 12');
});

test('a concept check answers and Show me plays an example', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  const check = page.locator('.check').filter({ hasText: 'How many new triangles replace it?' });
  await check.getByRole('button', { name: '3', exact: true }).click();
  await expect(check).toContainText('Yes.');
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('practice questions grade and Show me plays the answer', async ({ page }) => {
  await page.goto('/delaunay/#practice=7&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations while a point goes in (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await loadExample(page, 'Ten points, one at a time');
    await stepForward(page, 40);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
