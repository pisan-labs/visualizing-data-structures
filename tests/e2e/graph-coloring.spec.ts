import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function loadExample(page: Page, title: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Load' })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/graph-coloring/');
  await expect(page.getByRole('heading', { name: 'Graph coloring', exact: true })).toBeVisible();
});

test('Color gives each vertex the smallest free color', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Color', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('Done: 3 colors for 8 vertices');
  await expect(page.locator('.vars')).toContainText(/colors\s*3/);
  await expect(stage(page)).toHaveAttribute('aria-label', /Colors so far: A 1, B 2, C 2/);
});

test('the order setting changes the count on the same graph', async ({ page }) => {
  await fast(page);
  await loadExample(page, 'A bad order');
  await toEnd(page);
  await expect(narration(page)).toContainText('Done: 4 colors');
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('DSatur: most neighbour colors first').check();
  await page.getByText('Options', { exact: true }).click();
  await expect(page.locator('.code')).toContainText('max saturation');
  await page.getByRole('button', { name: 'Color', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('Done: 2 colors');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded', async ({ page }) => {
  await page.goto('/graph-coloring/#practice=2468&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\./)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
});

test('the drawing stays readable and in the page', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Color', exact: true }).click();
  await toEnd(page);
  await settled(page);
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height).filter((h) => h > 0));
  await expect.poll(async () => (await heights()).length).toBeGreaterThan(20);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(7);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await page.getByRole('combobox', { name: 'Detail' }).selectOption({ label: 'Every detail' });
    await fast(page);
    await loadExample(page, 'DSatur finds the 2 colors');
    await toEnd(page);
    for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
