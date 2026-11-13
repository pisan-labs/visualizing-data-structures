import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const DOCS =
  'the cat sat on the mat; the dog sat on the rug; the cat saw the dog; the bird sat on the tree; a dog ate the ball; the fox ran and the dog chased it';

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Text', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('bm25'));
  await expect(page.getByRole('heading', { name: 'Inverted index and BM25' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('search ranks the document with both words first', async ({ page }) => {
  await op(page, 'Add', DOCS);
  await op(page, 'Search', 'cat mat');
  await toEnd(page);
  await expect(narration(page)).toContainText('1. d1 (0.86), 2. d3 (0.29)');
  await expect(page.locator('.vars')).toContainText(/postings read\s*3/);
});

test('a word in every document gets a negative IDF, and an empty index is refused', async ({
  page,
}) => {
  await op(page, 'Search', 'cat');
  await expect(narration(page)).toContainText('The index is empty');
  await op(page, 'Add', DOCS);
  await op(page, 'Search', 'the');
  await toEnd(page);
  await expect(narration(page)).toContainText('1. d5');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/bm25/#practice=13579&n=5');
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
  test(`no axe violations on a finished search (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Add', DOCS);
    await op(page, 'Search', 'the cat');
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
