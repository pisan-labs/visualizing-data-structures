import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Word or grammar', { exact: true });
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
  await page.goto('/ll1-parsing/');
  await expect(page.getByRole('heading', { name: 'LL(1) parsing', exact: true })).toBeVisible();
});

test('a+a*a is accepted top down, with its tree', async ({ page }) => {
  await fast(page);
  await type(page, 'a+a*a', 'Parse');
  await toEnd(page);
  await expect(narration(page)).toContainText('accept a+a*a after 16 moves');
  await expect(stage(page).locator('text', { hasText: /^Parse tree$/ })).toHaveCount(1);
  await expect(stage(page)).toHaveAttribute('aria-label', /Accepted/);
});

test('a syntax error rejects at an empty cell', async ({ page }) => {
  await fast(page);
  await type(page, 'a+*a', 'Parse');
  await toEnd(page);
  await expect(narration(page)).toContainText('M[T, *] is empty');
});

test('left recursion shows conflicts in red, and Parse refuses', async ({ page }) => {
  await fast(page);
  await type(page, 'E -> E+T | T; T -> T*F | F; F -> (E) | a', 'Load');
  await toEnd(page);
  await expect(narration(page)).toContainText('not LL(1)');
  await expect(stage(page).locator('rect.role-error')).toHaveCount(4);
  await type(page, 'a', 'Parse');
  await expect(narration(page)).toContainText('The table has 4 conflicts');
});

test('input it cannot use is refused, saying why', async ({ page }) => {
  await type(page, 'S -> a | ', 'Load');
  await expect(page.getByRole('alert')).toContainText('has an empty alternative');
});

test('a finished parse has no accessibility violations', async ({ page }) => {
  await fast(page);
  await type(page, 'a*(a)', 'Parse');
  await toEnd(page);
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});

test('the table cells stay large enough to read', async ({ page }) => {
  await expect
    .poll(async () => (await stage(page).locator('rect').first().boundingBox())?.height ?? 0)
    .toBeGreaterThan(14);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'FIRST, FOLLOW and the table' }).first().click();
  await expect(page.getByText('Loaded "FIRST, FOLLOW and the table"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/ll1-parsing/#practice=97531&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText(/Not quite|Yes\./);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(narration(page)).not.toBeEmpty();
});
