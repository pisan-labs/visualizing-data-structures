import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Word', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/embeddings/');
  await expect(page.getByRole('heading', { name: 'Embeddings and similarity' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('nearest keeps the best three in a heap and ranks them', async ({ page }) => {
  await op(page, 'Nearest', 'kitten');
  await toEnd(page);
  await expect(narration(page)).toContainText('cat 1.00, dog 0.96, fox 0.93');
  await expect(stage(page).locator('text', { hasText: 'best first' })).toBeVisible();
  await expect(page.locator('.vars')).toContainText(/scores\s*11/);
});

test('an analogy lands next to queen, and an unknown word is refused', async ({ page }) => {
  await op(page, 'Analogy (a − b + c)', 'king man woman');
  await toEnd(page);
  await expect(narration(page)).toContainText('the nearest is queen');
  await page.getByLabel('Word', { exact: true }).fill('zebra');
  await page.getByRole('button', { name: 'Nearest', exact: true }).click();
  await expect(page.getByText('Use one of the words shown')).toBeVisible();
});

test('similarity works through the dot product and the cosine', async ({ page }) => {
  await op(page, 'Similarity', 'cat kitten');
  await toEnd(page);
  await expect(narration(page)).toContainText('their cosine similarity is 1.00');
  await expect(stage(page).locator('text', { hasText: 'cos = 1' })).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/embeddings/#practice=13579&n=5');
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
  test(`no axe violations on a finished analogy (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Analogy (a − b + c)', 'puppy dog cat');
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
