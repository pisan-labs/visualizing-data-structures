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
  await page.goto('/min-stack/');
  await expect(page.getByRole('heading', { name: 'Min stack' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('min is the top of mins, with no comparisons', async ({ page }) => {
  await run(page, 'Push', '5 3 7 3 8 1');
  await run(page, 'Min');
  await expect(narration(page)).toContainText('the top of mins is the minimum: 1');
  await expect(narration(page)).toContainText('scanning the stack would take 5 comparisons');
  await expect(page.locator('.vars')).toContainText(/pattern total\s*=?\s*5/);
  await expect(stage(page)).toHaveAttribute('aria-label', /mins, bottom to top: 5, 3, 3 and 1/);
  await run(page, 'Pop');
  await run(page, 'Min');
  await expect(narration(page)).toContainText('the top of mins is the minimum: 3');
});

test('the plain stack scans for the minimum', async ({ page }) => {
  await options(page, 'Scan the stack for the minimum, O(n) min');
  await run(page, 'Push', '5 3 7 3 8 1');
  await run(page, 'Min');
  await expect(narration(page)).toContainText('min() = 1, after 5 comparisons');
  await expect(page.locator('.vars')).toContainText(/comparisons\s*=?\s*5/);
  await expect(page.locator('.code')).toContainText('best = A[0]');
});

test('pushing every time keeps the stacks level', async ({ page }) => {
  await options(page, 'Every time (the minimum so far)');
  await run(page, 'Push', '5 3 7');
  await expect(stage(page)).toHaveAttribute('aria-label', /mins, bottom to top: 5, 3 and 3/);
  await expect(page.locator('.code')).toContainText('min(x, mins.top())');
});

test('an empty stack and a bad value are refused', async ({ page }) => {
  await run(page, 'Pop');
  await expect(narration(page)).toContainText('the stack is empty');
  await page.getByLabel('Value', { exact: true }).fill('500');
  await page.getByRole('button', { name: 'Push', exact: true }).click();
  await expect(page.getByText('out of range')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/min-stack/#practice=13579&n=5');
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
  test(`no axe violations with mins (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await run(page, 'Push', '5 3 7 3 8 1');
    await run(page, 'Pop');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations scanning the stack (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'Scan the stack for the minimum, O(n) min');
    await run(page, 'Push', '5 3 7');
    await run(page, 'Min');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
