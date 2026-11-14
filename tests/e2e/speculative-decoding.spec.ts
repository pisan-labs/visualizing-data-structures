import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, opButton, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined)
    await page.getByLabel('Prompt, or u values', { exact: true }).fill(value);
  await (await opButton(page, name)).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** A link that loads these operations with these settings. */
function link(ops: unknown[], settings: Record<string, unknown> = {}, seed = 1) {
  const json = JSON.stringify({ format: 1, viz: 'speculative-decoding', seed, settings, ops });
  return `/speculative-decoding/#ex=j${Buffer.from(json).toString('base64url')}`;
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('speculative-decoding'));
  await expect(page.getByRole('heading', { name: 'Speculative decoding' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('greedy acceptance writes the large model’s text in fewer passes', async ({ page }) => {
  await page.goto(link([['start', 'the fox'], ['generate']], { k: 3, accept: 'greedy' }));
  await expect(narration(page)).toContainText('3 words in 1 large pass');
  await expect(page.locator('.vars')).toContainText(/saved\s*2/);
});

test('u values decide the test, and bad input is refused', async ({ page }) => {
  await page.goto(link([['start', 'the cat'], ['draft']], {}, 3));
  await op(page, 'Verify with u', '0.8 0.4');
  await toEnd(page);
  await expect(narration(page)).toContainText('0 of 1 draft accepted');
  await expect(page.locator('.stage > svg').locator('text', { hasText: 'resample' })).toBeVisible();
  await op(page, 'Start', 'the zebra');
  await expect(page.getByText('never appears in the corpus')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/speculative-decoding/#practice=13579&n=5');
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
  test(`no axe violations on a round and a resample (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Start', 'the cat');
    await op(page, 'Generate');
    await toEnd(page);
    await settled(page);
    const tags = ['wcag2a', 'wcag2aa', 'wcag21aa'];
    expect(axeFindings(await new AxeBuilder({ page }).withTags(tags).analyze())).toEqual([]);
    // Back to a step that draws from the leftover, with its line of u.
    await page.goto(link([['start', 'the cat'], ['step']], {}, 6));
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    expect(axeFindings(await new AxeBuilder({ page }).withTags(tags).analyze())).toEqual([]);
  });
}
