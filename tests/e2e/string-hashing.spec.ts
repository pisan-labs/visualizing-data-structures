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
  await page.goto('/string-hashing/');
  await expect(
    page.getByRole('heading', { name: 'String hashing (polynomial rolling hash)', exact: true }),
  ).toBeVisible();
});

test('prefix hashes, then a substring in one step', async ({ page }) => {
  await fast(page);
  await run(page, 'Build prefix hashes');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Prefix hashes H: 0, 1, 33, 31, 53, 30, 22, 80, 57, 52, 14, 31\./,
  );
  await run(page, 'Hash substring', '7 10');
  await expect(narration(page)).toContainText('= (31 − 80·78) mod 101 = 53');
  await settled(page);
  await expect.poll(() => smallest(page)).toBeGreaterThanOrEqual(9);
});

test('a collision with p = 101, caught by double hashing', async ({ page }) => {
  await fast(page);
  await run(page, 'Compare', '0 1 4');
  await expect(narration(page)).toContainText("but 'abra' ≠ 'brac': a collision");
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Double hashing: also mod p₂').check();
  await toEnd(page);
  await expect(narration(page)).toContainText('(53, 33) ≠ (53, 76)');
});

test('every window by the rolling update', async ({ page }) => {
  await fast(page);
  await page.getByText('More operations').click();
  await run(page, 'Hash every window', '4');
  await expect(narration(page)).toContainText(
    "'abra' at 0, 'brac' at 1, 'abra' at 7 (a repeat and a collision)",
  );
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question has a Show me that plays the answer', async ({ page }) => {
  await page.goto('/string-hashing/#practice=31415&n=4');
  const first = page.locator('.question').first();
  await expect(first).toBeVisible();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-compare (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await run(page, 'Compare', '0 1 4');
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
