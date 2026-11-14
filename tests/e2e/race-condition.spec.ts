import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Schedule', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('race-condition'));
  await expect(page.getByRole('heading', { name: 'Race conditions' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('stepping the threads by hand loses an update', async ({ page }) => {
  for (const t of ['T1', 'T2', 'T1', 'T1', 'T2', 'T2']) await op(page, `Step ${t}`);
  await toEnd(page);
  await expect(narration(page)).toContainText('One update was lost');
  await expect(page.locator('.vars')).toContainText(/count\s*1/);
  await expect(stage(page).locator('text', { hasText: 'done' })).toHaveCount(2);
});

test('a schedule runs from the start, and a bad one is refused', async ({ page }) => {
  await op(page, 'Run schedule', '1 1 1 2 2 2');
  await toEnd(page);
  await expect(narration(page)).toContainText('No update was lost');
  await op(page, 'Run schedule', '1 4');
  await expect(page.getByText('Threads are numbered 1 to 3.')).toBeVisible();
});

test('every interleaving counts the 20 schedules', async ({ page }) => {
  await op(page, 'Every interleaving');
  await toEnd(page);
  await expect(narration(page)).toContainText('18 lose at least one update; only 2 get count = 2');
  await expect(stage(page).locator('text', { hasText: 'of 20 schedules' })).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/race-condition/#practice=13579&n=5');
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
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations on the tally of every interleaving (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Step T1');
    await op(page, 'Every interleaving');
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
