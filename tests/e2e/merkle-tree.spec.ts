import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const vars = (page: Page) => page.locator('.vars');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Block or number', { exact: true }).fill(value);
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible())) await page.getByText('More operations').click();
  await button.click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function stepUntil(page: Page, text: string) {
  const back = page.getByRole('button', { name: 'Step back' });
  for (let i = 0; i < 60; i++) {
    if (((await narration(page).textContent()) ?? '').includes(text)) return;
    await back.click();
  }
  throw new Error(`no step says "${text}"`);
}

async function load(page: Page, title: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ has: page.getByText(title, { exact: true }) })
    .getByRole('button', { name: 'Load' })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/merkle-tree/');
  await expect(page.getByRole('heading', { name: 'Merkle tree' })).toBeVisible();
});

test('a change rehashes the path to the root', async ({ page }) => {
  await fast(page);
  await op(page, 'Build', 'a b c d');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /Merkle tree over 4 blocks/);
  await op(page, 'Change block', '1 z');
  await toEnd(page);
  await expect(narration(page)).toContainText('The root changed from');
  await expect(vars(page)).toContainText(/hashes computed\s*3/);
  await stepUntil(page, 'out of date');
  await expect(stage(page).locator('rect[class*="ghost"]')).toHaveCount(3);
});

test('a real proof is accepted and a forged claim rejected', async ({ page }) => {
  await fast(page);
  await op(page, 'Build', 'a b c d e');
  await toEnd(page);
  await op(page, 'Prove block', '4');
  await toEnd(page);
  await expect(narration(page)).toContainText('block 4 is in the tree');
  await op(page, 'Check a claim', '1 x');
  await toEnd(page);
  await expect(narration(page)).toContainText('rejected');
  await expect(vars(page)).toContainText(/verified\s*no/);
});

test('a practice set grades an answer and shows it on the tree', async ({ page }) => {
  await page.goto('/merkle-tree/#practice=27182&n=4');
  await expect(page.locator('.question')).toHaveCount(4);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\./)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /Merkle tree over/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Prove a block is in the tree' }).first().click();
  await expect(page.getByText('Loaded "Prove a block is in the tree"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-proof and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await load(page, 'A forged claim fails at the root');
    await fast(page);
    await toEnd(page);
    await stepUntil(page, 'Level 1: the sibling');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
