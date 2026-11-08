import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Item', { exact: true }).fill(value);
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible())) await page.getByText('More operations').click();
  await button.click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** Answer the first practice question by reading the answer a wrong try reveals. */
async function answerFirst(page: Page) {
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
  return first;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/count-min-sketch/');
  await expect(page.getByRole('heading', { name: 'Count-min sketch' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('add bumps one counter per row, and an estimate is never too low', async ({ page }) => {
  await op(page, 'Add', '42 17 42 5 9 42 23 17 61');
  await toEnd(page);
  await expect(page.locator('.vars')).toContainText(/N\s*9/);
  await op(page, 'Estimate', '9');
  await toEnd(page);
  await expect(narration(page)).toContainText('The true count is 1, so the estimate is 1 too high');
  await expect(page.locator('.vars')).toContainText(/error\s*1/);
  // The table shows the overestimate next to the true count.
  await expect(stage(page).locator('text', { hasText: '2 +1' }).first()).toBeVisible();
});

test('heavy hitters reports the items above φ·N', async ({ page }) => {
  await op(page, 'Add', '7 3 11 7 25 3 7 40 52 7 3 18 7 66 30 3 7 81 94 12');
  await op(page, 'Heavy hitters');
  await toEnd(page);
  await expect(narration(page)).toContainText('7 (estimate 7, true 6) and 3 (estimate 4, true 4)');
});

test('conservative update keeps the estimate of 9 exact', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Conservative: raise only the counters at the minimum').check();
  await op(page, 'Add', '42 17 42 5 9 42 23 17 61');
  await op(page, 'Estimate', '9');
  await toEnd(page);
  await expect(narration(page)).toContainText('so the estimate is exact');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/count-min-sketch/#practice=24680&n=4');
  await expect(page.locator('.question')).toHaveCount(4);
  const first = await answerFirst(page);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations while estimating (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await page.getByRole('tab', { name: 'Examples' }).click();
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Finding the heavy hitters' })
      .getByRole('button', { name: 'Load' })
      .click();
    for (let i = 0; i < 20; i++) await page.getByRole('button', { name: 'Step forward' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
