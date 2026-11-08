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

test.beforeEach(async ({ page }) => {
  await page.goto('/lz-compression/');
  await expect(
    page.getByRole('heading', { name: 'LZ77 and LZW compression', exact: true }),
  ).toBeVisible();
});

test('LZ77 encodes into triples and decodes them back', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Encode', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('4 triples: (0,0,a) (0,0,b) (2,4,c) (5,4,c)');
  await expect(page.locator('.vars')).toContainText('63%');
  await page.getByRole('button', { name: 'Decode', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText("The decoder rebuilt 'abababcababc'");
  await expect(stage(page)).toHaveAttribute('aria-label', /Decoded so far: abababcababc\./);
});

test('LZW grows a dictionary and handles the tricky code', async ({ page }) => {
  await fast(page);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('LZW: codes from a growing dictionary').check();
  await page.locator('#op-input').fill('abababababab');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Encode', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('6 codes: 97 98 256 258 257 260');
  await page.getByRole('button', { name: 'Decode', exact: true }).click();
  await toEnd(page);
  for (let i = 0; i < 10; i++) {
    if ((await narration(page).textContent())?.includes('not in the dictionary yet')) break;
    await page.getByRole('button', { name: 'Step back' }).click();
  }
  await expect(narration(page)).toContainText('not in the dictionary yet');
});

test('the drawing stays readable mid-encode', async ({ page }) => {
  await fast(page);
  await page.locator('#op-input').fill('abcabcabcabcabcabcab');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Encode', exact: true }).click();
  await toEnd(page);
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Step back' }).click();
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

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question has a Show me that plays the answer', async ({ page }) => {
  await page.goto('/lz-compression/#practice=14142&n=4');
  const first = page.locator('.question').first();
  await expect(first).toBeVisible();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-encode (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await page.getByRole('button', { name: 'Encode', exact: true }).click();
    await toEnd(page);
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
