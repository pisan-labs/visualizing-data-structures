import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Key', { exact: true }).fill(value);
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible())) await page.getByText('More operations').click();
  await button.click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function options(page: Page) {
  if ((await page.locator('details.options').getAttribute('open')) === null)
    await page.getByText('Options', { exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/hash-open/');
  await expect(
    page.getByRole('heading', { name: 'Open addressing (linear, quadratic, double)' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('delete leaves a tombstone that search skips and insert reuses', async ({ page }) => {
  await op(page, 'Insert', '22 33 44');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /0: 22, 1: 33, 2: 44/);
  await op(page, 'Delete', '33');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /1: DEL/);
  await expect(page.locator('.vars')).toContainText(/deleted\s*1/);
  await op(page, 'Search', '44');
  await toEnd(page);
  await expect(narration(page)).toContainText('found it after 3 probes');
  await expect(page.locator('.vars')).toContainText(/probes\s*3/);
  await op(page, 'Insert', '55');
  await toEnd(page);
  await expect(narration(page)).toContainText('Reuse the first tombstone passed, slot 1');
  await expect(stage(page)).toHaveAttribute('aria-label', /1: 55/);
  // One step back: the tombstone is remembered, and probing goes on.
  await page.getByRole('button', { name: 'Step back' }).click();
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Remember it');
  await expect(stage(page).locator('text', { hasText: 'i=1 d' })).toBeVisible();
});

test('every probe shows the formula with real numbers', async ({ page }) => {
  await op(page, 'Insert', '22 33');
  await toEnd(page);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Probe 0: j = (0 + 0) mod 11 = 0');
  await expect(
    stage(page).locator('text', { hasText: 'h(33, 0) = (0 + 0) mod 11 = 0' }),
  ).toBeVisible();
});

test('quadratic probing explains why it cannot reach the empty slots', async ({ page }) => {
  await options(page);
  await page.getByLabel('Quadratic: h(k, i) = (h(k) + i²) mod m').check();
  const m = page.getByLabel('Table size m (number of slots)');
  await m.fill('7');
  await m.press('Tab');
  await op(page, 'Insert', '0 1 2 4 7');
  await toEnd(page);
  await expect(narration(page)).toContainText('3 slots are still empty (3, 5, 6)');
  await expect(narration(page)).toContainText('visited 0, 1, 4, 2');
});

test('double hashing narrates the step size', async ({ page }) => {
  await options(page);
  await page.getByLabel('Double hashing: h(k, i) = (h(k) + i·h2(k)) mod m').check();
  await op(page, 'Insert', '22 33');
  await toEnd(page);
  await expect(narration(page)).toContainText('33 goes here after 2 probes');
  await expect(stage(page)).toHaveAttribute('aria-label', /4: 33/);
  await page.getByRole('button', { name: 'Back to the previous operation' }).click();
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(narration(page)).toContainText('h2(33) = 1 + (33 mod 10) = 4');
});
