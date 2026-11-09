import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

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
  await page.goto(emptyStart('hyperloglog'));
  await expect(page.getByRole('heading', { name: 'HyperLogLog' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('add splits the hash into a register and ρ, bit by bit', async ({ page }) => {
  await op(page, 'Add', '12');
  await toEnd(page);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('so ρ =');
  await expect(stage(page).locator('text', { hasText: 'register' })).toBeVisible();
  await expect(stage(page).locator('text', { hasText: /^ρ = \d+$/ })).toBeVisible();
});

test('estimate uses linear counting for small counts', async ({ page }) => {
  await op(page, 'Add', '12 345 67 890 23 456 78 901');
  await op(page, 'Estimate');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Use linear counting instead: m·ln(m/V) = 16·ln(16/9) = 9.2',
  );
  await expect(page.locator('.vars')).toContainText(/true distinct\s*8/);
});

test('without the correction an empty sketch reports α·m', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Small-range correction (linear counting when E ≤ 2.5m)').uncheck();
  await op(page, 'Estimate');
  await toEnd(page);
  await expect(narration(page)).toContainText('The estimate is 10.8');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/hyperloglog/#practice=24680&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = await answerFirst(page);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations while adding (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await page.getByRole('tab', { name: 'Examples' }).click();
    await page
      .getByRole('listitem')
      .filter({ hasText: 'The first few items' })
      .getByRole('button', { name: 'Load' })
      .click();
    for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Step forward' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
