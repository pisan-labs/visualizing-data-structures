import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function add(page: Page, end: 'first' | 'last', values: string) {
  await page.getByLabel('Value').fill(values);
  await page.getByRole('button', { name: `Add ${end}`, exact: true }).click();
}

async function openExample(page: Page, title: string, jumpTo: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Load' })
    .click();
  await page.getByRole('tab', { name: 'History' }).click();
  await page.getByRole('button', { name: jumpTo }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/deque-list/');
  await expect(page.getByRole('heading', { name: 'Deque (linked list)' })).toBeVisible();
});

test('adds at both ends of a doubly linked list', async ({ page }) => {
  await fast(page);
  await add(page, 'last', '10 20');
  await expect(narration(page)).toContainText('20 is now the last item', { timeout: 10_000 });
  await add(page, 'first', '5');
  await expect(narration(page)).toContainText('5 is now the first item', { timeout: 10_000 });
  await expect(stage(page)).toHaveAttribute('aria-label', /From head to tail: 5, 10, 20\./);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('head.prev = node');
  await expect(page.locator('.code li.active').last()).toContainText('head.prev = node');
});

test('removeLast uses prev and cuts the old link', async ({ page }) => {
  await openExample(page, 'removeLast in one step, thanks to prev', '6. removeLast()');
  await expect(narration(page)).toContainText('Return x = 5');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('tail.next = null');
  await expect(stage(page).getByText('garbage')).toBeVisible();
});

test('removing the only node clears both pointers', async ({ page }) => {
  await openExample(page, 'Removing the only node clears both pointers', '2. removeLast()');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('set head = null too');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('But head still points at the old node');
});

test('a two-way link step has no axe violations in dark mode', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
  await openExample(page, 'Adding and removing at both ends', '3. addFirst(5)');
  await page.getByRole('button', { name: 'Step back' }).click();
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});
