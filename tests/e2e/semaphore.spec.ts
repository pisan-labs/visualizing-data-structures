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
  await page.goto(emptyStart('semaphore'));
  await expect(page.getByRole('heading', { name: 'Semaphores' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('two threads get in and the third waits', async ({ page }) => {
  await op(page, 'Run schedule', '1 2 1 2 3');
  await toEnd(page);
  await expect(narration(page)).toContainText('T1 and T2 can still step (T3 waits)');
  await expect(page.locator('.vars')).toContainText(/s\s*-1/);
  await expect(stage(page).locator('text', { hasText: 's = -1' })).toBeVisible();
});

test('every interleaving keeps at most two inside', async ({ page }) => {
  await op(page, 'Every interleaving');
  await toEnd(page);
  await expect(narration(page)).toContainText('Of the 7,890 interleavings');
  await expect(narration(page)).toContainText('Every one ends as the program means');
});

test('two semaphores make the threads take turns', async ({ page }) => {
  await option(page, 'Take turns: ping, pong');
  await op(page, 'Every interleaving');
  await toEnd(page);
  await expect(narration(page)).toContainText('All 43 interleavings');
  await expect(
    stage(page).locator('text', { hasText: 'ping pong ping pong' }).first(),
  ).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/semaphore/#practice=13579&n=5');
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
  test(`no axe violations with a thread waiting on s (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Run schedule', '1 2 1 2 3');
    await op(page, 'Every interleaving');
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
