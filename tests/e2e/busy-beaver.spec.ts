import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Machine or moves', { exact: true });
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
  await page.goto('/busy-beaver/');
  await expect(page.getByRole('heading', { name: 'Busy beaver', exact: true })).toBeVisible();
});

test('the 2-state champion leaves 4 ones in 6 moves', async ({ page }) => {
  await fast(page);
  await button(page, 'Run').click();
  await toEnd(page);
  await expect(narration(page)).toContainText('It halted after 6 moves, with 4 ones on the tape.');
  await expect(narration(page)).toContainText('Σ(2) = 4 and S(2) = 6');
  await expect(stage(page).locator('text', { hasText: 'halted: 6 moves, 4 ones' })).toHaveCount(1);
});

test('the 4-state champion makes 107 moves, ten at a time', async ({ page }) => {
  await fast(page);
  await type(page, 'bb4', 'Load');
  await type(page, '100', 'Run moves');
  await button(page, 'Run').click();
  await toEnd(page);
  await expect(narration(page)).toContainText('It halted after 107 moves, with 13 ones');
  await expect(page.locator('.vars')).toContainText('107');
});

test('a machine that repeats a configuration is caught', async ({ page }) => {
  await fast(page);
  await type(page, '0RB1RH_1LA1LA', 'Load');
  await button(page, 'Run').click();
  await toEnd(page);
  await expect(narration(page)).toContainText('exactly the configuration of move 2');
  await expect(stage(page).locator('text', { hasText: 'loops forever' })).toHaveCount(1);
});

test('input it cannot use is refused, saying why', async ({ page }) => {
  await type(page, '1RB1LC_1LA1RH', 'Load');
  await expect(page.getByRole('alert')).toContainText('goes to C');
});

test('a finished run has no accessibility violations', async ({ page }) => {
  await fast(page);
  await type(page, 'bb3', 'Load');
  await button(page, 'Run').click();
  await toEnd(page);
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});

test('the tape cells stay large enough to read', async ({ page }) => {
  await type(page, 'bb4', 'Load');
  await expect
    .poll(async () => (await stage(page).locator('rect').first().boundingBox())?.height ?? 0)
    .toBeGreaterThan(20);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'One bit off the champion' }).first().click();
  await expect(page.getByText('Loaded "One bit off the champion: 3 ones"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/busy-beaver/#practice=97531&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText(/Not quite|Yes\./);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(narration(page)).not.toBeEmpty();
});
