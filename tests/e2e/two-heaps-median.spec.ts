import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function add(page: Page, values: string) {
  await page.getByLabel('Value', { exact: true }).fill(values);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
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
  await page.goto(emptyStart('two-heaps-median'));
  await expect(page.getByRole('heading', { name: 'Running median with two heaps' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('the page opens on a running median', async ({ page }) => {
  await page.goto('/two-heaps-median/');
  await expect(narration(page)).toContainText('The median of 9 values is 7');
  await expect(stage(page)).toHaveAttribute('aria-label', /Median: 7\./);
});

test('two heaps keep the median after each value', async ({ page }) => {
  await add(page, '5 15 1 3');
  await expect(narration(page)).toContainText('(3 + 5) / 2 = 4');
  await expect(stage(page)).toHaveAttribute('aria-label', /Low half \(max-heap\): 3, 1/);
  await expect(page.locator('.vars')).toContainText(/pattern total\s*=?\s*7/);
  await add(page, '8');
  await expect(narration(page)).toContainText('The median of 5 values is 5');
});

test('a sorted list gives the same medians, and the lower median is an option', async ({
  page,
}) => {
  await options(page, 'A sorted list, O(n) per value');
  await add(page, '5 15 1 3');
  await expect(narration(page)).toContainText(
    'the median is the mean of S[1] and S[2], (3 + 5) / 2 = 4',
  );
  await expect(page.locator('.code')).toContainText('S.append(x)');
  await options(page, 'The lower middle value (CLRS)');
  await expect(page.locator('.vars')).toContainText(/median\s*=?\s*3/);
});

test('a value out of range is refused, and Clear empties the stream', async ({ page }) => {
  await page.getByLabel('Value', { exact: true }).fill('500');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('out of range')).toBeVisible();
  await add(page, '4 6');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(narration(page)).toContainText('Cleared');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/two-heaps-median/#practice=13579&n=5');
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
  test(`no axe violations while a top moves over (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await add(page, '5 15 1 3');
    for (let i = 0; i < 2; i++)
      await page.getByRole('button', { name: 'Step back' }).click({ force: true });
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on the sorted list (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'A sorted list, O(n) per value');
    await add(page, '5 15 1 3');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
