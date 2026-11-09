import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Key', { exact: true }).fill(value);
  const button = page.getByRole('button', { name, exact: true });
  // Less common operations sit under "More operations".
  if (!(await button.isVisible())) await page.getByText('More operations').click();
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

async function thirteen(page: Page) {
  await fast(page);
  await op(page, 'Insert', '12 31 8 27 45 19');
  await toEnd(page);
  await op(page, 'Merge with', '22 6 38 15 50 9 33');
  await toEnd(page);
  await expect(narration(page)).toContainText('N = 13 = 1101₂');
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('binomial-queue'));
  await expect(page.getByRole('heading', { name: 'Binomial queue' })).toBeVisible();
});

test('an insert carries like adding 1 in binary', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '30 10 50 20 60 40 70');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /7 keys, 111₂ in binary/);
  await op(page, 'Insert', '5');
  await toEnd(page);
  await expect(page.locator('.vars')).toContainText(/links\s*3/);
  await expect(stage(page)).toHaveAttribute('aria-label', /a B₃ rooted at 5\./);
  await stepUntil(page, 'Two B₀s: link them');
  await expect(narration(page)).toContainText('a carry into the next binary digit');
});

test('union is binary addition, three of a kind included', async ({ page }) => {
  await thirteen(page);
  await stepUntil(page, 'Three B₂ trees in a row');
  await expect(stage(page).locator('text', { hasText: '110₂ + 111₂ = 1101₂' })).toBeVisible();
  await expect(page.locator('.code li.active')).toContainText(['elseif deg(sib) == deg(x)']);
});

test('findMin and extractMin', async ({ page }) => {
  await thirteen(page);
  await op(page, 'Find min');
  await toEnd(page);
  await expect(narration(page)).toContainText('The minimum is 6');
  await op(page, 'Delete min');
  await toEnd(page);
  await expect(narration(page)).toContainText('Return 6. N = 12 = 1100₂');
  await expect(page.locator('.vars')).toContainText(/returned\s*6/);
});

test('decreaseKey moves a key up under More operations', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '10 30 20 40 50 70 60 80');
  await toEnd(page);
  await op(page, 'Decrease key', '80 5');
  await toEnd(page);
  await expect(narration(page)).toContainText('5 is at the root of its tree');
  await op(page, 'Decrease key', '5 9');
  await expect(narration(page)).toContainText('decreaseKey only lowers a key');
});

test('the internal view draws the child and sibling pointers', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('As pointers: leftmost child, next sibling (internal view)').check();
  await thirteen(page);
  await expect(stage(page).locator('text', { hasText: /^head$/ })).toBeVisible();
  // 13 nodes in 3 trees: 10 child or sibling pointers, 2 root list links and the head pointer.
  await expect(stage(page).locator('line')).toHaveCount(13);
});

test('a practice set grades an answer and shows it on the queue', async ({ page }) => {
  await page.goto('/binomial-queue/#practice=16180&n=5');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /A binomial queue with \d+ keys/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'An insert that carries all the way' }).first().click();
  await expect(page.getByText('Loaded "An insert that carries all the way"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText(/mergeWith|union|link/);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-union and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await thirteen(page);
    await stepUntil(page, 'Three B₂ trees in a row');
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
