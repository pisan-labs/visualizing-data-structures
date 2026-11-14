import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Intervals', { exact: true });

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function press(page: Page, button: string, value?: string) {
  if (value !== undefined) await input(page).fill(value);
  await page.getByRole('button', { name: button, exact: true }).click();
  await toEnd(page);
}

/** Open Options, pick settings by their radio labels, and close it again. */
async function options(page: Page, ...labels: (string | RegExp)[]) {
  const summary = page.locator('summary', { hasText: 'Options' });
  await summary.click();
  for (const l of labels) await page.getByRole('radio', { name: l }).check();
  await summary.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/merge-intervals/');
  await expect(page.getByRole('heading', { name: 'Merge intervals' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('sorting and one pass merge the list, with the work beside it', async ({ page }) => {
  await press(page, 'Merge');
  await expect(narration(page)).toContainText(
    '7 intervals merge into 3 intervals: 1–7, 9–12 and 13–17',
  );
  await expect(page.locator('.vars')).toContainText(/comparisons\s*=?\s*11/);
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*13/);
  await expect(stage(page)).toHaveAttribute('aria-label', /out: 1–7, 9–12, 13–17/);
});

test('checking every interval out gives the same list without a sort', async ({ page }) => {
  await options(page, 'Check every interval out, O(n²)');
  await press(page, 'Merge');
  await expect(narration(page)).toContainText('1–7, 9–12 and 13–17');
  await expect(page.locator('.vars')).toContainText(/checks\s*=?\s*13/);
  await expect(page.locator('.code')).toContainText('check every interval out');
});

test('touching ends can stay apart', async ({ page }) => {
  await options(page, /Stay apart/);
  await press(page, 'Merge');
  await expect(narration(page)).toContainText('4 intervals: 1–7, 9–12, 13–15 and 15–17');
  await expect(page.locator('.code')).toContainText('x.start < last(out).end');
});

test('insert and intersect work on the merged list, and refuse an unsorted one', async ({
  page,
}) => {
  await press(page, 'Insert', '5-8');
  await expect(narration(page)).toContainText('Press Merge first');
  await press(page, 'Merge');
  await press(page, 'Insert', '8-13');
  await expect(narration(page)).toContainText('the list is now 1–7 and 8–17');
  await press(page, 'Intersect with', '0-2 6-9 16-20');
  await expect(narration(page)).toContainText('4 stretches in common: 1–2, 6–7, 8–9 and 16–17');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/merge-intervals/#practice=13579&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  for (let q = 0; q < 2; q++) {
    const item = page.locator('.question').nth(q);
    await item.getByRole('button', { name: 'Check' }).click();
    const verdict = item.locator('.feedback strong');
    await expect(verdict).toContainText('Not quite. The answer is');
    const answer = ((await verdict.textContent()) ?? '')
      .replace(/^Not quite\. The answer is /, '')
      .replace(/\.$/, '');
    await item.getByRole('button', { name: 'Try again' }).click();
    const radio = item.getByRole('radio', { name: answer, exact: true });
    if (await radio.count()) await radio.check();
    else await item.getByRole('textbox').fill(answer);
    await item.getByRole('button', { name: 'Check' }).click();
    await expect(item.locator('.feedback')).toContainText('Yes.');
  }
  const show = page.locator('.question').first().getByRole('button', { name: 'Show me' });
  if (await show.count()) await showMe(page, show);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations on a finished merge (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await press(page, 'Merge');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations mid-run, checking every interval out (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'Check every interval out, O(n²)');
    await press(page, 'Merge');
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
