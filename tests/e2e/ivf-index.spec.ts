import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, opButton, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const GROUPS = '2,1 2,3 3,2 1,4 8,4 8,3 7,2 8,1 4,8 3,9 5,9 6,7';

/** A link that loads these operations with this seed (k-means++ draws from it) and settings. */
function link(ops: unknown[], settings: Record<string, unknown> = {}, seed = 3) {
  const json = JSON.stringify({ format: 1, viz: 'ivf-index', seed, settings, ops });
  return `/ivf-index/#ex=j${Buffer.from(json).toString('base64url')}`;
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'IVF index' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

const across = [['load', GROUPS], ['train'], ['search', '6,5']];

test('one probe misses the neighbour across the border, two find it', async ({ page }) => {
  await open(page, link(across, { lists: 3, nprobe: 1 }));
  await toEnd(page);
  await expect(narration(page)).toContainText('IVF returns E, F, G, after 7 distance computations');
  await expect(narration(page)).toContainText('It missed L (d² 4)');
  await expect(page.locator('.vars')).toContainText(/exact\s*false/);
  await open(page, link(across, { lists: 3, nprobe: 2 }));
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'IVF returns L, E, F, after 11 distance computations',
  );
  await expect(page.locator('.vars')).toContainText(/recall\s*1/);
});

test('load, train and search from an empty start, and a bad query is refused', async ({ page }) => {
  await open(page, emptyStart('ivf-index'));
  const input = page.getByLabel('Points', { exact: true });
  await input.fill('6,5');
  await (await opButton(page, 'Search')).click();
  await expect(narration(page)).toContainText('Load some points first');
  await input.fill(GROUPS);
  await (await opButton(page, 'Load')).click();
  await (await opButton(page, 'Train')).click();
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Every point goes into the list of its nearest centre',
  );
  await input.fill('7,3');
  await (await opButton(page, 'Search')).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('The answer is exact');
  await input.fill('2,3 4,4');
  await (await opButton(page, 'Search')).click();
  await expect(narration(page)).toContainText('Search takes one point');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await open(page, emptyStart('ivf-index'));
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/ivf-index/#practice=13579&n=5');
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
    await open(page, link(across, { lists: 3, nprobe: 1 }));
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
