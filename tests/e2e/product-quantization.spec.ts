import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, opButton, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const VECTORS = '1,9,1,8 2,9,9,9 9,9,1,1 9,8,9,2 1,1,1,9 1,2,9,1 9,1,8,9 8,1,2,1';

/** A link that loads these operations with this seed (k-means++ draws from it) and settings. */
function link(ops: unknown[], settings: Record<string, unknown> = {}, seed = 1) {
  const json = JSON.stringify({ format: 1, viz: 'product-quantization', seed, settings, ops });
  return `/product-quantization/#ex=j${Buffer.from(json).toString('base64url')}`;
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Product quantization' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

const all = (q: string) => [['load', VECTORS], ['train'], ['encode'], ['search', q]];

test('codes of 4 bits, and distances from the table', async ({ page }) => {
  await open(page, link(all('2,8,2,7'), { pieces: '2', size: '4' }));
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'By the table, the nearest are A 4.5, E 46.5, B 47.5',
  );
  await expect(page.locator('.vars')).toContainText(/bits per vector\s*4/);
  await page.getByRole('button', { name: 'Back to the previous operation' }).click();
  await expect(narration(page)).toContainText('4 bits a vector');
});

test('the table can swap the two nearest', async ({ page }) => {
  await open(page, link(all('2,5,2,7'), { pieces: '2', size: '4' }));
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'the nearest are E 16.5, A 19.5; exactly, A 19, E 22',
  );
});

test('load, train, encode and search from an empty start; bad input is refused', async ({
  page,
}) => {
  await open(page, emptyStart('product-quantization'));
  const input = page.getByLabel('Vectors', { exact: true });
  await input.fill('1,2,3');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('four numbers with commas')).toBeVisible();
  await input.fill(VECTORS);
  await (await opButton(page, 'Load')).click();
  await (await opButton(page, 'Search')).click();
  await expect(narration(page)).toContainText('Train the codebooks and encode the vectors first');
  await (await opButton(page, 'Train')).click();
  await (await opButton(page, 'Encode')).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('Every vector is now 2 codes of 2 bits');
  await input.fill('9,8,9,2');
  await (await opButton(page, 'Search')).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('By the table, the nearest are D');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await open(page, emptyStart('product-quantization'));
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/product-quantization/#practice=13579&n=5');
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
  test(`no axe violations on a finished search (${theme})`, async ({ page }) => {
    await open(page, link(all('2,8,2,7'), { pieces: '2', size: '4' }));
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
