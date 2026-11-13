import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, opButton, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Words', { exact: true }).fill(value);
  await (await opButton(page, name)).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** A link that loads these operations with these settings. */
function link(ops: unknown[], settings: Record<string, unknown> = {}) {
  const json = JSON.stringify({ format: 1, viz: 'ngram-lm', seed: 1, settings, ops });
  return `/ngram-lm/#ex=j${Buffer.from(json).toString('base64url')}`;
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('ngram-lm'));
  await expect(page.getByRole('heading', { name: 'N-gram language model' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('next word turns the counts after "the" into probabilities', async ({ page }) => {
  await op(page, 'Next word', 'the');
  await toEnd(page);
  await expect(narration(page)).toContainText('cat 9/29 = 0.31');
  await expect(
    page.locator('.stage > svg').locator('text', { hasText: 'P(w | the)' }),
  ).toBeVisible();
});

test('perplexity is finite for a seen sentence and infinite with an unseen pair', async ({
  page,
}) => {
  await op(page, 'Perplexity', 'the cat sat on the mat');
  await toEnd(page);
  await expect(narration(page)).toContainText('= 2.31');
  await op(page, 'Perplexity', 'the cat ate the ball');
  await toEnd(page);
  await expect(narration(page)).toContainText('perplexity is infinite');
  await expect(page.locator('.vars')).toContainText(/perplexity\s*Infinity/);
  await page.getByLabel('Words', { exact: true }).fill('the zebra');
  await page.getByRole('button', { name: 'Next word', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('never appears in the corpus');
});

test('generate draws a sentence, one u per word', async ({ page }) => {
  await page.goto(link([['generate']]));
  await expect(narration(page)).toContainText('Generated: the cat ran under the ball');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/ngram-lm/#practice=13579&n=5');
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
  test(`no axe violations on a draw and a score (${theme})`, async ({ page }) => {
    await page.goto(link([['generate']], { smoothing: 'laplace' }));
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    // A draw: the bars stacked end to end with the line of u.
    await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    let results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
    await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
    await op(page, 'Perplexity', 'the cat ate the ball');
    await toEnd(page);
    await settled(page);
    results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
