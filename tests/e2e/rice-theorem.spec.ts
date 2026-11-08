import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Programs or input', { exact: true });
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
  await page.goto('/rice-theorem/');
  await expect(page.getByRole('heading', { name: "Rice's theorem", exact: true })).toBeVisible();
});

test('M′ built from a halting pair behaves like M_P', async ({ page }) => {
  await fast(page);
  await type(page, '3 2', 'Build M′');
  await type(page, 'A', 'Test');
  await toEnd(page);
  await expect(narration(page)).toContainText('M_P accepts A, so M′ does too');
  await expect(stage(page).locator('text', { hasText: /^A: accepts$/ })).toHaveCount(1);
});

test('M′ built from a looping pair loops on everything', async ({ page }) => {
  await fast(page);
  await type(page, '3 1', 'Build M′');
  await type(page, 'G', 'Test');
  await toEnd(page);
  await expect(narration(page)).toContainText('L(M′) = ∅');
});

test('Decide walks through the argument', async ({ page }) => {
  await fast(page);
  await type(page, '4 2', 'Build M′');
  await button(page, 'Decide').click();
  await toEnd(page);
  await expect(narration(page)).toContainText("that is Rice's theorem");
  await expect(stage(page).locator('text', { hasText: /^5\. / })).toHaveCount(1);
});

test('input it cannot use is refused, saying why', async ({ page }) => {
  await type(page, 'xyz', 'Test');
  await expect(page.getByRole('alert')).toContainText('is not a symbol the programs read');
});

test('a finished argument has no accessibility violations', async ({ page }) => {
  await fast(page);
  await type(page, '3 2', 'Build M′');
  await button(page, 'Decide').click();
  await toEnd(page);
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});

test('the text stays large enough to read', async ({ page }) => {
  await expect
    .poll(async () => (await stage(page).locator('text').first().boundingBox())?.height ?? 0)
    .toBeGreaterThan(10);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'M loops on w, so L(M′) is empty' }).first().click();
  await expect(page.getByText('Loaded "M loops on w, so L(M′) is empty"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/rice-theorem/#practice=97531&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText(/Not quite|Yes\./);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(narration(page)).not.toBeEmpty();
});
