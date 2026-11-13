import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, opButton, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const START = '3.2 2.4 1.9 1.1 0.6 0.1 -0.8 -1.5';

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Logits, or u', { exact: true }).fill(value);
  await (await opButton(page, name)).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** A link that loads these operations with these settings. */
function link(ops: unknown[], settings: Record<string, unknown> = {}) {
  const json = JSON.stringify({ format: 1, viz: 'sampling', seed: 1, settings, ops });
  return `/sampling/#ex=j${Buffer.from(json).toString('base64url')}`;
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('sampling'));
  await expect(
    page.getByRole('heading', { name: 'Sampling: temperature, top-k, top-p' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('top-p keeps the nucleus and a given u picks a word', async ({ page }) => {
  await op(page, 'Load', START);
  await op(page, 'Softmax');
  await toEnd(page);
  await expect(narration(page)).toContainText('mat 0.50, rug 0.23, box 0.14');
  await op(page, 'Draw with u', '0.62');
  await toEnd(page);
  await expect(narration(page)).toContainText('so u lands in rug');
  await expect(page.locator('.vars')).toContainText(/kept\s*4/);
  await expect(
    page.locator('.stage > svg').locator('text', { hasText: 'u = 0.620' }),
  ).toBeVisible();
});

test('greedy draws the same word twenty times, and bad logits are refused', async ({ page }) => {
  await page.goto(link([['load', START], ['repeat']], { strategy: 'greedy' }));
  await expect(narration(page)).toContainText('the same word every time');
  await expect(narration(page)).toContainText('mat 20');
  await page.getByLabel('Logits, or u', { exact: true }).fill('1 cat');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('Logits are numbers')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/sampling/#practice=13579&n=5');
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
  test(`no axe violations on the cut and the draw (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Load', START);
    await op(page, 'Sample 20 times');
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
