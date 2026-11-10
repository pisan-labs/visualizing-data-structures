import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings } from './helpers';

const recent = (page: Page) => page.getByRole('region', { name: 'Pick up where you left off' });
const timeline = (page: Page) => page.getByRole('slider', { name: 'Timeline' });
const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('stepwise:recent') ?? 'null'));

test('a first visit shows no recent pages', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Data structures and algorithms' })).toBeVisible();
  await expect(recent(page)).toHaveCount(0);
});

test('the home page reopens a page at the example and step the reader left', async ({ page }) => {
  await page.goto('/stack-array/');
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
  await page.getByLabel('Value').fill('4 8 15');
  await page.getByRole('button', { name: 'Push', exact: true }).click();
  await expect(timeline(page)).toHaveAttribute('aria-valuetext', 'Step 10 of 10', {
    timeout: 10_000,
  });
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await page.getByRole('button', { name: 'Step back' }).click();
  await page.getByRole('button', { name: 'Step back' }).click();
  const step = 'Step 8 of 10';
  await expect(timeline(page)).toHaveAttribute('aria-valuetext', step);
  const narration = await page.locator('.narration p').textContent();

  await page.goto('/');
  const card = recent(page).getByRole('link', { name: /^Stack \(array\)/ });
  await expect(card).toContainText('just now, step 8 of 10');
  await expect(card.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d\d-\d\dT/);
  await expect(card.locator('svg.thumb')).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/stack-array\/#ex=/);
  await expect(timeline(page)).toHaveAttribute('aria-valuetext', step);
  await expect(page.locator('.narration p')).toHaveText(narration!);
  await expect(page.locator('.stage > svg')).toHaveAttribute(
    'aria-label',
    /From bottom to top: 4, 8/,
  );
});

test('hiding the tab records the page too', async ({ page }) => {
  await page.goto('/bst/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Binary search tree');
  expect(await stored(page)).toBeNull();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const list = await stored(page);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ id: 'bst', title: 'Binary search tree' });
  // The page opens on a full tree (its opening example), so the link carries it.
  expect(list[0].code).toMatch(/^[zj]/);
});

test('three pages at most, the latest first, and Clear removes them', async ({ page }) => {
  for (const id of ['bst', 'dfa', 'avl', 'stack-array']) {
    await page.goto(`/${id}/`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  await page.goto('/');
  const titles = recent(page).locator('.title');
  await expect(titles).toHaveText([
    'Stack (array)',
    'AVL tree',
    'Deterministic finite automaton (DFA)',
  ]);
  // Going back to a page moves it to the front. Wait for it to load: a page left before it has
  // loaded is not recorded, by design.
  await page.goto('/dfa/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto('/');
  await expect(titles.first()).toHaveText('Deterministic finite automaton (DFA)');
  await expect(titles).toHaveCount(3);

  await recent(page).getByRole('button', { name: 'Clear recent pages' }).click();
  await expect(recent(page)).toHaveCount(0);
  expect(await stored(page)).toEqual([]);
  await page.reload();
  await expect(recent(page)).toHaveCount(0);
});

test('embeds are not recorded', async ({ page }) => {
  await page.goto('/bst/#embed=1');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto('/');
  await expect(recent(page)).toHaveCount(0);
});

test('the Back button shows the page just left', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Treap', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Treap');
  await page.goBack();
  await expect(recent(page).locator('.title')).toHaveText(['Treap']);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`recent pages have no axe violations and fit (${theme})`, async ({ page }) => {
    await page.goto('/linked-list/');
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await expect(page.locator('.stage')).toBeVisible();
    await page.goto('/dijkstra/');
    // A page that never finished loading is not worth reopening; this one did.
    await expect(page.locator('.stage')).toBeVisible();
    await page.goto('/');
    await expect(recent(page).locator('li')).toHaveCount(2);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.addStyleTag({
      content: ":root { --font: 'DejaVu Sans', Verdana, sans-serif !important; }",
    });
    expect(await overflow()).toBeLessThanOrEqual(0);
    // Keyboard: the cards are links in reading order, after the Clear button.
    await recent(page).getByRole('button', { name: 'Clear recent pages' }).focus();
    await page.keyboard.press('Tab');
    await expect(recent(page).getByRole('link').first()).toBeFocused();
  });
}
