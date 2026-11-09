import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Word', { exact: true }).fill(value);
  const button = page.getByRole('button', { name, exact: true });
  // Less common operations sit under "More operations".
  if (!(await button.isVisible())) await page.getByText('More operations', { exact: true }).click();
  await button.click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function stepUntil(page: Page, text: string) {
  const back = page.getByRole('button', { name: 'Step back' });
  for (let i = 0; i < 40; i++) {
    if (((await narration(page).textContent()) ?? '').includes(text)) return;
    await back.click();
  }
  throw new Error(`no step says "${text}"`);
}

async function seven(page: Page) {
  await fast(page);
  await op(page, 'Insert', 'car cat cart care dog do dot');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    'A trie with 7 words in 11 nodes, height 4: car, care, cart, cat, do, dog, dot.',
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('trie'));
  await expect(page.getByRole('heading', { name: 'Trie' })).toBeVisible();
});

test('insert follows or makes one edge per letter', async ({ page }) => {
  await seven(page);
  await expect(narration(page)).toContainText('dot is in the trie. It took 1 new node.');
  await expect(page.locator('.vars')).toContainText(/nodes\s*=?\s*11/);
  await stepUntil(page, 'No new nodes: the path was already there, because do is a prefix of dog.');
  await stepUntil(page, 'Letter t: no edge t here');
  await expect(page.locator('.code li.active').first()).toContainText('for each letter c of word');
  // The word being inserted is drawn as letter cells beside the root.
  await expect(stage(page).locator('text', { hasText: /^word$/ })).toBeVisible();
});

test('a search for a prefix that is not a word says so', async ({ page }) => {
  await seven(page);
  await op(page, 'Search', 'ca');
  await toEnd(page);
  await expect(narration(page)).toContainText('ca is only a prefix of car, care, cart and more');
  await expect(page.locator('.vars')).toContainText(/found\s*=?\s*false/);
  await op(page, 'Search', 'cow');
  await toEnd(page);
  await expect(narration(page)).toContainText('there is no edge o from the node for c');
});

test('starts with lists the words below the prefix in order', async ({ page }) => {
  await seven(page);
  await op(page, 'Starts with', 'ca');
  await toEnd(page);
  await expect(narration(page)).toContainText('4 words start with ca: car, care, cart, cat.');
  for (const w of ['car', 'care', 'cart', 'cat'])
    await expect(stage(page).locator('text', { hasText: new RegExp(`^${w}$`) })).toBeVisible();
});

test('delete prunes the nodes that lead nowhere, or only unmarks when lazy', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', 'cat card');
  await toEnd(page);
  await op(page, 'Delete', 'card');
  await toEnd(page);
  await expect(narration(page)).toContainText('card is gone, with 2 nodes removed');
  await expect(stage(page)).toHaveAttribute('aria-label', /1 word in 4 nodes/);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Only unmark the word (lazy)').check();
  await op(page, 'Insert', 'card');
  await toEnd(page);
  await op(page, 'Delete', 'card');
  await toEnd(page);
  await expect(narration(page)).toContainText('that is all a lazy delete does');
  await expect(stage(page)).toHaveAttribute('aria-label', /1 word in 6 nodes/);
});

test('bad words are refused with a reason', async ({ page }) => {
  await op(page, 'Insert', 'cat 4ever');
  await expect(page.getByRole('alert')).toContainText('"4ever": Use only the letters a to z');
  await op(page, 'Search', 'two words');
  await expect(page.getByRole('alert')).toContainText(
    'Use only the letters a to z, with no spaces.',
  );
  await op(page, 'Starts with', 'abcdefghijk');
  await expect(page.getByRole('alert')).toContainText('Keep words to 10 letters.');
});

test('a practice set grades an answer and shows it on the trie', async ({ page }) => {
  await page.goto('/trie/#practice=24680&n=5');
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
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
  await expect(stage(page)).toHaveAttribute('aria-label', /A trie with \d+ words?/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'A word that is a prefix of another' }).first().click();
  await expect(page.getByText('Loaded "A word that is a prefix of another"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText(/insert\(car\)|Letter|edge/);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-delete and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await seven(page);
    await op(page, 'Delete', 'cart');
    await toEnd(page);
    await stepUntil(page, 'leads nowhere');
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
