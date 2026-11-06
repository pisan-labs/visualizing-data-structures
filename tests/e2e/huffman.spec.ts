import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Text or counts', { exact: true }).fill(value);
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
  for (let i = 0; i < 60; i++) {
    if (((await narration(page).textContent()) ?? '').includes(text)) return;
    await back.click();
  }
  throw new Error(`no step says "${text}"`);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/huffman/');
  await expect(page.getByRole('heading', { name: 'Huffman coding' })).toBeVisible();
});

test('build merges the two lightest trees until one is left', async ({ page }) => {
  await fast(page);
  await op(page, 'Build', 'abracadabra');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    'A Huffman tree for 5 symbols. Codes: a 0, b 110, c 100, d 101, r 111. Total 23 bits.',
  );
  await expect(page.locator('.vars')).toContainText(/bits\s*=?\s*23/);
  await stepUntil(page, '3 trees weigh 2: b (2), r (2) and the tree cd (2).');
  // The two trees taken out sit apart from the queue, under their own caption.
  await expect(stage(page).locator('text', { hasText: 'taken out' })).toBeVisible();
  await expect(page.locator('.code li.active').first()).toContainText('while Q holds more');
});

test('the tie rule changes the codes but not the total', async ({ page }) => {
  await fast(page);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Merged trees first (oldest first), then leaves').check();
  await op(page, 'Build', 'abracadabra');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /c 1100, d 1101, r 10\. Total 23 bits\./);
});

test('encode writes the codes and compares with a fixed-length code', async ({ page }) => {
  await fast(page);
  await op(page, 'Build', 'she sells sea shells');
  await toEnd(page);
  await op(page, 'Encode');
  await toEnd(page);
  await expect(narration(page)).toContainText('20 symbols take 49 bits');
  await expect(stage(page).locator('text', { hasText: /^Huffman: 49 bits/ })).toBeVisible();
});

test('decode walks the tree and catches bits that stop inside a code', async ({ page }) => {
  await fast(page);
  await op(page, 'Build', 'abracadabra');
  await toEnd(page);
  await op(page, 'Decode bits', '01101110');
  await toEnd(page);
  await expect(narration(page)).toContainText('the message is "abra"');
  await op(page, 'Decode bits', '011');
  await toEnd(page);
  await expect(narration(page)).toContainText('are not a whole code');
});

test('load and merge two run the build one round at a time', async ({ page }) => {
  await fast(page);
  await op(page, 'Load only', 'a:5 b:2 c:1 d:1');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /A priority queue of 4 trees/);
  await op(page, 'Merge two');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /3 trees, lightest first: b \(2\)/);
});

test('bad input is refused with a reason', async ({ page }) => {
  await op(page, 'Build', 'a:5 b:x');
  await expect(page.getByRole('alert')).toContainText('Write each count as symbol:count');
  await op(page, 'Build', 'tabé');
  await expect(page.getByRole('alert')).toContainText('The text can hold letters');
});

test('a practice set grades an answer and shows it on the drawing', async ({ page }) => {
  await page.goto('/huffman/#practice=24680&n=5');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /Huffman tree|priority queue/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'One common letter, four rare ones' }).first().click();
  await expect(page.getByText('Loaded "One common letter, four rare ones"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText(/abracadabra|lightest|Count/);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-merge and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await op(page, 'Build', 'a:7 b:3 c:12 d:5 e:9 f:2 g:15 h:4 i:6 j:1');
    await toEnd(page);
    await stepUntil(page, 'Take the two lightest trees');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
