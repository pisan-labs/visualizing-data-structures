import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Language or words', { exact: true });
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
  await page.goto('/myhill-nerode/');
  await expect(
    page.getByRole('heading', { name: 'Myhill-Nerode theorem', exact: true }),
  ).toBeVisible();
});

test('words ending in ab have three classes, and they make the minimal DFA', async ({ page }) => {
  await fast(page);
  await button(page, 'Find classes').click();
  await toEnd(page);
  await expect(narration(page)).toContainText('the search is closed: 3 classes');
  await expect(stage(page).locator('text', { hasText: 'The minimal DFA' })).toHaveCount(1);
  await expect(stage(page).locator('text', { hasText: 'closed: 3 classes' })).toHaveCount(1);
});

test('four words apart prove at least four states', async ({ page }) => {
  await fast(page);
  await type(page, '(a|b)*a(a|b)', 'Load');
  await type(page, 'eps a aa ab', 'Words apart');
  await toEnd(page);
  await expect(narration(page)).toContainText('every DFA for L needs at least 4 states');
});

test('aⁿbⁿ has infinitely many classes', async ({ page }) => {
  await fast(page);
  await type(page, 'anbn', 'Load');
  await button(page, 'Infinitely many').click();
  await toEnd(page);
  await expect(narration(page)).toContainText('it is not regular');
  await expect(stage(page).locator('text', { hasText: 'bbbb' })).toHaveCount(1);
});

test('input it cannot use is refused, saying why', async ({ page }) => {
  await fast(page);
  await type(page, 'a c', 'Words apart');
  await expect(narration(page)).toContainText('is not in the alphabet');
});

test('a finished search has no accessibility violations', async ({ page }) => {
  await fast(page);
  await button(page, 'Find classes').click();
  await toEnd(page);
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});

test('the class rows stay large enough to read', async ({ page }) => {
  await fast(page);
  await button(page, 'Find classes').click();
  await toEnd(page);
  await expect
    .poll(async () => (await stage(page).locator('rect').first().boundingBox())?.height ?? 0)
    .toBeGreaterThan(18);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page
    .getByRole('link', { name: 'A DFA with five states, a language with three classes' })
    .first()
    .click();
  await expect(
    page.getByText('Loaded "A DFA with five states, a language with three classes"'),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/myhill-nerode/#practice=97531&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText(/Not quite|Yes\./);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(narration(page)).not.toBeEmpty();
});
