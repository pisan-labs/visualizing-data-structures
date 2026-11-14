import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const vars = (page: Page) => page.locator('.vars');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Prompt or request', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('prefix-cache'));
  await expect(page.getByRole('heading', { name: 'Prefix cache (radix tree)' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('a second prompt reuses the shared start and splits the edge', async ({ page }) => {
  await op(page, 'Request', 'the cat sat on the mat');
  await op(page, 'Finish', 'A');
  await op(page, 'Request', 'the cat sat on the rug');
  await toEnd(page);
  await expect(narration(page)).toContainText('5 tokens come from the cache');
  await expect(vars(page)).toContainText(/tokens reused\s*=?\s*5/);
  await expect(vars(page)).toContainText(/hit rate\s*=?\s*"?42%/);
  await settled(page);
  await expect(stage(page).getByText('the cat sat on the', { exact: true })).toBeVisible();
});

test('a full cache evicts the least recently used unused leaf', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByRole('radio', { name: '12 tokens' }).check();
  for (const [name, value] of [
    ['Request', 'the cat sat on the mat'],
    ['Finish', 'A'],
    ['Request', 'a dog ate the ball'],
    ['Finish', 'B'],
    ['Request', 'the cat sat on the rug'],
    ['Request', 'a dog ran'],
  ])
    await op(page, name!, value);
  await toEnd(page);
  await expect(narration(page)).toContainText('1 token was evicted');
  await expect(vars(page)).toContainText(/tokens evicted\s*=?\s*1/);
});

test('bad input is refused, and a request waits when nothing can go', async ({ page }) => {
  await op(page, 'Finish', 'A');
  await expect(narration(page)).toContainText('No request is running');
  await page.getByText('Options', { exact: true }).click();
  await page.getByRole('radio', { name: '12 tokens' }).check();
  await op(page, 'Request', 'the cat sat on the mat');
  await op(page, 'Request', 'a dog ate the ball');
  await op(page, 'Request', 'the fox ran');
  await toEnd(page);
  await expect(narration(page)).toContainText('C waits');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/prefix-cache/#practice=13579&n=5');
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
  test(`no axe violations with a request running (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Request', 'the cat sat on the mat');
    await op(page, 'Finish', 'A');
    await op(page, 'Request', 'the cat ran under the tree');
    await toEnd(page);
    await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
