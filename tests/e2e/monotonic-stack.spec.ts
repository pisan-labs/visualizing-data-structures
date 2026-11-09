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
  await page.goto('/monotonic-stack/');
  await expect(page.getByRole('heading', { name: 'Monotonic stack', exact: true })).toBeVisible();
});

test('the scan answers every next greater value', async ({ page }) => {
  await fast(page);
  await run(page, 'Scan with the stack');
  await expect(narration(page)).toContainText('9 pushes and 6 pops');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /next greater: 0: 7, 1: 8, 2: 5, 3: 5, 4: 8, 5: none, 6: 6, 7: none, 8: none\./,
  );
  await settled(page);
  await expect.poll(() => smallest(page)).toBeGreaterThanOrEqual(9);
});

test('previous smaller is a setting', async ({ page }) => {
  await fast(page);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('The previous smaller value (stack increases)').check();
  await expect(page.locator('.code')).toContainText('previousSmaller(A)');
  await run(page, 'Load', '4 7 3 2 5');
  await run(page, 'Scan with the stack');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /previous smaller: 0: none, 1: 4, 2: none, 3: none, 4: 2\./,
  );
});

test('the largest rectangle in a histogram', async ({ page }) => {
  await fast(page);
  await run(page, 'Load', '2 1 5 6 2 3');
  await run(page, 'Largest rectangle');
  await expect(narration(page)).toContainText('The largest rectangle has area 10');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question has a Show me that plays the answer', async ({ page }) => {
  await page.goto('/monotonic-stack/#practice=31415&n=4');
  const first = page.locator('.question').first();
  await expect(first).toBeVisible();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-scan (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await run(page, 'Largest rectangle');
    for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
