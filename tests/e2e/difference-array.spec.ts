import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('l r x, or values', { exact: true });

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function apply(page: Page) {
  await page.getByRole('button', { name: 'Apply updates', exact: true }).click();
  await toEnd(page);
}

/** Open Options, pick settings by their radio labels, and close it again. */
async function options(page: Page, ...labels: string[]) {
  const summary = page.locator('summary', { hasText: 'Options' });
  await summary.click();
  for (const l of labels) await page.getByRole('radio', { name: l }).check();
  await summary.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/difference-array/');
  await expect(page.getByRole('heading', { name: 'Difference array' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('two writes per update and one pass apply the queued updates', async ({ page }) => {
  await apply(page);
  await expect(narration(page)).toContainText('A = 3, 5, 5, 4, 4, 5, 5, 3');
  await expect(narration(page)).toContainText('8 writes and 8 sums');
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*19/);
  await expect(page.locator('.vars')).toContainText(/pattern total\s*=?\s*16/);
  await expect(stage(page)).toHaveAttribute('aria-label', /D holds 3, 2, 0, −1, 0, 1, 0, −2, −3/);
});

test('adding to every cell gives the same array with 19 writes', async ({ page }) => {
  await options(page, 'Add to every cell, O(q·n)');
  await apply(page);
  await expect(narration(page)).toContainText('A = 3, 5, 5, 4, 4, 5, 5, 3');
  await expect(page.locator('.vars')).toContainText(/writes\s*=?\s*19/);
  await expect(page.locator('.code')).toContainText('add to every cell');
});

test('updates can be loaded, queued and refused', async ({ page }) => {
  await input(page).fill('5 3 8 1');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await input(page).fill('1 3 2');
  await page.getByRole('button', { name: 'Add update', exact: true }).click();
  await expect(narration(page)).toContainText('Queued update 1: A[1..3] += 2');
  await apply(page);
  await expect(narration(page)).toContainText('A = 5, 5, 10, 3');
  await input(page).fill('2 9 1');
  await page.getByRole('button', { name: 'Add update', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('r must be from 0 to 3');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/difference-array/#practice=13579&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const verdict = first.locator('.feedback strong');
  await expect(verdict).toContainText('Not quite. The answer is');
  const answer = ((await verdict.textContent()) ?? '')
    .replace(/^Not quite\. The answer is /, '')
    .replace(/\.$/, '');
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Yes.');
  const show = first.getByRole('button', { name: 'Show me' });
  if (await show.count()) await showMe(page, show);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations on a finished batch (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await apply(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on adding to every cell (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'Add to every cell, O(q·n)');
    await apply(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
