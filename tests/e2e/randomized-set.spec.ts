import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** Type a value (or several) and press an operation's button. */
async function run(page: Page, button: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Value', { exact: true }).fill(value);
  await page.getByRole('button', { name: button, exact: true }).click();
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
  await page.goto('/randomized-set/');
  await expect(
    page.getByRole('heading', { name: 'Randomized set (random pick in O(1))' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('remove fills the hole with the last value and fixes its index', async ({ page }) => {
  await run(page, 'Insert', '4 7 2 9 5');
  await run(page, 'Remove', '7');
  await expect(narration(page)).toContainText('three lookups and one move');
  await expect(stage(page)).toHaveAttribute('aria-label', /A, from index 0: 4, 5, 2 and 9/);
  await expect(stage(page)).toHaveAttribute('aria-label', /5 at 1/);
  await expect(page.locator('.vars')).toContainText(/pattern total\s*=?\s*13/);
  await run(page, 'Random');
  await expect(narration(page)).toContainText('picks an index from 0 to 3');
});

test('the array alone scans to find a value', async ({ page }) => {
  await options(page, 'The array alone, scanning to find, O(n)');
  await run(page, 'Insert', '4 7 2 9 5');
  await run(page, 'Remove', '7');
  await expect(narration(page)).toContainText('Finding 7 took 2 comparisons');
  await expect(page.locator('.vars')).toContainText(/comparisons\s*=?\s*12/);
  await expect(page.locator('.code')).toContainText('the array alone');
});

test('duplicates and bad values are refused', async ({ page }) => {
  await run(page, 'Insert', '5 5');
  await expect(narration(page)).toContainText('already in the set');
  await page.getByLabel('Value', { exact: true }).fill('300');
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(page.getByText('out of range')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/randomized-set/#practice=13579&n=5');
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
  test(`no axe violations after a remove (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await run(page, 'Insert', '4 7 2 9 5');
    await run(page, 'Remove', '7');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations with the array alone (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'The array alone, scanning to find, O(n)');
    await run(page, 'Insert', '4 7 2');
    await run(page, 'Random');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
