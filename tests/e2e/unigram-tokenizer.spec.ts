import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, opButton, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Word or text', { exact: true }).fill(value);
  await (await opButton(page, name)).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('unigram-tokenizer'));
  await expect(
    page.getByRole('heading', { name: 'Unigram tokenizer (Viterbi split)' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('Viterbi finds the best split of talked', async ({ page }) => {
  await op(page, 'Encode', 'talked');
  await toEnd(page);
  await expect(narration(page)).toContainText('talked → t alked');
  await expect(narration(page)).toContainText('−7.11');
  await expect(stage(page).locator('text', { hasText: 'lattice of talked' })).toBeVisible();
  await expect(page.locator('.vars')).toContainText(/score\s*-7.11/);
});

test('training prunes down to the target, and a bad text is refused', async ({ page }) => {
  await op(page, 'Train');
  await toEnd(page);
  await expect(narration(page)).toContainText('Trained in 3 rounds');
  await expect(page.locator('.vars')).toContainText(/longer\s*8/);
  await op(page, 'Load text', 'café crème');
  await expect(page.getByText('Use the letters a to z only')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/unigram-tokenizer/#practice=13579&n=5');
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
  test(`no axe violations on the lattice and the pruning table (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Encode', 'walking');
    await toEnd(page);
    await settled(page);
    const tags = ['wcag2a', 'wcag2aa', 'wcag21aa'];
    expect(axeFindings(await new AxeBuilder({ page }).withTags(tags).analyze())).toEqual([]);
    await op(page, 'Prune once');
    await toEnd(page);
    await settled(page);
    expect(axeFindings(await new AxeBuilder({ page }).withTags(tags).analyze())).toEqual([]);
  });
}
