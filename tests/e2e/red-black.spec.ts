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
  const box = page.getByLabel(label);
  if (!(await box.isVisible())) await page.getByText('Options', { exact: true }).click();
  await box.check();
}

/** Relative luminance of a node's fill, from its computed style. */
async function luminance(page: Page, cls: string): Promise<number> {
  return page.evaluate((cls) => {
    const el = document.querySelector(`.stage circle.${cls}`)!;
    const [r, g, b] = getComputedStyle(el)
      .fill.match(/\d+(\.\d+)?/g)!
      .slice(0, 3)
      .map((v) => Number(v) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  }, cls);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/red-black/');
  await expect(page.getByRole('heading', { name: 'Red-black tree', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('insert case 1 recolors, and the root ends up black', async ({ page }) => {
  await op(page, 'Insert', '50 30 70 20');
  await toEnd(page);
  await expect(narration(page)).toContainText('The root 50 is red, so color it black.');
  await expect(stage(page)).toHaveAttribute('aria-label', /The root is 50, black\./);
  await expect(stage(page)).toHaveAttribute('aria-label', /20 \(red\) is a leaf/);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Case 1: 30 and 70 turn black and 50 turns red.');
  await expect(stage(page).locator('text', { hasText: 'Insert case 1' })).toBeVisible();
  await expect(page.locator('.vars')).toContainText(/black-height\s*2/);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`black and red nodes differ in lightness, not only in hue (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Insert', '50 30');
    await toEnd(page);
    // The drawing tweens to the last step on the next animation frames: wait for both nodes.
    await expect(stage(page).locator('circle.rb-black')).toHaveCount(1);
    await expect(stage(page).locator('circle.rb-red')).toHaveCount(1);
    // A contrast ratio of at least 3:1 between the two fills (polled: fills fade in too).
    await expect
      .poll(async () => {
        const black = await luminance(page, 'rb-black');
        const red = await luminance(page, 'rb-red');
        return (Math.max(black, red) + 0.05) / (Math.min(black, red) + 0.05);
      })
      .toBeGreaterThan(3);
  });
}

test('NIL leaves can be drawn, and a delete shows the extra black', async ({ page }) => {
  await option(page, 'Draw the NIL leaves');
  await op(page, 'Insert', '80 20 60 10');
  await toEnd(page);
  await expect(stage(page).locator('rect.rb-nil')).toHaveCount(5);
  await op(page, 'Delete', '80');
  await toEnd(page);
  await expect(narration(page)).toContainText('The root 20 is black');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Case 4: 20 takes 60');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('case 4.');
  await expect(stage(page).locator('rect.rb-extra')).toHaveCount(1);
});

test('the concept page plays the delete cases', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Three rotations, the most a delete needs' }).click();
  await expect(page.getByText('Loaded "Three rotations, the most a delete needs"')).toBeVisible();
  await toEnd(page);
  await expect(narration(page)).toContainText('This delete made 3 rotations.');
});

test('a practice set loads and plays an answer', async ({ page }) => {
  await page.goto('/red-black/#practice=2468&n=3');
  await expect(page.locator('.question')).toHaveCount(3);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Not quite. The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-fixup and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await option(page, 'Draw the NIL leaves');
    await op(page, 'Insert', '90 30 80 20 50 70');
    await toEnd(page);
    await op(page, 'Delete', '90');
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
