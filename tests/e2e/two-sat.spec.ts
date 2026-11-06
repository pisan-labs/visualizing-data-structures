import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Clauses', { exact: true });

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function solve(page: Page, text: string) {
  await input(page).fill(text);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Solve', exact: true }).click();
  await toEnd(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/two-sat/');
  await expect(page.getByRole('heading', { name: '2-SAT', exact: true })).toBeVisible();
});

test('the three-clause formula is satisfiable', async ({ page }) => {
  await fast(page);
  await solve(page, 'a | !b, b | c, !a | !c');
  await expect(narration(page)).toContainText('Satisfiable: a = ');
  await expect(stage(page)).toHaveAttribute('aria-label', /Implication graph with 6 arcs\./);
});

test('x and not x in one component is unsatisfiable, and drawn red', async ({ page }) => {
  await fast(page);
  await solve(page, 'a | b, a | !b, !a | b, !a | !b');
  await expect(narration(page)).toContainText('The formula is unsatisfiable.');
  await expect(stage(page).locator('circle.role-error')).toHaveCount(2);
});

test("Tarjan's setting changes the pseudocode", async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Tarjan: one search with low-links').check();
  await page.getByText('Options', { exact: true }).click();
  await expect(page.locator('.code')).toContainText('pop down to u: one SCC');
  await fast(page);
  await solve(page, '!a | b, !b | c, !c | d, !d | !a');
  await expect(narration(page)).toContainText('a = F');
});

test('three literals in a clause are refused', async ({ page }) => {
  await input(page).fill('a | b | c');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('2-SAT allows two');
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'A chain of implications' }).first().click();
  await expect(page.getByText('Loaded "A chain of implications"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/two-sat/#practice=24680&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText(/Not quite|Yes\./);
  if ((await feedback.textContent())?.includes('Not quite')) {
    const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\./)?.[1];
    await first.getByRole('button', { name: 'Try again' }).click();
    const radio = answer ? first.getByRole('radio', { name: answer, exact: true }) : null;
    if (radio && (await radio.count())) await radio.check();
    else await first.getByRole('textbox').fill(answer ?? '');
    await first.getByRole('button', { name: 'Check' }).click();
    await expect(feedback).toContainText('Yes.');
  }
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /Implication graph/);
});
