import { expect, test, type Page } from '@playwright/test';
import { emptyStart } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function build(page: Page, text: string) {
  await page.getByLabel('List', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('floyd-cycle'));
  await expect(
    page.getByRole('heading', { name: 'Cycle detection (tortoise and hare)' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('finds where the cycle starts and how long it is', async ({ page }) => {
  await build(page, '1 2 3 4 5 6 @2');
  await expect(stage(page)).toHaveAttribute('aria-label', /Tail μ = 2, cycle λ = 4/, {
    timeout: 10_000,
  });
  await page.getByRole('button', { name: 'Detect cycle', exact: true }).click();
  await expect(narration(page)).toContainText('the tail is μ = 2 and the cycle is λ = 4', {
    timeout: 20_000,
  });
  await expect(page.locator('.vars')).toContainText('λ');
});

test('a list without a cycle ends with the hare at null', async ({ page }) => {
  await build(page, '1 2 3 4 5');
  await expect(stage(page)).toHaveAttribute('aria-label', /→ null\. No cycle/, {
    timeout: 10_000,
  });
  await page.getByRole('button', { name: 'Detect cycle', exact: true }).click();
  await expect(narration(page)).toContainText('so there is no cycle', { timeout: 20_000 });
});

test('bad input is explained and changes nothing', async ({ page }) => {
  await build(page, '1 2 3 @9');
  await expect(page.getByRole('alert')).toContainText('from 0 to 2');
  await build(page, '1 @0 2');
  await expect(page.getByRole('alert')).toContainText('at the end');
  await expect(narration(page)).toContainText('An empty list');
});
