import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, opButton, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const TWELVE = '1,1 3,8 8,2 5,5 9,9 2,4 7,6 4,1 6,9 0,7 9,4 3,3';

/** A link that loads these operations with this seed (levels are drawn from it) and settings. */
function link(ops: unknown[], settings: Record<string, unknown> = {}, seed = 16) {
  const json = JSON.stringify({ format: 1, viz: 'hnsw', seed, settings, ops });
  return `/hnsw/#ex=j${Buffer.from(json).toString('base64url')}`;
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'HNSW graph search' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

test('greedy search misses, and a longer list finds the true neighbours', async ({ page }) => {
  await open(
    page,
    link(
      [
        ['insert', TWELVE],
        ['search', '6,3'],
      ],
      { M: 2, ef: 1 },
    ),
  );
  await toEnd(page);
  await expect(narration(page)).toContainText('HNSW returns H, after 8 distance computations');
  await expect(narration(page)).toContainText('Recall 1/3');
  await open(
    page,
    link(
      [
        ['insert', TWELVE],
        ['search', '6,3'],
      ],
      { M: 2, ef: 3 },
    ),
  );
  await toEnd(page);
  await expect(narration(page)).toContainText('HNSW returns C, D, H');
  await expect(page.locator('.vars')).toContainText(/recall\s*1/);
});

test('insert and search from an empty graph, and a bad query is refused', async ({ page }) => {
  await open(page, emptyStart('hnsw'));
  const input = page.getByLabel('Points', { exact: true });
  await input.fill('2,3 7,8 5,1');
  await (await opButton(page, 'Insert')).click();
  await input.fill('6,6');
  await (await opButton(page, 'Search')).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('HNSW returns');
  await input.fill('2,3 4,4');
  await (await opButton(page, 'Search')).click();
  await expect(narration(page)).toContainText('Search takes one point');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await open(page, emptyStart('hnsw'));
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/hnsw/#practice=13579&n=5');
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
    await open(
      page,
      link(
        [
          ['insert', TWELVE],
          ['search', '1,6'],
        ],
        { M: 2, ef: 3 },
      ),
    );
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
