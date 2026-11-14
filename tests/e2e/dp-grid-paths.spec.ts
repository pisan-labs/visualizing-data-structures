import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Grid', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
  await toEnd(page);
}

/** Open Options, pick settings by their radio labels, and close it again. */
async function options(page: Page, ...labels: string[]) {
  const summary = page.locator('summary', { hasText: 'Options' });
  await summary.click();
  for (const l of labels) await page.getByRole('radio', { name: l }).check();
  await summary.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dp-grid-paths/');
  await expect(page.getByRole('heading', { name: 'DP: paths on a grid' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('the table counts the paths, with the work beside it', async ({ page }) => {
  await op(page, 'Solve');
  await expect(narration(page)).toContainText('8 paths reach the target (3, 4)');
  await expect(page.locator('.vars')).toContainText(/cells\s*=?\s*20/);
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*40/);
  await expect(stage(page)).toHaveAttribute('aria-label', /row 3: open, P 1; open, P 2/);
});

test('plain recursion asks for the start once per path', async ({ page }) => {
  await options(page, 'Plain recursion, exponential');
  await op(page, 'Load grid', '...../...../...../.....');
  await op(page, 'Solve');
  await expect(narration(page)).toContainText('125 calls for 20 cells');
  await expect(narration(page)).toContainText('(0, 0) alone was called 35 times');
  await expect(page.locator('.code')).toContainText('paths(r − 1, c) + paths(r, c − 1)');
});

test('the cheapest path is traced back from the target', async ({ page }) => {
  await options(page, 'The cheapest path (each cell has a cost)');
  await op(page, 'Solve');
  await op(page, 'Trace the path');
  await expect(narration(page)).toContainText('D D R D R R R');
  await expect(page.locator('.vars')).toContainText(/cost\s*=?\s*10/);
});

test('a memo fills each cell once, and a bad grid is refused', async ({ page }) => {
  await options(page, 'Top-down: recursion with a memo');
  await op(page, 'Load grid', '...../...../...../.....');
  await op(page, 'Solve');
  await expect(narration(page)).toContainText('32 calls and 20 cells');
  await page.getByLabel('Grid', { exact: true }).fill('11/1');
  await page.getByRole('button', { name: 'Load grid', exact: true }).click();
  await expect(page.getByText('same number of cells')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/dp-grid-paths/#practice=13579&n=5');
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
  const show = first.getByRole('button', { name: 'Show me' });
  if (await show.count()) await showMe(page, show);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations on a traced cheapest path (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'The cheapest path (each cell has a cost)');
    await op(page, 'Solve');
    await op(page, 'Trace the path');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on plain recursion (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'Plain recursion, exponential');
    await op(page, 'Solve');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
