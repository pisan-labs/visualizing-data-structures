import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function run(page: Page, button: string, input?: string) {
  if (input !== undefined) await page.locator('#op-input').fill(input);
  await page.getByRole('button', { name: button, exact: true }).click();
  await toEnd(page);
}

const smallest = (page: Page) =>
  page.evaluate(() => {
    const svg = document.querySelector('.stage > svg') as SVGSVGElement;
    const scale = svg.getScreenCTM()!.a;
    const sizes = [...svg.querySelectorAll('text')]
      .filter((t) => (t.textContent ?? '').trim())
      .map((t) => Number(t.getAttribute('font-size')) * scale);
    return Math.min(...sizes);
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/monotonic-queue/');
  await expect(
    page.getByRole('heading', { name: 'Monotonic queue (sliding window maximum)', exact: true }),
  ).toBeVisible();
});

test('a window of 3 slides across and finds every maximum', async ({ page }) => {
  await fast(page);
  await run(page, 'Slide the window', '3');
  await expect(narration(page)).toContainText('The window maximums are 7, 7, 5, 5, 6, 6, 8, 8.');
  await expect(stage(page)).toHaveAttribute('aria-label', /Deque, front to back: 8 \(index 8\), 4/);
  await settled(page);
  await expect.poll(() => smallest(page)).toBeGreaterThanOrEqual(9);
});

test('the minimum is a setting', async ({ page }) => {
  await fast(page);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Minimum (the deque increases)').check();
  await expect(page.locator('.code')).toContainText('windowMin(A, k)');
  await run(page, 'Slide the window', '3');
  await expect(narration(page)).toContainText('The window minimums are 2, 1, 1, 1, 3, 2, 2, 2.');
});

test('a window that does not fit is explained', async ({ page }) => {
  await fast(page);
  await run(page, 'Slide the window', '15');
  await expect(narration(page)).toContainText('k must be from 1 to 10');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question has a Show me that plays the answer', async ({ page }) => {
  await page.goto('/monotonic-queue/#practice=31415&n=4');
  const first = page.locator('.question').first();
  await expect(first).toBeVisible();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-slide (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await run(page, 'Slide the window', '3');
    for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
