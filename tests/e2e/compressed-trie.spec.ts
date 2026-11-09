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

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('compressed-trie'));
  await expect(page.getByRole('heading', { name: 'Compressed trie' })).toBeVisible();
});

test('insert splits an edge where the word parts ways', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', 'card care');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    'A compressed trie with 2 words in 4 nodes (a plain trie would need 6), height 2: card, care.',
  );
  await stepUntil(page, 'Split: the edge "card" becomes "car" and "d"');
  await expect(page.locator('.code li.active').first()).toContainText('y = split(y, k)');
  // The edge labels hold strings.
  await expect(stage(page).locator('text', { hasText: /^car$/ })).toBeVisible();
});

test('a word that ends inside an edge splits it without a new leaf', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', 'cart car');
  await toEnd(page);
  await expect(narration(page)).toContainText('car ends exactly at the new node');
  await op(page, 'Search', 'ca');
  await toEnd(page);
  await expect(narration(page)).toContainText('ca runs out partway along the edge "car"');
  await expect(page.locator('.vars')).toContainText(/found\s*=?\s*false/);
});

test('delete merges a node left with one child', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', 'card care');
  await toEnd(page);
  await op(page, 'Delete', 'card');
  await toEnd(page);
  await expect(narration(page)).toContainText('are now one edge, "care"');
  await expect(stage(page)).toHaveAttribute('aria-label', /1 word in 2 nodes/);
  await stepUntil(page, 'Merge: its edge "car" and the edge "e" below it');
});

test('starts with collects below a prefix that ends inside an edge', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', 'banana band bandit');
  await toEnd(page);
  await op(page, 'Starts with', 'bana');
  await toEnd(page);
  await expect(narration(page)).toContainText('1 word starts with bana: banana.');
  await stepUntil(page, 'bana runs out partway along the edge "ana"');
});

test('a practice set grades an answer and shows it on the trie', async ({ page }) => {
  await page.goto('/compressed-trie/#practice=13579&n=5');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /A compressed trie with \d+ words?/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Insert splits an edge' }).first().click();
  await expect(page.getByText('Loaded "Insert splits an edge"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText(/insert\(care\)|edge|Split/);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-split and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await op(page, 'Insert', 'carton cartoon cart car dog');
    await toEnd(page);
    await stepUntil(page, 'Split: ');
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
