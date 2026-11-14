import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function press(page: Page, button: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Values', { exact: true }).fill(value);
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
  await page.goto('/xor-tricks/');
  await expect(page.getByRole('heading', { name: 'XOR tricks' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('XOR finds the single, keeping one number', async ({ page }) => {
  await press(page, 'Find');
  await expect(narration(page)).toContainText('the value without a pair is 9');
  await expect(page.locator('.vars')).toContainText(/kept\s*=?\s*1/);
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*18/);
  await expect(stage(page)).toHaveAttribute('aria-label', /acc = 9 \(1001 in binary\)/);
});

test('counting with a hash map gives the same answer and keeps the counts', async ({ page }) => {
  await options(page, /Count with a hash map/);
  await press(page, 'Find');
  await expect(narration(page)).toContainText('the value without a pair is 9');
  await expect(page.locator('.vars')).toContainText(/kept\s*=?\s*4/);
  await expect(page.locator('.code')).toContainText('with a hash map');
});

test('the missing number and two singles start from lists that suit them', async ({ page }) => {
  await options(page, /The number missing/);
  await press(page, 'Find');
  await expect(narration(page)).toContainText('4 is missing');
  await options(page, /The two values/);
  await press(page, 'Find');
  await expect(narration(page)).toContainText('the two values without a pair are 5 and 9');
  await press(page, 'Load', '1 2 3');
  await press(page, 'Find');
  await expect(narration(page)).toContainText('every value in pairs but two');
});

test('swap uses three XORs and skips a value swapped with itself', async ({ page }) => {
  await press(page, 'Swap', '1 4');
  await expect(narration(page)).toContainText('Swapped, with no extra variable');
  await expect(stage(page)).toHaveAttribute('aria-label', /A holds 7 values: 4, 9, 6, 4, 1, 6, 1/);
  await press(page, 'Swap', '2 2');
  await expect(narration(page)).toContainText('would make it 0');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/xor-tricks/#practice=13579&n=5');
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
  test(`no axe violations splitting two singles (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, /The two values/);
    await press(page, 'Find');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations counting with a hash map (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, /Count with a hash map/);
    await press(page, 'Find');
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
