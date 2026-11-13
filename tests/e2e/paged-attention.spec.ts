import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const vars = (page: Page) => page.locator('.vars');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Prompt length or request').fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function twoRequests(page: Page) {
  await op(page, 'Add', '5 3');
  for (let i = 0; i < 4; i++) await op(page, 'Step');
  await toEnd(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('paged-attention'));
  await expect(
    page.getByRole('heading', { name: 'Paged KV cache (PagedAttention)' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('blocks are handed out only when a last block is full', async ({ page }) => {
  await twoRequests(page);
  await expect(narration(page)).toContainText('5 of 12 blocks are in use, with 4 slots wasted');
  await expect(vars(page)).toContainText(/tokens\s*=?\s*16/);
  await expect(vars(page)).toContainText(/wasted if contiguous\s*=?\s*16/);
  await expect(stage(page).locator('text', { hasText: 'block tables' })).toBeVisible();
});

test('forks share the prompt and copy a block only on write', async ({ page }) => {
  await op(page, 'Add', '6');
  await op(page, 'Fork', 'A');
  await op(page, 'Fork', 'A');
  await toEnd(page);
  await expect(stage(page).locator('text', { hasText: '×3' })).toHaveCount(2);
  await op(page, 'Step');
  await toEnd(page);
  await expect(narration(page)).toContainText('2 blocks copied on write');
  await expect(vars(page)).toContainText(/copied blocks\s*=?\s*2/);
});

test('without sharing a fork copies every block', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Share blocks between forks (copy on write)').uncheck();
  await op(page, 'Add', '6');
  await op(page, 'Fork', 'A');
  await toEnd(page);
  await expect(narration(page)).toContainText('2 blocks copied');
  await expect(vars(page)).toContainText(/copied blocks\s*=?\s*2/);
  await expect(vars(page)).toContainText(/shared blocks\s*=?\s*0/);
});

test('finishing frees blocks, and bad input is refused', async ({ page }) => {
  await op(page, 'Step');
  await expect(narration(page)).toContainText('No request is running');
  await op(page, 'Add', '6');
  await op(page, 'Finish', 'B');
  await expect(narration(page)).toContainText('no running request B');
  await op(page, 'Finish', 'A');
  await toEnd(page);
  await expect(narration(page)).toContainText('12 of 12 blocks are free');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/paged-attention/#practice=13579&n=5');
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
  test(`no axe violations with shared blocks (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Add', '6');
    await op(page, 'Fork', 'A');
    await op(page, 'Add', '3');
    await op(page, 'Step');
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
