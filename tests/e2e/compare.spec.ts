import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled } from './helpers';

const sides = (page: Page) => page.locator('.sides > .side');
const stageOf = (page: Page, i: number) => sides(page).nth(i).locator('.stage > svg');
const narrationOf = (page: Page, i: number) => sides(page).nth(i).locator('.narration p');

/** The address follows the work 400 ms after each change; wait until it stops changing. */
async function addressSettled(page: Page) {
  let last = '';
  for (let i = 0; i < 20 && page.url() !== last; i++) {
    last = page.url();
    await page.waitForTimeout(500);
  }
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test('the Compare menu opens a comparison that starts from the current work', async ({ page }) => {
  await page.goto('/stack-array/');
  await page.getByLabel('Value', { exact: true }).fill('4 5');
  await page.getByRole('button', { name: 'Push', exact: true }).click();
  await toEnd(page);
  await page.getByText('Compare', { exact: true }).click();
  // A queue cannot push, so it is not offered.
  await expect(page.locator('.compare-menu li')).toHaveText([
    'Stack (array) with other options',
    'Stack (linked list)',
  ]);
  await page.getByRole('link', { name: 'Stack (linked list)' }).click();
  await expect(
    page.getByRole('heading', { name: 'Stack (array) vs Stack (linked list)' }),
  ).toBeVisible();
  // Both sides hold the two pushes.
  await expect(stageOf(page, 0)).toHaveAttribute('aria-label', /4, 5/);
  await expect(stageOf(page, 1)).toHaveAttribute('aria-label', /5/);
  await expect(page.locator('.sides .narration .chip').first()).toHaveText('push(5)');
});

test('both sides run the same operations and wait for each other', async ({ page }) => {
  await page.goto('/stack-array/#compare=stack-list');
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
  await page.getByLabel('Value', { exact: true }).fill('1 2 3');
  await page.getByRole('button', { name: 'Push', exact: true }).click();
  await page.getByRole('button', { name: 'Pop', exact: true }).click();
  await toEnd(page);
  for (const i of [0, 1]) {
    await expect(sides(page).nth(i).locator('.narration .chip')).toHaveText('pop()');
  }
  // Stepping back by operation moves both sides to the end of the same operation.
  await page.getByRole('button', { name: 'Back to the previous operation' }).click();
  for (const i of [0, 1]) {
    await expect(sides(page).nth(i).locator('.narration .chip')).toHaveText('push(3)');
    await expect(narrationOf(page, i)).not.toBeEmpty();
  }
});

test('each side keeps its own options, and a reload keeps both', async ({ page }) => {
  await page.goto('/bst/#compare=bst');
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
  const right = sides(page).nth(1);
  await right.getByText('Options').click();
  await right.getByLabel('Replace it with its predecessor').check();
  await page.getByLabel('Key', { exact: true }).fill('50 30 70 20 40 60 80');
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
  await toEnd(page);
  await page.getByLabel('Key', { exact: true }).fill('50');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await toEnd(page);
  await expect(stageOf(page, 0)).toHaveAttribute('aria-label', /The root is 60\./);
  await expect(stageOf(page, 1)).toHaveAttribute('aria-label', /The root is 40\./);
  // The address keeps both sides.
  await addressSettled(page);
  await expect(page).toHaveURL(/#compare=bst&ex=.+&exb=/);
  await page.reload();
  await expect(stageOf(page, 0)).toHaveAttribute('aria-label', /The root is 60\./);
  await expect(stageOf(page, 1)).toHaveAttribute('aria-label', /The root is 40\./);
});

test('a comparison fits the screen and has no axe violations', async ({ page }) => {
  await page.goto('/stack-array/#compare=stack-list');
  await page.getByLabel('Value', { exact: true }).fill('1 2');
  await page.getByRole('button', { name: 'Push', exact: true }).click();
  await toEnd(page);
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  expect(await overflow()).toBeLessThanOrEqual(0);
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  await page.addStyleTag({
    content: ":root { --font: 'DejaVu Sans', Verdana, sans-serif !important; }",
  });
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test('a page that does not exist is explained', async ({ page }) => {
  await page.goto('/stack-array/#compare=nothing-here');
  await expect(page.getByText('There is no visualization called "nothing-here"')).toBeVisible();
});
