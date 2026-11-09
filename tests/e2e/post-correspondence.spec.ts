import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Dominoes or numbers', { exact: true });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function type(page: Page, text: string, op: string) {
  await input(page).fill(text);
  await button(page, op).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/post-correspondence/');
  await expect(
    page.getByRole('heading', { name: 'Post correspondence problem', exact: true }),
  ).toBeVisible();
});

test('breadth first finds the match 2 1 3 2 4', async ({ page }) => {
  await fast(page);
  await button(page, 'Search').click();
  await toEnd(page);
  await expect(narration(page)).toContainText('A match: 2 1 3 2 4, 5 dominoes');
  await expect(stage(page).locator('text', { hasText: 'match: 2 1 3 2 4' })).toHaveCount(1);
});

test('Try shows where a sequence goes wrong', async ({ page }) => {
  await fast(page);
  await type(page, '2 3', 'Try');
  await toEnd(page);
  await expect(narration(page)).toContainText('disagree at column 2');
  await expect(stage(page).locator('text', { hasText: '2 3: dead at column 2' })).toHaveCount(1);
});

test('a search that dies out everywhere proves there is no match', async ({ page }) => {
  await fast(page);
  await type(page, 'abc/ab ca/a acc/ba', 'Load');
  await button(page, 'Search').click();
  await toEnd(page);
  await expect(narration(page)).toContainText('no match, of any length');
});

test('input it cannot use is refused, saying why', async ({ page }) => {
  await type(page, 'ab/abcdefg', 'Load');
  await expect(page.getByRole('alert')).toContainText('5 symbols or fewer');
});

test('a finished search has no accessibility violations', async ({ page }) => {
  await fast(page);
  await button(page, 'Search').click();
  await toEnd(page);
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});

test('the dominoes stay large enough to read', async ({ page }) => {
  await expect
    .poll(async () => (await stage(page).locator('rect').first().boundingBox())?.height ?? 0)
    .toBeGreaterThan(40);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'every branch dies: no match at all' }).first().click();
  await expect(page.getByText('Loaded "Every branch dies: no match at all"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/post-correspondence/#practice=97531&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText(/Not quite|Yes\./);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(narration(page)).not.toBeEmpty();
});
