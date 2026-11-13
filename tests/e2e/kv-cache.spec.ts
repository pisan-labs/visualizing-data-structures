import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const vars = (page: Page) => page.locator('.vars');

async function op(page: Page, name: string, value: string) {
  await page.getByLabel('Text', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function write(page: Page) {
  await op(page, 'Prefill', 'the dog saw the ball');
  await op(page, 'Generate', 'and it ran');
  await toEnd(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('kv-cache'));
  await expect(page.getByRole('heading', { name: 'KV cache' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('prefill, then one cached row per generated token', async ({ page }) => {
  await write(page);
  await expect(narration(page)).toContainText('Token 8 cost 56 multiply-adds');
  await expect(vars(page)).toContainText(/cache rows\s*8/);
  await expect(vars(page)).toContainText(/total multiply-adds\s*336/);
  await expect(vars(page)).toContainText(/recomputed rows\s*0/);
  await expect(stage(page).locator('text', { hasText: 'K cache' })).toBeVisible();
});

test('without the cache every token computes K and V again', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Keep a KV cache').uncheck();
  await write(page);
  await expect(narration(page)).toContainText('With a cache it would have cost 56');
  await expect(vars(page)).toContainText(/cache rows\s*0/);
  await expect(vars(page)).toContainText(/total multiply-adds\s*624/);
  await expect(vars(page)).toContainText(/recomputed rows\s*18/);
});

test('a window evicts the oldest, and the toy stops at eight tokens', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('The last 3 tokens').check();
  await write(page);
  await expect(narration(page)).toContainText('the window is full');
  await expect(vars(page)).toContainText(/cache numbers\s*12/);
  await op(page, 'Generate', 'fox');
  await expect(narration(page)).toContainText('stops at 8 tokens');
});

test('generate asks for a prompt first, and a bad word is refused', async ({ page }) => {
  await op(page, 'Generate', 'cat');
  await expect(narration(page)).toContainText('Start with a prompt');
  await op(page, 'Prefill', 'the elephant');
  await expect(page.getByText('six at most')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/kv-cache/#practice=13579&n=5');
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
  test(`no axe violations on a full cache (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await write(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
