import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const vars = (page: Page) => page.locator('.vars');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

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
  await page.goto('/avl/');
  await expect(page.getByRole('heading', { name: 'AVL tree', exact: true })).toBeVisible();
  await fast(page);
});

test('sorted keys stay balanced, and the rotation case is named', async ({ page }) => {
  await op(page, 'Insert', '10 20 30');
  await toEnd(page);
  await expect(narration(page)).toContainText('This insert made 1 rotation.');
  await expect(stage(page)).toHaveAttribute('aria-label', /3 keys and height 1\. The root is 20\./);
  await expect(vars(page)).toContainText(/rotations\s*1/);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Rotate left at 10: 20 moves up');
  await expect(stage(page).locator('text', { hasText: 'RR case' })).toBeVisible();
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('That is the RR case');
  await expect(page.locator('.code li.active').last()).toContainText('rotateRight(r)');
});

test('heights and balance factors follow the options', async ({ page }) => {
  await op(page, 'Insert', '50 30 70 20');
  await toEnd(page);
  await expect(stage(page).locator('text', { hasText: /^h2$/ })).toBeVisible();
  await expect(stage(page).locator('text', { hasText: /^\+1$/ }).first()).toBeVisible();
  await option(page, 'Right height − left height (+2 means too tall on the right)');
  await expect(stage(page).locator('text', { hasText: /^−1$/ }).first()).toBeVisible();
  await expect(page.locator('.code')).toContainText('bf(x) = h(x.right) − h(x.left)');
  await option(page, '1: count nodes; an empty tree has height 0');
  await expect(stage(page).locator('text', { hasText: /^h3$/ })).toBeVisible();
  await expect(vars(page)).toContainText(/height\s*3/);
  await option(page, 'Height only');
  await expect(stage(page).locator('text', { hasText: /^−1$/ })).toHaveCount(0);
  await expect(stage(page).locator('text', { hasText: /^h1$/ }).first()).toBeVisible();
});

test('a delete can rotate at two levels', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'A delete that rotates twice' }).click();
  await expect(page.getByText('Loaded "A delete that rotates twice"')).toBeVisible();
  await toEnd(page);
  await expect(narration(page)).toContainText('This delete made 2 rotations.');
  await expect(stage(page)).toHaveAttribute('aria-label', /The root is 50\./);
});

test('a double rotation shows both halves', async ({ page }) => {
  await op(page, 'Insert', '50 30 70 20 40 45');
  await toEnd(page);
  await expect(narration(page)).toContainText('This insert made 2 rotations.');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Then rotate right at 50');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('First rotate left at 30');
  await expect(stage(page).locator('text', { hasText: 'LR case' })).toBeVisible();
});

test('bad keys are refused with a reason', async ({ page }) => {
  await op(page, 'Insert', 'cat');
  await expect(page.getByRole('alert')).toContainText('Keys are whole numbers');
});

test('a practice set asks about rotations and plays the answer', async ({ page }) => {
  await page.goto('/avl/#practice=4321&n=5');
  await expect(page.getByText('Set 4321')).toBeVisible();
  const questions = page.locator('.question');
  await expect(questions).toHaveCount(5);
  const first = questions.first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  await first.getByRole('button', { name: 'Show me' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-rotation and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Insert', '50 30 70 20 40 45');
    await toEnd(page);
    await page.getByRole('button', { name: 'Step back' }).click();
    await expect(narration(page)).toContainText('Then rotate right at 50');
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
