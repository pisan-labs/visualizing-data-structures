import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function press(page: Page, button: string, input: string) {
  await page.getByLabel('k, or values', { exact: true }).fill(input);
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

const NAIVE = 'Copy to an array, reverse there, write back';

test.beforeEach(async ({ page }) => {
  await page.goto('/reverse-k-group/');
  await expect(page.getByRole('heading', { name: 'Reverse a list in groups of k' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('groups of 3 are turned around in place; the short group stays', async ({ page }) => {
  await press(page, 'Reverse in groups', '3');
  await expect(narration(page)).toContainText(
    'head → 3 → 2 → 1 → 6 → 5 → 4 → 7 → 8 → null. 2 groups turned around with 18 hops and 8 links',
  );
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*36/);
  await expect(page.locator('.vars')).toContainText(/pattern total\s*=?\s*26/);
  await expect(stage(page)).toHaveAttribute('aria-label', /head → 3 → 2 → 1/);
});

test('the short last group can be reversed too', async ({ page }) => {
  await options(page, 'Is reversed too');
  await press(page, 'Reverse in groups', '3');
  await expect(narration(page)).toContainText('6 → 5 → 4 → 8 → 7 → null');
  await expect(page.locator('.code')).toContainText('reversed too');
});

test('copying to an array moves the values, not the nodes', async ({ page }) => {
  await options(page, NAIVE);
  await press(page, 'Reverse in groups', '3');
  await expect(narration(page)).toContainText('Every node is where it was, holding another value');
  await press(page, 'Build', '1 2 3 4');
  await press(page, 'Reverse in groups', '4');
  await expect(narration(page)).toContainText('return head: 4 → 3 → 2 → 1 → null');
});

test('a bad value is refused', async ({ page }) => {
  await page.getByLabel('k, or values', { exact: true }).fill('1 2 x');
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.getByText('is not a whole number')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/reverse-k-group/#practice=13579&n=5');
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
  test(`no axe violations mid-group (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await press(page, 'Reverse in groups', '3');
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on the array copy (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, NAIVE);
    await press(page, 'Reverse in groups', '3');
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
