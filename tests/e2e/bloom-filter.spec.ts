import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Key', { exact: true }).fill(value);
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
  await page.goto(emptyStart('bloom-filter'));
  await expect(page.getByRole('heading', { name: 'Bloom filter' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('insert sets k bits, and a query names the keys behind a false positive', async ({ page }) => {
  await op(page, 'Insert', '12 25 31 47');
  await toEnd(page);
  await expect(page.locator('.vars')).toContainText(/bits set\s*7/);
  await op(page, 'Query', '45');
  await toEnd(page);
  await expect(narration(page)).toContainText('a false positive');
  await expect(narration(page)).toContainText('bit 9 by 12 and 47');
  await expect(page.locator('.vars')).toContainText(/false \+\s*"1 of 1"/);
  await op(page, 'Query', '50');
  await toEnd(page);
  await expect(narration(page)).toContainText('definitely not in the set');
});

test('measure counts the false positives over every key never inserted', async ({ page }) => {
  await op(page, 'Insert', '12 25 31 47');
  await op(page, 'Measure');
  await toEnd(page);
  await expect(narration(page)).toContainText('78 of the 996');
  await expect(page.locator('.vars')).toContainText(/measured\s*"7\.8%"/);
  await expect(stage(page).locator('text', { hasText: 'false +: 45, 49, 61, 66' })).toBeVisible();
});

test('try delete explains why a Bloom filter cannot delete', async ({ page }) => {
  await op(page, 'Insert', '12 31');
  await op(page, 'Try delete', '31');
  await toEnd(page);
  await expect(narration(page)).toContainText('would make query(12) answer "definitely not"');
  await expect(narration(page)).toContainText('counting Bloom filter');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/bloom-filter/#practice=24680&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = await answerFirst(page);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations during a false positive (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await page.getByRole('tab', { name: 'Examples' }).click();
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Four keys set 7' })
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
