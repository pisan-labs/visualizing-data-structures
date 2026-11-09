import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function run(page: Page, button: string, input?: string) {
  if (input !== undefined) await page.locator('#op-input').fill(input);
  await page.getByRole('button', { name: button, exact: true }).click();
  await toEnd(page);
}

/** The smallest text drawn on the stage, in CSS pixels. */
const smallest = (page: Page) =>
  page.evaluate(() => {
    const svg = document.querySelector('.stage > svg') as SVGSVGElement;
    const scale = svg.getScreenCTM()!.a;
    const sizes = [...svg.querySelectorAll('text')]
      .filter((t) => (t.textContent ?? '').trim())
      .map((t) => Number(t.getAttribute('font-size')) * scale);
    return Math.min(...sizes);
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/two-pointers/');
  await expect(page.getByRole('heading', { name: 'Two pointers', exact: true })).toBeVisible();
});

test('pair sum walks in from both ends and finds the pair', async ({ page }) => {
  await fast(page);
  await run(page, 'Pair sum', '47');
  await expect(narration(page)).toContainText('Found the pair after checking 7 pairs');
  await expect(stage(page)).toHaveAttribute('aria-label', /Answer: the pair \(3, 6\)\./);
  await expect(page.locator('.vars')).toContainText('brute force');
  // The pairs grid: 7 checked pairs carry a dot.
  await expect(stage(page).locator('circle')).toHaveCount(7);
  await settled(page);
  await expect.poll(() => smallest(page)).toBeGreaterThanOrEqual(9);
});

test('unsorted values are refused until A is sorted', async ({ page }) => {
  await fast(page);
  await run(page, 'Load', '31 4 18 8 25 12 3');
  await run(page, 'Pair sum', '39');
  await expect(narration(page)).toContainText('press Sort A first');
  await page.getByText('More operations').click();
  await run(page, 'Sort A');
  await run(page, 'Pair sum', '39');
  await expect(narration(page)).toContainText('Found the pair');
});

test('remove duplicates keeps each value once', async ({ page }) => {
  await fast(page);
  await run(page, 'Load', '1 1 2 3 3 3 5 8 8 9');
  await run(page, 'Remove duplicates');
  await expect(narration(page)).toContainText('Return k = slow + 1 = 6');
  await expect(stage(page)).toHaveAttribute('aria-label', /1, 2, 3, 5, 8, 9\./);
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question has a Show me that plays the answer', async ({ page }) => {
  await page.goto('/two-pointers/#practice=31415&n=4');
  const first = page.locator('.question').first();
  await expect(first).toBeVisible();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-search (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await run(page, 'Load', '1 8 6 2 5 4 8 3 7');
    await page.getByText('More operations').click();
    await run(page, 'Most water');
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
