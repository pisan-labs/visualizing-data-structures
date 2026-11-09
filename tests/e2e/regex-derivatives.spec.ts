import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Expression, symbol or word', { exact: true });
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
  await page.goto('/regex-derivatives/');
  await expect(
    page.getByRole('heading', { name: 'Regular expression derivatives', exact: true }),
  ).toBeVisible();
});

test('the derivative of (a|b)*abb by a is (a|b)*abb|bb', async ({ page }) => {
  await fast(page);
  await type(page, 'a', 'Derive');
  await toEnd(page);
  await expect(narration(page)).toContainText('= (a|b)*abb|bb. That is d_a(r)');
  await expect(stage(page).locator('text', { hasText: /^\(a\|b\)\*abb\|bb$/ })).toHaveCount(1);
});

test('matching by derivatives accepts aabb and rejects aba', async ({ page }) => {
  await fast(page);
  await type(page, 'aabb', 'Match');
  await toEnd(page);
  await expect(narration(page)).toContainText('so aabb matches r');
  await expect(stage(page).locator('text', { hasText: '✓ accept' })).toHaveCount(1);
  await type(page, 'aba', 'Match');
  await toEnd(page);
  await expect(narration(page)).toContainText('so aba does not match r');
});

test('the DFA of derivatives has four states', async ({ page }) => {
  await fast(page);
  await button(page, 'Build DFA').click();
  await toEnd(page);
  await expect(narration(page)).toContainText('4 states, one per distinct derivative');
  await expect(page.locator('.vars')).toContainText('4');
});

test('input it cannot use is refused, saying why', async ({ page }) => {
  await fast(page);
  await type(page, '(ab', 'Load');
  await expect(narration(page)).toContainText('A ( is never closed');
});

test('a finished DFA has no accessibility violations', async ({ page }) => {
  await fast(page);
  await button(page, 'Build DFA').click();
  await toEnd(page);
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});

test('the table cells stay large enough to read', async ({ page }) => {
  await fast(page);
  await type(page, 'a', 'Derive');
  await toEnd(page);
  await expect
    .poll(async () => (await stage(page).locator('rect').first().boundingBox())?.height ?? 0)
    .toBeGreaterThan(18);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'When the first part can be empty' }).first().click();
  await expect(page.getByText('Loaded "When the first part can be empty"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/regex-derivatives/#practice=97531&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText(/Not quite|Yes\./);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(narration(page)).not.toBeEmpty();
});
