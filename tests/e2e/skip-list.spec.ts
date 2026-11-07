import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Key', { exact: true }).fill(value);
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible())) await page.getByText('More operations').click();
  await button.click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function example(page: Page, title: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .locator('.curated li', { hasText: title })
    .getByRole('button', { name: 'Load' })
    .click();
}

/** The smallest key label on the stage, in CSS pixels. Poll it: the last step may still be animating. */
async function smallestKey(page: Page): Promise<number> {
  const heights = await stage(page)
    .locator('text.shape')
    .evaluateAll((els) =>
      els
        .filter((e) => /^-?\d+$/.test(e.textContent ?? '') && Number(e.textContent) >= 10)
        .map((e) => e.getBoundingClientRect().height),
    );
  return Math.min(...heights);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/skip-list/');
  await expect(page.getByRole('heading', { name: 'Skip list', exact: true })).toBeVisible();
});

test('each insert shows its coin flips', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '50');
  await page
    .getByRole('button', { name: 'Pause' })
    .click({ timeout: 2000 })
    .catch(() => {});
  await toEnd(page);
  await page.getByRole('button', { name: 'Back to the previous operation' }).click();
  for (let i = 0; i < 6; i++) {
    if ((await narration(page).textContent())?.includes('Flip 1:')) break;
    await page.getByRole('button', { name: 'Step forward' }).click();
  }
  await expect(narration(page)).toContainText(/Flip 1: (heads|tails)/);
  await expect(
    stage(page)
      .locator('text', { hasText: /^[HT]$/ })
      .first(),
  ).toBeVisible();
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /A skip list with 1 key/);
});

test('search runs right while smaller, then down', async ({ page }) => {
  await fast(page);
  await example(page, 'Search: right while smaller, else down');
  await toEnd(page);
  await expect(narration(page)).toContainText('65 is not in the list');
  await page.getByRole('button', { name: 'Back to the previous operation' }).click();
  await page.getByRole('button', { name: 'Step forward' }).click();
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(narration(page)).toContainText(/so (move right to|go down to level)/);
  await expect(page.locator('.vars')).toContainText(/comparisons\s*\d/);
});

test('deleting the tallest node lowers the list', async ({ page }) => {
  await fast(page);
  await example(page, 'Deleting the tallest node lowers the list');
  await toEnd(page);
  await expect(narration(page)).toContainText('the list drops to 2 levels');
  await expect(page.locator('.vars')).toContainText(/levels\s*2/);
});

test('drawing the list down keeps a long list readable', async ({ page, isMobile }) => {
  await fast(page);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Down: keys top to bottom (fits a phone)').check();
  await page.getByText('Options', { exact: true }).click();
  await op(page, 'Insert', '15 82 47 3 66 29 91 54 8 73 38 60 21 95 12 44 77 33 58 86');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /20 keys/);
  // The drawing itself is taller than wide (the stage letterboxes it). Poll: the frame tweens
  // to the final size after the last step.
  await expect
    .poll(async () => {
      const [, , w, h] = ((await stage(page).getAttribute('viewBox')) ?? '').split(' ');
      return Number(h) > Number(w);
    })
    .toBe(true);
  // The down layout is for phones. On a 1366x768 laptop the stage is about 305 px tall, so 20
  // stacked keys sit right at 9 px and the result depends on the font (CI's DejaVu Sans measured
  // 8.99994); laptops use the layout across instead.
  if (isMobile) await expect.poll(() => smallestKey(page)).toBeGreaterThanOrEqual(9);
});

test('fourteen keys across stay readable', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '15 82 47 3 66 29 91 54 8 73 38 60 21 95');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /14 keys/);
  await expect.poll(() => smallestKey(page)).toBeGreaterThanOrEqual(9);
});

test('a practice set grades an answer and shows it on the list', async ({ page }) => {
  await page.goto('/skip-list/#practice=97531&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const verdict = (await feedback.locator('strong').textContent()) ?? '';
  const answer = verdict.match(/The answer is (.+)\.$/)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer === '(nothing)' ? '' : answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /A skip list with \d+ keys/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Unlucky flips: a skip list that is just a list' }).click();
  await expect(
    page.getByText('Loaded "Unlucky flips: a skip list that is just a list"'),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText(/search\(|Level|levels/);
});

test('no axe violations while flipping, in the dark theme', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
  await fast(page);
  await op(page, 'Insert', '30 10 70 50');
  await page.getByRole('button', { name: 'Step back' }).click();
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
