import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function reverse(page: Page, word: string) {
  await page.getByLabel('Word', { exact: true }).fill(word);
  await page.getByRole('button', { name: 'Reverse', exact: true }).click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** Answer the first practice question by reading the answer a wrong try reveals. */
async function answerFirst(page: Page) {
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
  return first;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/reverse-string/');
  await expect(page.getByRole('heading', { name: 'Reversing a string' })).toBeVisible();
});

test('the rest-first version builds the answer on the way back', async ({ page }) => {
  await fast(page);
  await reverse(page, 'STACK');
  await toEnd(page);
  await expect(narration(page)).toContainText('returns "KCATS" to main');
  await expect(page.locator('.vars')).toContainText('KCATS');
  // Step back to where the call on "CK" hands back "KC".
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('"K" + "C" = "KC"');
  await expect(stage(page).locator('text', { hasText: /^return "KC"$/ })).toBeVisible();
});

test('swapping the ends works in place and stops when i passes j', async ({ page }) => {
  await fast(page);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Swap the two ends, then reverse the inside (in place)').check();
  await expect(page.locator('.code')).toContainText('swap A[i] and A[j]');
  await reverse(page, 'ABCD');
  await toEnd(page);
  await expect(narration(page)).toContainText('A now reads "DCBA"');
  await expect(stage(page)).toHaveAttribute('aria-label', /gave "DCBA" after 3 calls/);
});

test('a word too long is refused with a reason', async ({ page }) => {
  await reverse(page, 'ABCDEFGHIJ');
  await expect(page.getByRole('alert')).toContainText('8 characters');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText('reverse("STACK")');
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/reverse-string/#practice=13579&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = await answerFirst(page);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(narration(page)).toContainText('reverse');
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-reversal (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await reverse(page, 'STRESSED');
    await toEnd(page);
    for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
