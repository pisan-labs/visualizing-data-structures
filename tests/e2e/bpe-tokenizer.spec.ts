import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Word or text', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('bpe-tokenizer'));
  await expect(page.getByRole('heading', { name: 'Byte-pair encoding (BPE)' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('train learns 20 merges and encode replays them in order', async ({ page }) => {
  await op(page, 'Train');
  await toEnd(page);
  await expect(narration(page)).toContainText('Learned 20 merges');
  await expect(page.locator('.vars')).toContainText(/vocabulary\s*=?\s*42/);
  await expect(stage(page).locator('text', { hasText: 'vocabulary: 42' })).toBeVisible();
  await op(page, 'Encode', 'walked');
  await toEnd(page);
  await expect(narration(page)).toContainText('walked → w alked_');
  await expect(stage(page).locator('text', { hasText: 'merges, in order' })).toBeVisible();
});

test('a text loads, merges one at a time, and a bad text is refused', async ({ page }) => {
  await op(page, 'Load text', 'low*5 lowest*2 newer*6 wider*3 new*2');
  await op(page, 'One merge');
  await toEnd(page);
  await expect(narration(page)).toContainText('Learned merge 1: e r → er');
  await page.getByLabel('Word or text', { exact: true }).fill('cat 42');
  await page.getByRole('button', { name: 'Load text', exact: true }).click();
  await expect(page.getByText('Use letters only')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/bpe-tokenizer/#practice=13579&n=5');
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
  test(`no axe violations on training and encoding (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'One merge');
    await toEnd(page);
    await page.getByRole('button', { name: 'Step back', exact: true }).click();
    await settled(page);
    const scan = () =>
      new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axeFindings(await scan())).toEqual([]);
    await op(page, 'Encode', 'jumped');
    await toEnd(page);
    await settled(page);
    expect(axeFindings(await scan())).toEqual([]);
  });
}
