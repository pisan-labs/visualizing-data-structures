import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Words, or one word', { exact: true });

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function group(page: Page) {
  await page.getByRole('button', { name: 'Group anagrams', exact: true }).click();
  await toEnd(page);
}

async function unique(page: Page, word: string) {
  await input(page).fill(word);
  await page.getByRole('button', { name: 'First unique letter', exact: true }).click();
  await toEnd(page);
}

/** Open Options, pick settings by their radio labels, and close it again. */
async function options(page: Page, ...labels: string[]) {
  const summary = page.locator('summary', { hasText: 'Options' });
  await summary.click();
  for (const l of labels) await page.getByRole('radio', { name: l }).check();
  await summary.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/frequency-counting/');
  await expect(page.getByRole('heading', { name: 'Frequency counting (anagrams)' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('count signatures group the anagrams, with the work beside them', async ({ page }) => {
  await group(page);
  await expect(narration(page)).toContainText(
    '4 groups: night thing; tops spot pots; below elbow; chin',
  );
  await expect(narration(page)).toContainText('244 counts and 8 lookups');
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*52/);
  await expect(page.locator('.vars')).toContainText(/pattern total\s*=?\s*252/);
  await expect(stage(page)).toHaveAttribute('aria-label', /g1h1i1n1t1: night thing/);
});

test('sorted letters give the same groups', async ({ page }) => {
  await options(page, 'Sort the letters, or rescan the word');
  await group(page);
  await expect(narration(page)).toContainText('4 groups: night thing; tops spot pots');
  await expect(page.locator('.vars')).toContainText(/comparisons\s*=?\s*44/);
  await expect(page.locator('.code')).toContainText('key: sorted letters');
});

test('the first unique letter, both ways', async ({ page }) => {
  await unique(page, 'abracadabra');
  await expect(narration(page)).toContainText('is “c”, at index 4');
  await expect(page.locator('.vars')).toContainText(/counts\s*=?\s*16/);
  await options(page, 'Sort the letters, or rescan the word');
  await toEnd(page);
  await expect(page.locator('.vars')).toContainText(/comparisons\s*=?\s*55/);
});

test('words that are not words are refused', async ({ page }) => {
  await input(page).fill('one two3');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('not a word')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/frequency-counting/#practice=13579&n=5');
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
  const show = first.getByRole('button', { name: 'Show me' });
  if (await show.count()) await showMe(page, show);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations on finished groups (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await group(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on the first unique letter (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'Sort the letters, or rescan the word');
    await unique(page, 'abracadabra');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
