import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Word', { exact: true });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function runWord(page: Page, w: string) {
  await input(page).fill(w);
  await button(page, 'Run').click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/lba/');
  await expect(
    page.getByRole('heading', { name: 'Linear-bounded automaton', exact: true }),
  ).toBeVisible();
});

test('aabbcc is accepted without leaving the markers', async ({ page }) => {
  await fast(page);
  await runWord(page, 'aabbcc');
  await toEnd(page);
  await expect(narration(page)).toContainText('accept aabbcc after 23 moves');
  await expect(stage(page)).toHaveAttribute('aria-label', /Accepted/);
  await expect(stage(page).locator('text', { hasText: 'Context-sensitive · LBA' })).toHaveCount(1);
});

test('abcabc is rejected', async ({ page }) => {
  await fast(page);
  await runWord(page, 'abcabc');
  await toEnd(page);
  await expect(narration(page)).toContainText('reject abcabc');
});

test('the doubling machine is stopped at the bound', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Doubling: needs more room than it has').check();
  await page.getByText('Options', { exact: true }).click();
  await fast(page);
  await runWord(page, 'aa');
  await toEnd(page);
  await expect(narration(page)).toContainText('An LBA may not');
  await expect(stage(page)).toHaveAttribute('aria-label', /Stopped at the bound/);
});

test('input it cannot use is refused, saying why', async ({ page }) => {
  await runWord(page, 'abd');
  await expect(page.getByRole('alert')).toContainText('is not a word of a');
});

test('a finished run has no accessibility violations', async ({ page }) => {
  await fast(page);
  await runWord(page, 'abc');
  await toEnd(page);
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});

test('the tape cells stay large enough to read', async ({ page }) => {
  await runWord(page, 'aabbcc');
  await expect
    .poll(async () => (await stage(page).locator('rect').nth(2).boundingBox())?.height ?? 0)
    .toBeGreaterThan(20);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Right counts, wrong order' }).first().click();
  await expect(page.getByText('Loaded "Right counts, wrong order"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/lba/#practice=97531&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText(/Not quite|Yes\./);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(narration(page)).not.toBeEmpty();
});
