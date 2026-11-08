import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Word or grammar', { exact: true });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const PRECEDENCE = 'E -> E+T | T; T -> T*F | F; F -> (E) | a';

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
  await page.goto('/lr0-parsing/');
  await expect(page.getByRole('heading', { name: 'LR(0) parsing', exact: true })).toBeVisible();
});

test('(a+a)+a is accepted by shifts and reductions', async ({ page }) => {
  await fast(page);
  await type(page, '(a+a)+a', 'Parse');
  await toEnd(page);
  await expect(narration(page)).toContainText('ACTION[1, $] = acc');
  await expect(stage(page)).toHaveAttribute('aria-label', /Accepted/);
});

test('Load builds the automaton, then the table', async ({ page }) => {
  await fast(page);
  await type(page, 'S -> (L) | x; L -> S | L,S', 'Load');
  await toEnd(page);
  await expect(narration(page)).toContainText('the grammar is LR(0)');
  await expect(stage(page).locator('text', { hasText: /^ACTION \| GOTO$/ })).toHaveCount(1);
});

test('precedence gives LR(0) conflicts, and Parse refuses', async ({ page }) => {
  await fast(page);
  await type(page, PRECEDENCE, 'Load');
  await toEnd(page);
  await expect(narration(page)).toContainText('not LR(0)');
  await expect(stage(page).locator('rect.role-error').first()).toBeVisible();
  await type(page, 'a+a', 'Parse');
  await expect(narration(page)).toContainText('Try SLR(1)');
});

test('with SLR(1) the same grammar parses', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('SLR(1): only under FOLLOW of its left side').check();
  await page.getByText('Options', { exact: true }).click();
  await fast(page);
  await type(page, PRECEDENCE, 'Load');
  await type(page, 'a+a*a', 'Parse');
  await toEnd(page);
  await expect(narration(page)).toContainText('accept a+a*a');
});

test('input it cannot use is refused, saying why', async ({ page }) => {
  await type(page, 'S -> a | ', 'Load');
  await expect(page.getByRole('alert')).toContainText('has an empty alternative');
});

test('a finished parse has no accessibility violations', async ({ page }) => {
  await fast(page);
  await type(page, 'a+(a)', 'Parse');
  await toEnd(page);
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Item sets, closure and goto' }).first().click();
  await expect(page.getByText('Loaded "Item sets, closure and goto"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/lr0-parsing/#practice=97531&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText(/Not quite|Yes\./);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(narration(page)).not.toBeEmpty();
});
