import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings } from './helpers';

const trees = (page: Page) =>
  page.locator('section.family', { has: page.getByRole('heading', { name: 'Trees' }) });
const thumb = (page: Page, title: string) =>
  trees(page).getByRole('link', { name: title, exact: true }).locator('svg.thumb');
const drawing = (page: Page, title: string) => thumb(page, title).innerHTML();
/** Live pages in the Trees family (at least the 10 of wave 2; later waves add more). */
async function liveTrees(page: Page): Promise<number> {
  await expect.poll(() => trees(page).locator('li.live').count()).toBeGreaterThanOrEqual(10);
  return trees(page).locator('li.live').count();
}

test('every page has a thumbnail, hidden from screen readers', async ({ page }) => {
  await page.goto('/');
  await expect(trees(page).locator('svg.thumb')).toHaveCount(await liveTrees(page));
  await expect(page.locator('li.live svg.thumb')).toHaveCount(
    await page.locator('li.live').count(),
  );
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
  const frameFiles: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/previews/')) frameFiles.push(r.url());
  });
  await page.goto('/');
  await thumb(page, 'B-tree').waitFor();
  const rest = await drawing(page, 'B-tree');
  await trees(page).getByRole('link', { name: 'B-tree', exact: true }).focus();
  await page.waitForTimeout(1000);
  expect(await drawing(page, 'B-tree')).toBe(rest);
  // The frames are fetched only to play, so they are never fetched here.
  expect(frameFiles).toEqual([]);
});

test('the catalog with thumbnails has no axe violations', async ({ page }) => {
  await page.goto('/');
  await expect(trees(page).locator('svg.thumb')).toHaveCount(await liveTrees(page));
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});
