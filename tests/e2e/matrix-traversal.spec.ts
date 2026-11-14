import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function run(page: Page, button: string) {
  await page.getByRole('button', { name: button, exact: true }).click();
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
  await page.goto('/matrix-traversal/');
  await expect(
    page.getByRole('heading', { name: 'Matrix traversal (spiral, rotate)' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('four bounds list the spiral order, with the work beside it', async ({ page }) => {
  await run(page, 'Spiral order');
  await expect(narration(page)).toContainText('16 reads, no writes and 7 checks');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Visited 16 of 16: 1, 2, 3, 4, 8, 12, 16, 15, 14, 13, 9, 5, 6, 7, 11, 10/,
  );
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*47/);
});

test('walking with seen marks gives the same order with an extra grid', async ({ page }) => {
  await options(page, 'Extra grid: seen marks, or a rotated copy');
  await run(page, 'Spiral order');
  await expect(narration(page)).toContainText('16 reads, 16 writes and 15 checks');
  await expect(page.locator('.vars')).toContainText(/extra cells\s*=?\s*16/);
  await expect(page.locator('.code')).toContainText('spiralWalk');
});

test('a quarter turn ring by ring, by transposing, and into a copy agree', async ({ page }) => {
  await run(page, 'Rotate');
  await expect(narration(page)).toContainText('The first row is now 13 9 5 1');
  await options(page, 'Transpose, then reverse each row');
  await run(page, 'Rotate');
  await expect(narration(page)).toContainText('The first row is now 16 15 14 13');
  await expect(narration(page)).toContainText('28 reads, 28 writes');
  await options(page, 'Extra grid: seen marks, or a rotated copy');
  await run(page, 'Rotate');
  await expect(narration(page)).toContainText('B is the rotated matrix');
});

test('a matrix loads, and a rectangle is not rotated', async ({ page }) => {
  await page.getByLabel('Matrix', { exact: true }).fill('3x5');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await run(page, 'Spiral order');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /1, 2, 3, 4, 5, 10, 15, 14, 13, 12, 11, 6, 7, 8, 9\./,
  );
  await page.getByRole('button', { name: 'Rotate', exact: true }).click();
  await expect(narration(page)).toContainText('needs a square matrix');
  await page.getByLabel('Matrix', { exact: true }).fill('1 2 / 3');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('same number of values')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/matrix-traversal/#practice=13579&n=5');
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
  test(`no axe violations on a finished spiral walk (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'Extra grid: seen marks, or a rotated copy');
    await run(page, 'Spiral order');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on a rotation by rings (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await run(page, 'Spiral order');
    await run(page, 'Rotate');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
