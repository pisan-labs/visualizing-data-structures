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
  await page.goto(emptyStart('wordpiece'));
  await expect(page.getByRole('heading', { name: 'WordPiece tokenizer' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('encode walks the tries and takes the longest pieces', async ({ page }) => {
  await op(page, 'Train');
  await op(page, 'Encode', 'walking');
  await toEnd(page);
  await expect(narration(page)).toContainText('walking → w ##a ##lkin ##g');
  await page.getByRole('button', { name: 'Step back', exact: true }).click();
  await page.getByRole('button', { name: 'Step back', exact: true }).click();
  await expect(stage(page).locator('text', { hasText: 'trie of ## pieces' })).toBeVisible();
  await op(page, 'Encode', 'rabbit');
  await toEnd(page);
  await expect(narration(page)).toContainText('rabbit → [UNK]');
});

test('training scores pairs, and BPE’s pick is shown apart', async ({ page }) => {
  const back = page.getByRole('button', { name: 'Step back', exact: true });
  // On the toy corpus, BPE's pick (t ##h) scores too low for the top five: a row of its own.
  await op(page, 'One merge');
  await toEnd(page);
  await expect(narration(page)).toContainText('Learned merge 1: r ##u → ru');
  await back.click();
  await back.click();
  await expect(narration(page)).toContainText('BPE would take the most frequent pair, t ##h');
  await expect(stage(page).locator('text', { hasText: 'BPE’s pick' })).toBeVisible();
  await op(page, 'Load text', 'the*12 then*2 hug*3 pug*2 hugs');
  await op(page, 'One merge');
  await toEnd(page);
  await expect(narration(page)).toContainText('Learned merge 1: h ##u → hu');
  await page.getByLabel('Word or text', { exact: true }).fill('cat 42');
  await page.getByRole('button', { name: 'Load text', exact: true }).click();
  await expect(page.getByText('Use letters only')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/wordpiece/#practice=13579&n=5');
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
  test(`no axe violations on training and the trie walk (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'One merge');
    await toEnd(page);
    await page.getByRole('button', { name: 'Step back', exact: true }).click();
    await settled(page);
    const scan = () =>
      new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axeFindings(await scan())).toEqual([]);
    await op(page, 'Encode', 'boat');
    await toEnd(page);
    await page.getByRole('button', { name: 'Step back', exact: true }).click();
    await settled(page);
    expect(axeFindings(await scan())).toEqual([]);
  });
}
