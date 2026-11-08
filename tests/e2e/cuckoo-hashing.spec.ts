import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

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
  await page.goto('/cuckoo-hashing/');
  await expect(page.getByRole('heading', { name: 'Cuckoo hashing' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('an insert kicks keys to their other nest', async ({ page }) => {
  await op(page, 'Insert', '61 4 26 125 37');
  await toEnd(page);
  await expect(narration(page)).toContainText('Every key has a slot after 3 kicks');
  await expect(stage(page)).toHaveAttribute('aria-label', /T2: 0: 125/);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('homeless for the second time');
  // The kicked key waits in the box at the top left.
  await expect(stage(page).locator('text', { hasText: /^37$/ })).toHaveCount(1);
});

test('a cycle forces a rehash into bigger tables', async ({ page }) => {
  await op(page, 'Insert', '5 126 247');
  await toEnd(page);
  await expect(narration(page)).toContainText('Every key has a slot in the new tables of 13');
  await expect(page.locator('.vars')).toContainText(/rehashes\s*1/);
});

test('search makes at most two probes', async ({ page }) => {
  await op(page, 'Insert', '20 53');
  await op(page, 'Search', '64');
  await toEnd(page);
  await expect(narration(page)).toContainText('2 probes, always');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/cuckoo-hashing/#practice=24680&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = await answerFirst(page);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-kick (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await page.getByRole('tab', { name: 'Examples' }).click();
    await page
      .getByRole('listitem')
      .filter({ hasText: 'A cycle forces a rehash' })
      .getByRole('button', { name: 'Load' })
      .click();
    for (let i = 0; i < 9; i++) await page.getByRole('button', { name: 'Step forward' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
