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
  await page.goto(emptyStart('dining-philosophers'));
  await expect(page.getByRole('heading', { name: 'Dining philosophers' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('everyone takes the left fork, and the table deadlocks', async ({ page }) => {
  for (const p of ['P1', 'P2', 'P3', 'P1', 'P2', 'P3']) await op(page, `Step ${p}`);
  await toEnd(page);
  await expect(narration(page)).toContainText('P1 → P2 → P3 → P1');
  await expect(stage(page).locator('text', { hasText: 'deadlock' })).toBeVisible();
  await expect(page.locator('.vars')).toContainText('P1 → P2 → P3 → P1');
});

test('every interleaving: 48 of 3,051 deadlock, and none with the waiter', async ({ page }) => {
  await op(page, 'Every interleaving');
  await toEnd(page);
  await expect(narration(page)).toContainText('Of the 3,051 interleavings');
  await expect(narration(page)).toContainText('48 schedules end in deadlock');
  await option(page, 'A waiter seats at most n − 1 (a semaphore)');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'All 679,446 interleavings from the start end with every philosopher fed',
  );
});

test('a bad schedule is refused', async ({ page }) => {
  await op(page, 'Run schedule', '1 2 9');
  await expect(page.getByText('Philosophers are numbered 1 to 4.')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/dining-philosophers/#practice=13579&n=5');
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
  test(`no axe violations on a deadlocked table (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Run schedule', '1 2 3 1 2 3');
    await op(page, 'Every interleaving');
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
