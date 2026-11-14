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

async function options(page: Page) {
  const box = page.getByRole('spinbutton', { name: 'Items at the start' });
  if (!(await box.isVisible())) await page.getByText('Options', { exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('producer-consumer'));
  await expect(
    page.getByRole('heading', { name: 'Producer-consumer (bounded buffer)' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('the producer sleeps while the buffer is full', async ({ page }) => {
  for (let i = 0; i < 4; i++) await op(page, 'Step P1');
  await toEnd(page);
  await expect(narration(page)).toContainText('It sleeps until a consumer makes room');
  await expect(stage(page).locator('text', { hasText: 'sleeps on room' })).toBeVisible();
});

test('with if and an empty start, a consumer takes an item that is not there', async ({ page }) => {
  await options(page);
  await page.getByLabel('Lock and 2 condition variables, if', { exact: true }).check();
  const start = page.getByRole('spinbutton', { name: 'Items at the start' });
  await start.fill('0');
  await start.press('Enter');
  await op(page, 'Run schedule', '2 2 2 2 1 1 1 1 3 1 1 1 3 3 3 3 3 3 2 2 2 2');
  await toEnd(page);
  await expect(narration(page)).toContainText('C1 took an item that was not there');
  await expect(page.locator('.vars')).toContainText(/n\s*-1/);
});

test('every interleaving with while ends with every item taken once', async ({ page }) => {
  await op(page, 'Every interleaving');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'All 362 interleavings from the start end with n = 0',
  );
  await op(page, 'Run schedule', 'P1 C9');
  await expect(page.getByText('The threads are 1 = P1, 2 = C1 and 3 = C2.')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/producer-consumer/#practice=13579&n=5');
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
  test(`no axe violations with threads asleep and a tally (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    for (let i = 0; i < 4; i++) await op(page, 'Step P1');
    await op(page, 'Step C1');
    await op(page, 'Every interleaving');
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
