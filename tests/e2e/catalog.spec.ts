import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const trees = (page: Page) =>
  page.locator('section.family', { has: page.getByRole('heading', { name: 'Trees' }) });
const thumb = (page: Page, title: string) =>
  trees(page).getByRole('link', { name: title, exact: true }).locator('svg.thumb');
const drawing = (page: Page, title: string) => thumb(page, title).innerHTML();

test('every tree page has a thumbnail, hidden from screen readers', async ({ page }) => {
  await page.goto('/');
  await expect(trees(page).locator('svg.thumb')).toHaveCount(10);
  await expect(thumb(page, 'Red-black tree')).toHaveAttribute('aria-hidden', 'true');
  // The thumbnail is drawn shapes only: no text.
  await expect(thumb(page, 'Binary search tree').locator('circle').first()).toBeVisible();
  await expect(thumb(page, 'Binary search tree').locator('text')).toHaveCount(0);
});

test('a thumbnail plays while hovered and rests on its final frame', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Phones have no hover');
  await page.goto('/');
  await thumb(page, 'AVL tree').waitFor();
  const rest = await drawing(page, 'AVL tree');
  await trees(page).getByRole('link', { name: 'AVL tree', exact: true }).hover();
  await expect.poll(() => drawing(page, 'AVL tree')).not.toBe(rest);
  await page.mouse.move(0, 0);
  await expect.poll(() => drawing(page, 'AVL tree')).toBe(rest);
});

test('keyboard focus plays a thumbnail too', async ({ page }) => {
  await page.goto('/');
  await thumb(page, 'Treap').waitFor();
  const rest = await drawing(page, 'Treap');
  await trees(page).getByRole('link', { name: 'Treap', exact: true }).focus();
  await expect.poll(() => drawing(page, 'Treap')).not.toBe(rest);
});

test('thumbnails stay still when the reader asks for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await thumb(page, 'B-tree').waitFor();
  const rest = await drawing(page, 'B-tree');
  await trees(page).getByRole('link', { name: 'B-tree', exact: true }).focus();
  await page.waitForTimeout(1000);
  expect(await drawing(page, 'B-tree')).toBe(rest);
});

test('the catalog with thumbnails has no axe violations', async ({ page }) => {
  await page.goto('/');
  await expect(trees(page).locator('svg.thumb')).toHaveCount(10);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});
