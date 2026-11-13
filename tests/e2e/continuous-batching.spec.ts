import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const vars = (page: Page) => page.locator('.vars');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Request', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function fiveRequests(page: Page) {
  for (const r of ['0 5 2', '0 3 6', '0 8 3', '1 4 2', '2 6 3']) await op(page, 'Add', r);
  await op(page, 'Run to the end');
  await toEnd(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('continuous-batching'));
  await expect(page.getByRole('heading', { name: 'Continuous batching', level: 1 })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('continuous batching fills a free slot at the next iteration', async ({ page }) => {
  await fiveRequests(page);
  await expect(narration(page)).toContainText('All done at time 6');
  await expect(vars(page)).toContainText(/tokens per iteration\s*=?\s*"?2\.67/);
  await expect(vars(page)).toContainText(/idle while a request waits\s*=?\s*0/);
  await expect(stage(page).locator('text', { hasText: 'slots over time' })).toBeVisible();
});

test('static batching waits for the longest request', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Static: a batch runs until its longest request is done').check();
  await fiveRequests(page);
  await expect(narration(page)).toContainText('All done at time 9');
  await expect(vars(page)).toContainText(/idle while a request waits\s*=?\s*7/);
  await expect(vars(page)).toContainText(/total wait\s*=?\s*9/);
});

test('one iteration at a time, and refusals', async ({ page }) => {
  await op(page, 'Next iteration');
  await expect(narration(page)).toContainText('No requests yet');
  await op(page, 'Add', '0 13 2');
  await expect(narration(page)).toContainText('three whole numbers');
  await op(page, 'Add', '0 4 2');
  await op(page, 'Next iteration');
  await toEnd(page);
  await expect(narration(page)).toContainText('A reads its prompt (4 tokens)');
  await op(page, 'Next iteration');
  await toEnd(page);
  await expect(narration(page)).toContainText('A is done at time 2');
  await op(page, 'Run to the end');
  await expect(narration(page)).toContainText('Every request is done');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/continuous-batching/#practice=13579&n=5');
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
  test(`no axe violations on a static run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await page.getByText('Options', { exact: true }).click();
    await page.getByLabel('Static: a batch runs until its longest request is done').check();
    await fiveRequests(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
