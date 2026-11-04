import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function add(page: Page, end: 'first' | 'last', values: string) {
  await page.getByLabel('Value').fill(values);
  await page.getByRole('button', { name: `Add ${end}`, exact: true }).click();
}

async function loadExample(page: Page, title: string, jumpTo: string) {
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
  await page.goto('/deque-array/');
  await expect(page.getByRole('heading', { name: 'Deque (circular array)' })).toBeVisible();
});

test('addFirst wraps front back to the last index', async ({ page }) => {
  await fast(page);
  await add(page, 'first', '1 2');
  await expect(narration(page)).toContainText('2 is now at the front of the deque', {
    timeout: 10_000,
  });
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /front = 6, rear = 0\. From front to back: 2, 1/,
  );
  await page.getByRole('tab', { name: 'History' }).click();
  await page.getByRole('button', { name: '1. addFirst(1)' }).click();
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('(0 - 1) mod 8 = 7');
  await expect(narration(page)).toContainText('wraps around to the last index');
  await expect(page.locator('.code li.active')).toContainText('front = (front - 1) mod capacity');
});

test('removes and peeks at both ends', async ({ page }) => {
  await loadExample(page, 'Adding and removing at both ends', '8. peekLast()');
  await expect(narration(page)).toContainText('Return A[0] = 10');
  await expect(stage(page)).toHaveAttribute('aria-label', /From front to back: 5, 10\./);
  await page.getByRole('button', { name: '5. removeLast()' }).click();
  await expect(page.locator('.vars')).toContainText('returned');
  await expect(narration(page)).toContainText('Copy x = A[rear] = A[1] = 20');
});

test('a counted deque uses every slot, then overflows', async ({ page }) => {
  await loadExample(page, 'Every slot used, with a count', '5. addLast(5)');
  await expect(narration(page)).toContainText('Deque overflow: 5 is not added');
  await expect(page.locator('.narration')).toHaveClass(/error/);
  await expect(stage(page).getByText('count = 4')).toBeVisible();
  await expect(stage(page).getByText('front = 2')).toBeVisible();
  await expect(stage(page).getByText('rear = 2')).toBeVisible();
});

test('empty at either end reports underflow', async ({ page }) => {
  await loadExample(page, 'Empty at either end', '3. removeFirst()');
  await expect(narration(page)).toContainText('Deque underflow');
  await page.getByRole('button', { name: '4. peekLast()' }).click();
  await expect(narration(page)).toContainText('There is nothing to peek at');
});

test('the counted row drawing has no axe violations', async ({ page }) => {
  await page.getByText('Options').click();
  await page.getByLabel('Keep a count of the items').check();
  await page.getByLabel('As a row, the way it sits in memory').check();
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('contrast');
  await add(page, 'first', '5');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});
