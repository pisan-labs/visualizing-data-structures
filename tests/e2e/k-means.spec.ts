import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, opButton, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Points', { exact: true }).fill(value);
  await (await opButton(page, name)).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('k-means'));
  await expect(page.getByRole('heading', { name: 'k-means clustering' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('centres placed by hand converge in three rounds', async ({ page }) => {
  await op(page, 'Load', '1,1 2,1 1,3 5,4 6,5 7,5');
  await op(page, 'Place centres', '1,1 2,1');
  await op(page, 'Run');
  await toEnd(page);
  await expect(narration(page)).toContainText('round 3 changed nothing');
  await expect(page.locator('.vars')).toContainText(/WCSS\s*6/);
});

test('an empty cluster jumps to the farthest point', async ({ page }) => {
  await op(page, 'Load', '1,1 2,1 1,2 2,2 7,7 8,7 7,8 8,8 9,9');
  await op(page, 'Place centres', '1,1 8,8 10,0');
  await op(page, 'Assign');
  await op(page, 'Update');
  await toEnd(page);
  await expect(narration(page)).toContainText('WCSS fell from 10.00 to 7.60');
  await page.getByRole('button', { name: 'Back to the previous operation' }).click();
  await expect(narration(page)).toContainText('c3 got no points');
});

test('seeding needs enough points, and a bad list is refused', async ({ page }) => {
  await op(page, 'Load', '1,1 2,2');
  await op(page, 'Seed');
  await toEnd(page);
  await expect(narration(page)).toContainText('needs at least 3 points');
  await page.getByLabel('Points', { exact: true }).fill('1,1 99,2');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('Keep coordinates from 0 to 10')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/k-means/#practice=13579&n=5');
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
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations on a finished run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Load', '1,2 2,1 2,3 3,2 7,7 8,8 9,7 1,8 2,9 3,8');
    await op(page, 'Place centres', '2,2 8,7 2,8');
    await op(page, 'Run');
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
