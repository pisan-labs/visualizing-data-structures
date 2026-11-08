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
  if (value !== undefined) await page.getByLabel('Key', { exact: true }).fill(value);
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
  await page.goto('/pairing-heap/');
  await expect(page.getByRole('heading', { name: 'Pairing heap' })).toBeVisible();
});

test('inserts are one link each, deleteMin pairs in two passes', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '1 5 3 7 2');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /1 has children 2, 7, 3, 5/);
  await op(page, 'Delete min');
  await toEnd(page);
  await expect(narration(page)).toContainText('Return 1');
  await expect(vars(page)).toContainText(/links\s*3/);
  await stepUntil(page, 'Pass 2, right to left');
  await expect(stage(page)).toHaveAttribute('aria-label', /2 trees/);
});

test('decrease-key cuts the subtree and melds it back', async ({ page }) => {
  await load(page, 'Decrease-key by cutting');
  await fast(page);
  await toEnd(page);
  await stepUntil(page, 'Cut 4 and its whole subtree');
  await expect(page.locator('.code li.active')).toContainText(['cut x and its subtree']);
});

test('the stored form draws first-child and next-sibling pointers', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('As stored: first child and next sibling').check();
  await fast(page);
  await op(page, 'Insert', '1 5 3');
  await toEnd(page);
  // Root 1 points at its first child 3, and 3 at its next sibling 5: two arrows with heads.
  await expect(stage(page).locator('[marker-end]')).toHaveCount(2);
});

test('a practice set grades an answer and shows it on the heap', async ({ page }) => {
  await page.goto('/pairing-heap/#practice=27182&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
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
  await expect(stage(page)).toHaveAttribute('aria-label', /pairing heap/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Meld two heaps with one comparison' }).first().click();
  await expect(page.getByText('Loaded "Meld two heaps with one comparison"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-pairing and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await load(page, 'deleteMin in two passes');
    await fast(page);
    await toEnd(page);
    await stepUntil(page, 'Pass 1, left to right');
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
