import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Key', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function stepUntil(page: Page, text: string) {
  const back = page.getByRole('button', { name: 'Step back' });
  for (let i = 0; i < 60; i++) {
    if (((await narration(page).textContent()) ?? '').includes(text)) return;
    await back.click();
  }
  throw new Error(`no step says "${text}"`);
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
  await page.goto('/min-max-heap/');
  await expect(page.getByRole('heading', { name: 'Min-max heap' })).toBeVisible();
});

test('the min is the root and the max is a child of it', async ({ page }) => {
  await fast(page);
  await op(page, 'Build heap', '40 12 77 5 93 28 61 3 50');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /min-max heap with 9 keys.*root is 3\./);
  await expect(stage(page).locator('text', { hasText: /^max$/ })).toHaveCount(2);
  await op(page, 'Extract max');
  await toEnd(page);
  await expect(narration(page)).toContainText('Return 93');
  await op(page, 'Extract min');
  await toEnd(page);
  await expect(narration(page)).toContainText('Return 3');
});

test('a grandchild swap is followed by a fix with the parent', async ({ page }) => {
  await load(page, 'Trickle down with a fix on the way');
  await fast(page);
  await toEnd(page);
  await stepUntil(page, 'swap those two as well');
  await expect(page.locator('.code li.active')).toContainText(['swap them']);
});

test('a practice set grades an answer and shows it on the heap', async ({ page }) => {
  await page.goto('/min-max-heap/#practice=27182&n=4');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /min-max heap/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'A new minimum climbs by grandparents' }).first().click();
  await expect(page.getByText('Loaded "A new minimum climbs by grandparents"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-trickle and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await load(page, 'Take from both ends');
    await fast(page);
    const next = page.getByRole('button', { name: 'Forward to the next operation' });
    await next.click();
    await next.click();
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
