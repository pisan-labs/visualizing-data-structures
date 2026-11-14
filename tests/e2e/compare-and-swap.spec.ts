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

async function option(page: Page, label: string) {
  const choice = page.getByLabel(label, { exact: true });
  if (!(await choice.isVisible())) await page.getByText('Options', { exact: true }).click();
  await choice.check();
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('compare-and-swap'));
  await expect(page.getByRole('heading', { name: 'Compare-and-swap (lock-free)' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('a failed swap retries, and the count is still right', async ({ page }) => {
  await op(page, 'Run schedule', '1 2 1 1 1 2 2 2 2 2 2 2');
  await toEnd(page);
  await expect(narration(page)).toContainText('n = 2, right, after 1 retry');
  await expect(page.locator('.vars')).toContainText(/retries\s*1/);
});

test('every interleaving: the cas never loses an update', async ({ page }) => {
  await op(page, 'Every interleaving');
  await toEnd(page);
  await expect(narration(page)).toContainText('Of the 142 interleavings');
  await expect(narration(page)).toContainText('Every one ends as the program means');
  await option(page, 'A counter with a plain store (the race)');
  await toEnd(page);
  await expect(narration(page)).toContainText('18 go wrong');
});

test('the stack hits ABA when T2 runs inside T1’s window', async ({ page }) => {
  await option(page, 'A lock-free stack and the ABA problem');
  await op(page, 'Run schedule', '1 1 2 2 2 1 1');
  await toEnd(page);
  await expect(narration(page)).toContainText('the stack is broken');
  await expect(stage(page).locator('text', { hasText: 'B: twice!' })).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/compare-and-swap/#practice=13579&n=5');
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
  test(`no axe violations after a retry and every interleaving (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Run schedule', '1 2 1 1 1 2');
    await op(page, 'Every interleaving');
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
