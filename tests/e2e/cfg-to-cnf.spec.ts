import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Grammar or word', { exact: true });
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
  await page.goto('/cfg-to-cnf/');
  await expect(
    page.getByRole('heading', { name: 'CFG to Chomsky normal form', exact: true }),
  ).toBeVisible();
});

test('Convert runs the five stages and ends in CNF', async ({ page }) => {
  await fast(page);
  await type(page, 'S -> ASA | aB; A -> B | S; B -> b | eps', 'Convert');
  await toEnd(page);
  await expect(narration(page)).toContainText('This grammar is ready for CYK');
  await expect(stage(page).locator('text', { hasText: /^In Chomsky normal form/ })).toHaveCount(1);
  await expect(stage(page)).toHaveAttribute('aria-label', /Grammar in Chomsky normal form/);
});

test('DEL shows the nullable set and crosses out the ε-rules', async ({ page }) => {
  await fast(page);
  await type(page, 'S -> AB; A -> aA | eps; B -> bB | eps', 'Convert');
  await toEnd(page);
  const back = page.getByRole('button', { name: 'Step back' });
  for (let i = 0; i < 30; i++) {
    if ((await narration(page).textContent())?.includes('Now drop the ε-rules')) break;
    await back.click();
  }
  await expect(narration(page)).toContainText('keep S₀ → ε');
  await expect(stage(page).locator('text', { hasText: 'Nullable variables' })).toHaveCount(1);
  await expect(stage(page).locator('line.role-remove')).toHaveCount(2);
});

test('Derive takes 2n − 1 steps', async ({ page }) => {
  await fast(page);
  await type(page, 'S -> aSb | eps', 'Convert');
  await type(page, 'aabb', 'Derive');
  await toEnd(page);
  await expect(narration(page)).toContainText('in 7 steps');
  await expect(page.locator('.vars')).toContainText('derivation steps');
});

test('input it cannot use is refused, saying why', async ({ page }) => {
  await type(page, 'S -> a | ', 'Convert');
  await expect(page.getByRole('alert')).toContainText('has an empty alternative');
});

test('a finished conversion has no accessibility violations', async ({ page }) => {
  await fast(page);
  await type(page, 'E -> E+T | T; T -> T*F | F; F -> (E) | a', 'Convert');
  await toEnd(page);
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});

test('the rules stay large enough to read', async ({ page }) => {
  await fast(page);
  await type(page, 'E -> E+T | T; T -> T*F | F; F -> (E) | a', 'Convert');
  await toEnd(page);
  await expect
    .poll(async () => {
      const box = await stage(page).locator('text', { hasText: 'CNF' }).first().boundingBox();
      return box?.height ?? 0;
    })
    .toBeGreaterThan(9);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Every stage has work' }).first().click();
  await expect(page.getByText('Loaded "Every stage has work"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/cfg-to-cnf/#practice=97531&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText(/Not quite|Yes\./);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(narration(page)).not.toBeEmpty();
});
