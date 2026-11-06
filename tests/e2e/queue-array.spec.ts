import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function enqueue(page: Page, values: string) {
  await page.getByLabel('Value').fill(values);
  await page.getByRole('button', { name: 'Enqueue', exact: true }).click();
}

async function loadExample(page: Page, title: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Load' })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/queue-array/');
  await expect(page.getByRole('heading', { name: 'Queue (circular array)' })).toBeVisible();
});

test('enqueue and dequeue are first in, first out', async ({ page }) => {
  await fast(page);
  await enqueue(page, '10 20 30');
  await expect(narration(page)).toContainText('30 is now at the rear of the queue', {
    timeout: 10_000,
  });
  await expect(stage(page)).toHaveAttribute('aria-label', /From front to rear: 10, 20, 30/);
  await page.getByRole('button', { name: 'Dequeue', exact: true }).click();
  await expect(narration(page)).toContainText('Return x = 10', { timeout: 10_000 });
  await expect(page.locator('.code li.active').last()).toContainText('return x');
  await expect(page.locator('.vars')).toContainText('returned');
  await expect(stage(page)).toHaveAttribute('aria-label', /From front to rear: 20, 30\./);
});

test('rear wraps around on the ring and on the row', async ({ page }) => {
  await loadExample(page, 'Rear wraps around to index 0');
  await page.getByRole('tab', { name: 'History' }).click();
  await page.getByRole('button', { name: '10. enqueue(7)' }).click();
  await expect(stage(page)).toHaveAttribute('aria-label', /From front to rear: 4, 5, 6, 7/);
  await page.getByRole('button', { name: '9. enqueue(6)' }).click();
  await expect(narration(page)).toContainText('rear wraps around to the start of the array');
  await expect(stage(page).locator('text', { hasText: /^rear$/ })).toHaveCount(1);

  await page.getByText('Options').click();
  await page.getByLabel('As a row, the way it sits in memory').check();
  await expect(narration(page)).toContainText('rear wraps around to the start of the array');
  await expect(stage(page).getByText('rear = 0')).toBeVisible();
  await expect(stage(page).getByText('front = 3')).toBeVisible();
});

test('the full-or-empty option changes the code and how many items fit', async ({ page }) => {
  await fast(page);
  await enqueue(page, '1 2 3 4 5 6 7 8');
  await expect(narration(page)).toContainText('Queue overflow: 8 is not added', {
    timeout: 20_000,
  });
  await expect(page.locator('.code')).toContainText('if (rear + 1) mod capacity == front');

  await page.getByText('Options').click();
  await page.getByLabel('Keep a count of the items').check();
  await expect(page.locator('.code')).toContainText('if count == capacity');
  await page.getByRole('button', { name: 'Forward to the next operation' }).click();
  await expect(narration(page)).toContainText('Increment count to 8');
  await expect(stage(page)).toHaveAttribute('aria-label', /8 of 8 usable slots/);
});

test('dequeue on an empty queue reports underflow', async ({ page }) => {
  await loadExample(page, 'Empty again, away from index 0');
  await page.getByRole('tab', { name: 'History' }).click();
  await page.getByRole('button', { name: '7. dequeue()' }).click();
  await expect(narration(page)).toContainText('Queue underflow');
  await expect(page.locator('.narration')).toHaveClass(/error/);
  await expect(stage(page)).toHaveAttribute('aria-label', /Empty queue.*front = 3, rear = 3/);
});

test('the row drawing with a count has no axe violations', async ({ page }) => {
  await page.getByText('Options').click();
  await page.getByLabel('Keep a count of the items').check();
  await page.getByLabel('As a row, the way it sits in memory').check();
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
  await enqueue(page, '5');
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});
