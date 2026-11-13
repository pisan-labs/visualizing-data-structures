import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, opButton, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Regex', { exact: true }).fill(value);
  await (await opButton(page, name)).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** A link that loads these operations with these settings. */
function link(ops: unknown[], settings: Record<string, unknown> = {}) {
  const json = JSON.stringify({ format: 1, viz: 'constrained-decoding', seed: 1, settings, ops });
  return `/constrained-decoding/#ex=j${Buffer.from(json).toString('base64url')}`;
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('constrained-decoding'));
  await expect(
    page.getByRole('heading', { name: 'Constrained decoding with a DFA' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('the mask turns yeah into yes', async ({ page }) => {
  await op(page, 'Compile', 'yes|no');
  await op(page, 'Generate');
  await toEnd(page);
  await expect(narration(page)).toContainText('The text is "yes", and it matches yes|no');
  await expect(page.locator('.vars')).toContainText(/index lookups\s*71/);
  await page.goto(link([['compile', 'yes|no'], ['generate']], { mask: false }));
  await expect(narration(page)).toContainText('"yeah", which does not match');
});

test('the index shows where each token ends, and a bad regex is refused', async ({ page }) => {
  await op(page, 'Compile', '(ha)+');
  await op(page, 'Index');
  await toEnd(page);
  await expect(narration(page)).toContainText('The index is built');
  await expect(stage(page).locator('text', { hasText: 'index σ' })).toBeVisible();
  await op(page, 'Compile', '(ye');
  await expect(page.getByText('is never closed')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/constrained-decoding/#practice=13579&n=5');
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
  test(`no axe violations on the mask and the index (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Compile', 'yes|no');
    await op(page, 'Next token');
    await toEnd(page);
    await settled(page);
    const tags = ['wcag2a', 'wcag2aa', 'wcag21aa'];
    expect(axeFindings(await new AxeBuilder({ page }).withTags(tags).analyze())).toEqual([]);
    await op(page, 'Compile', 'yo+');
    await op(page, 'Index');
    await toEnd(page);
    await settled(page);
    expect(axeFindings(await new AxeBuilder({ page }).withTags(tags).analyze())).toEqual([]);
  });
}
