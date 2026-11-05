import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Graph or vertex', { exact: true });

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

const run = (page: Page) =>
  page.getByRole('button', { name: 'Find a maximum matching', exact: true }).click();

test.beforeEach(async ({ page }) => {
  await page.goto('/general-matching/');
  await expect(
    page.getByRole('heading', { name: 'General matching (blossom)', exact: true }),
  ).toBeVisible();
});

test('the starting graph needs two blossoms for a perfect matching', async ({ page }) => {
  await fast(page);
  await run(page);
  await toEnd(page);
  await expect(narration(page)).toContainText('so the matching is maximum. 4 edges');
  await expect(narration(page)).toContainText('a perfect matching');
  await expect(narration(page)).toContainText('2 blossoms contracted');
});

test('a blossom is drawn as a ring while it stands', async ({ page }) => {
  await fast(page);
  await input(page).fill('A-B, A-C, A-D, B-D, B-E, C-F, E-F');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await run(page);
  await toEnd(page);
  // Step back to the contraction.
  const back = page.getByRole('button', { name: 'Step back' });
  for (let i = 0; i < 40; i++) {
    if (await stage(page).locator('text', { hasText: /^B\(/ }).count()) break;
    await back.click();
  }
  await expect(stage(page).locator('text', { hasText: /^B\(/ })).toHaveCount(1);
  await expect(stage(page)).toHaveAttribute('aria-label', /blossom \{.+\} with base/);
});

test('an odd ring leaves one vertex free', async ({ page }) => {
  await fast(page);
  await input(page).fill('A-B, B-C, C-D, D-E, A-E');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await run(page);
  await toEnd(page);
  await expect(narration(page)).toContainText('2 edges');
  await expect(narration(page)).toContainText('stays free');
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Five in a ring' }).first().click();
  await expect(page.getByText('Loaded "Five in a ring"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/general-matching/#practice=13579&n=5');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /Blossom algorithm/);
});
