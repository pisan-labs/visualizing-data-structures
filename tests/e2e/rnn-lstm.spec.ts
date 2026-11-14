import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Sentence', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** A link that loads these operations with these settings. */
function link(ops: unknown[], settings: Record<string, unknown> = {}) {
  const json = JSON.stringify({ format: 1, viz: 'rnn-lstm', seed: 1, settings, ops });
  return `/rnn-lstm/#ex=j${Buffer.from(json).toString('base64url')}`;
}

const SENTENCE = 'cat sat on the mat and it slept';

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('rnn-lstm'));
  await expect(
    page.getByRole('heading', { name: 'Recurrent networks (RNN and LSTM)' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('the plain RNN’s pull of word 1 fades', async ({ page }) => {
  await op(page, 'Load', SENTENCE);
  await op(page, 'Read all');
  await toEnd(page);
  await expect(narration(page)).toContainText('by 0.096 as much');
  await expect(page.locator('.vars')).toContainText(/h\s*0\.12/);
});

test('the LSTM keeps it, and one step reads one word', async ({ page }) => {
  await page.goto(link([['load', SENTENCE], ['run']], { model: 'lstm' }));
  await expect(narration(page)).toContainText('by 0.71 as much');
  await expect(page.locator('.stage > svg').locator('text', { hasText: '∂c/∂c₁' })).toBeVisible();
  await op(page, 'Load', 'dog ran');
  await op(page, 'Read next word');
  await toEnd(page);
  await expect(page.locator('.vars')).toContainText(/words read\s*1/);
  await op(page, 'Load', 'the elephant');
  await expect(page.getByText('six at most')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/rnn-lstm/#practice=13579&n=5');
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
  test(`no axe violations on a finished LSTM and a gate step (${theme})`, async ({ page }) => {
    await page.goto(link([['load', 'cat sat and the dog ate it'], ['run']], { model: 'lstm' }));
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await settled(page);
    const tags = ['wcag2a', 'wcag2aa', 'wcag21aa'];
    expect(axeFindings(await new AxeBuilder({ page }).withTags(tags).analyze())).toEqual([]);
    // Back to the middle of the last word, with a row half filled and cells marked.
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    expect(axeFindings(await new AxeBuilder({ page }).withTags(tags).analyze())).toEqual([]);
  });
}
