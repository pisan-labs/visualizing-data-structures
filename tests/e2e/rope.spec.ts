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
  if (value !== undefined) await page.getByLabel('Text or index', { exact: true }).fill(value);
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
  await page.goto('/rope/');
  await expect(page.getByRole('heading', { name: 'Rope', exact: true })).toBeVisible();
});

test('build, index by weights, and insert in the middle', async ({ page }) => {
  await fast(page);
  await op(page, 'Build', 'the quick brown fox');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /in 5 leaves/);
  await op(page, 'Index', '10');
  await toEnd(page);
  await expect(narration(page)).toContainText('Return "b"');
  await expect(vars(page)).toContainText(/nodes visited\s*3/);
  await op(page, 'Insert text', '4 big-');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /holding "the big-quick brown fox"/);
});

test('split makes a second rope and join puts it back', async ({ page }) => {
  await load(page, 'Split one rope into two');
  await fast(page);
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  await next.click();
  await next.click();
  await expect(stage(page)).toHaveAttribute('aria-label', /R2 holds "and concat"/);
  await next.click();
  await expect(stage(page)).toHaveAttribute('aria-label', /holding "split and concat"/);
});

test('a practice set grades an answer and shows it on the rope', async ({ page }) => {
  await page.goto('/rope/#practice=27182&n=4');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /A rope holding/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Index by following the weights' }).first().click();
  await expect(page.getByText('Loaded "Index by following the weights"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-split and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await load(page, 'Delete a range with two splits');
    await fast(page);
    await toEnd(page);
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
