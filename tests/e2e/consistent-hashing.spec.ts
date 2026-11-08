import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Key or server', { exact: true }).fill(value);
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
  await page.goto('/consistent-hashing/');
  await expect(page.getByRole('heading', { name: 'Consistent hashing' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('the page opens on three servers and twelve keys', async ({ page }) => {
  await expect(page.locator('.vars')).toContainText(/keys\s*12/);
  await expect(page.locator('.vars')).toContainText(/load A\s*7/);
  await expect(stage(page).locator('text', { hasText: /^7 keys$/ })).toBeVisible();
});

test('adding a server moves only the keys next to it', async ({ page }) => {
  await op(page, 'Add server', 'D');
  await toEnd(page);
  await expect(narration(page)).toContainText('3 keys of 12 change server: 58, 63 and 77');
  await expect(narration(page)).toContainText('would move 9 of the 12');
  await expect(page.locator('.vars')).toContainText(/load D\s*3/);
});

test('a lookup wraps past 359', async ({ page }) => {
  await op(page, 'Look up', '90');
  await toEnd(page);
  await expect(narration(page)).toContainText('going past 359 back to 0');
  await expect(narration(page)).toContainText('90 belongs to server B');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/consistent-hashing/#practice=24680&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = await answerFirst(page);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations after a server joins (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await page.getByRole('tab', { name: 'Examples' }).click();
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Virtual nodes even out the load' })
      .getByRole('button', { name: 'Load' })
      .click();
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
