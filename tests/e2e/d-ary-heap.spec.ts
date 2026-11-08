import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const vars = (page: Page) => page.locator('.vars');

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
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function load(page: Page, title: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ has: page.getByText(title, { exact: true }) })
    .getByRole('button', { name: 'Load' })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/d-ary-heap/');
  await expect(page.getByRole('heading', { name: 'd-ary heap' })).toBeVisible();
});

test('insert climbs with one comparison a level, extract pays d', async ({ page }) => {
  await fast(page);
  await op(page, 'Build heap', '50 40 30 20 10');
  await toEnd(page);
  await op(page, 'Insert', '99');
  await toEnd(page);
  await expect(narration(page)).toContainText('99 is in');
  await expect(vars(page)).toContainText(/comparisons\s*2/);
  await op(page, 'Extract');
  await toEnd(page);
  await expect(narration(page)).toContainText('Return 99');
  await expect(stage(page)).toHaveAttribute('aria-label', /3-ary max-heap with 5 keys/);
});

test('decrease-key in a 4-ary min-heap climbs to the root', async ({ page }) => {
  await load(page, 'Decrease-key climbs a short path');
  await fast(page);
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  await next.click();
  await next.click();
  await expect(narration(page)).toContainText('A[13] is now 3');
  await expect(stage(page)).toHaveAttribute('aria-label', /The root is 3\./);
});

test('a practice set grades an answer and shows it on the heap', async ({ page }) => {
  await page.goto('/d-ary-heap/#practice=27182&n=4');
  await expect(page.locator('.question')).toHaveCount(4);
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
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /-ary m(ax|in)-heap/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Inserts climb only a few levels' }).first().click();
  await expect(page.getByText('Loaded "Inserts climb only a few levels"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText(/./);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-sift and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await load(page, 'Extract pays d comparisons a level');
    await fast(page);
    await page.getByRole('button', { name: 'Forward to the next operation' }).click();
    await page.getByRole('button', { name: 'Forward to the next operation' }).click();
    await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
