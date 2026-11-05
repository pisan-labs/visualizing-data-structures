import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Key', { exact: true }).fill(value);
  const button = page.getByRole('button', { name, exact: true });
  // Less common operations sit under "More operations".
  if (!(await button.isVisible())) await page.getByText('More operations').click();
  await button.click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function option(page: Page, label: string) {
  const choice = page.getByLabel(label);
  if (!(await choice.isVisible())) await page.getByText('Options', { exact: true }).click();
  await choice.check();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/treap/');
  await expect(page.getByRole('heading', { name: 'Treap', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('a new key rotates up past every larger priority', async ({ page }) => {
  await op(page, 'Insert', '50:40 30:60 70:50 20:70');
  await toEnd(page);
  await op(page, 'Insert', '40:10');
  await toEnd(page);
  await expect(narration(page)).toContainText('40 is the root now');
  await expect(narration(page)).toContainText('This insert made 2 rotations.');
  await expect(stage(page)).toHaveAttribute('aria-label', /The root is 40\./);
  await page.getByRole('button', { name: 'Step back' }).click();
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('the heap order is broken. Rotate right at 50');
  await expect(stage(page).locator('line.role-error')).toHaveCount(1);
});

test('random priorities are drawn per key and shown next to each node', async ({ page }) => {
  await op(page, 'Insert', '10 20 30 40');
  await toEnd(page);
  await expect(stage(page).locator('text', { hasText: /^p\d+$/ })).toHaveCount(4);
  await expect(narration(page)).toContainText('N = 4');
});

test('typed priorities refuse a bare key with a reason', async ({ page }) => {
  await option(page, 'Typed by hand: every insert needs one, as in 50:7');
  await op(page, 'Insert', '50');
  await toEnd(page);
  await expect(narration(page)).toContainText('Priorities are typed by hand here');
  await op(page, 'Insert', '50:7 30:3');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /The root is 30\./);
  await op(page, 'Insert', '60:500');
  await expect(page.getByRole('alert')).toContainText('between 0 and 99');
});

test('the max-heap option puts the largest priority on top', async ({ page }) => {
  await option(page, 'Larger priorities sit higher');
  await op(page, 'Insert', '50:40 30:60 70:50 20:70');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /The root is 20\./);
  await expect(page.locator('.code')).toContainText('p > z.p.p');
});

test('a practice set loads and plays an answer', async ({ page }) => {
  await page.goto('/treap/#practice=1357&n=3');
  await expect(page.locator('.question')).toHaveCount(3);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Not quite. The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-rotation and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Insert', '50:40 30:60 70:50 20:70 40:10');
    await toEnd(page);
    await page.getByRole('button', { name: 'Step back' }).click();
    await page.getByRole('button', { name: 'Step back' }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
