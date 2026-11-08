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

async function load(page: Page, word: string) {
  await page.locator('#op-input').fill(word);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/manacher/');
  await expect(
    page.getByRole('heading', { name: 'Manacher (longest palindrome)', exact: true }),
  ).toBeVisible();
});

test('Build P finds abacaba and says how', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Build P', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText("The longest palindrome is 'abacaba', length 7");
  await expect(stage(page)).toHaveAttribute('aria-label', /Best: abacaba\./);
  await expect(page.locator('.vars')).toContainText('abacaba');
});

test('an even palindrome is centered on a separator', async ({ page }) => {
  await fast(page);
  await load(page, 'babbac');
  await expect(narration(page)).toContainText("T = '#b#a#b#b#a#c#'");
  await page.getByRole('button', { name: 'Build P', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText("'abba', length 4, centered at T[6]");
});

test('the mirror copies a radius, and the drawing stays readable', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Build P', exact: true }).click();
  await toEnd(page);
  for (let i = 0; i < 60; i++) {
    if ((await narration(page).textContent())?.includes('Its mirror is')) break;
    await page.getByRole('button', { name: 'Step back' }).click();
  }
  await expect(narration(page)).toContainText("Its mirror is i' = 2C − i");
  await expect(stage(page).locator('path.curve')).toHaveCount(1);
  await settled(page);
  const px = await page.evaluate(() => {
    const svg = document.querySelector('.stage > svg') as SVGSVGElement;
    const scale = svg.getScreenCTM()!.a;
    const sizes = [...svg.querySelectorAll('text')]
      .filter((t) => (t.textContent ?? '').trim())
      .map((t) => Number(t.getAttribute('font-size')) * scale);
    return Math.min(...sizes);
  });
  expect(px).toBeGreaterThanOrEqual(9);
});

test('explains a word that is too long', async ({ page }) => {
  await page.locator('#op-input').fill('abcdefghijk');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('11 characters');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question has a Show me that plays the answer', async ({ page }) => {
  await page.goto('/manacher/#practice=27182&n=4');
  const first = page.locator('.question').first();
  await expect(first).toBeVisible();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-build (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await page.getByRole('button', { name: 'Build P', exact: true }).click();
    await toEnd(page);
    for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
