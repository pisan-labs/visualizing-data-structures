/** "Save picture": the step on screen as a stand-alone SVG or a 2x PNG, in the current theme. */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { axeFindings, emptyStart, settled } from './helpers';

async function bst(page: Page, theme: 'light' | 'dark' | 'contrast') {
  await page.goto(emptyStart('bst'));
  await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
  await page.getByLabel('Key', { exact: true }).fill('40 20 60 10 30');
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
  await settled(page);
}

/** Opens the menu and saves; returns the file's name and bytes. */
async function save(page: Page, format: 'SVG' | 'PNG') {
  await page.getByRole('button', { name: 'Save picture' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: new RegExp(`^${format}`) }).click(),
  ]);
  return { name: download.suggestedFilename(), bytes: fs.readFileSync((await download.path())!) };
}

/** The step number the narration shows. */
async function stepShown(page: Page): Promise<string> {
  const text = (await page.locator('.narration .meta').textContent()) ?? '';
  return /Step (\d+) of/.exec(text)![1]!;
}

for (const theme of ['light', 'dark', 'contrast'] as const) {
  test(`saves the step as a stand-alone SVG (${theme})`, async ({ page }) => {
    await bst(page, theme);
    const { name, bytes } = await save(page, 'SVG');
    expect(name).toBe(`bst-step-${await stepShown(page)}.svg`);
    const svg = bytes.toString('utf8');
    expect(svg).not.toContain('var(');
    expect(svg).not.toMatch(/class=|style=|href=/);
    // Valid XML, every shape and label that is on the stage, and the stage's own background.
    const check = await page.evaluate((text) => {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const live = document.querySelector('.stage > svg')!;
      // On the stage, shapes fading out are still there at opacity 0; the file leaves them out.
      const shown = (root: Element, sel: string) =>
        [...root.querySelectorAll(sel)].filter(
          (el) => root !== live || getComputedStyle(el).opacity !== '0',
        );
      const kinds = ['rect', 'circle', 'line', 'path', 'polygon', 'text'];
      // The file has one more rectangle: its background.
      const count = (root: Element) =>
        kinds
          .map((k) => shown(root, `:scope > ${k}`).length - (k === 'rect' && root !== live ? 1 : 0))
          .join(',');
      const texts = (root: Element) =>
        shown(root, ':scope > text')
          .map((t) => t.textContent)
          .join('|');
      const surface = getComputedStyle(document.querySelector('.stage')!).backgroundColor;
      const [r, g, b] = surface.match(/\d+/g)!.map(Number);
      const hex = '#' + [r, g, b].map((v) => v!.toString(16).padStart(2, '0')).join('');
      const root = doc.documentElement;
      return {
        error: doc.querySelector('parsererror')?.textContent ?? null,
        root: root.nodeName,
        ns: root.namespaceURI,
        shapes: count(root) === count(live),
        texts: texts(root) === texts(live),
        textCount: shown(live, ':scope > text').length,
        background: root.querySelector(':scope > rect')?.getAttribute('fill') === hex,
        font: (root.getAttribute('font-family') ?? '').includes('system-ui'),
      };
    }, svg);
    expect(check).toEqual({
      error: null,
      root: 'svg',
      ns: 'http://www.w3.org/2000/svg',
      shapes: true,
      texts: true,
      textCount: expect.any(Number),
      background: true,
      font: true,
    });
    expect(check.textCount).toBeGreaterThan(3);
  });
}

test('saves the step as a PNG at twice its size', async ({ page }) => {
  await bst(page, 'dark');
  const { name, bytes } = await save(page, 'PNG');
  expect(name).toBe(`bst-step-${await stepShown(page)}.png`);
  // The PNG signature, then the header's width and height.
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const { name: svgName, bytes: svgBytes } = await save(page, 'SVG');
  expect(svgName.endsWith('.svg')).toBe(true);
  const size = /<svg[^>]* width="([\d.]+)" height="([\d.]+)"/.exec(svgBytes.toString('utf8'))!;
  expect(width).toBe(Math.round(Number(size[1]) * 2));
  expect(height).toBe(Math.round(Number(size[2]) * 2));
  // A dark picture: the top left pixel is the dark stage.
  const dark = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const [r, g, b] = ctx.getImageData(1, 1, 1, 1).data;
    return r! + g! + b! < 120;
  }, bytes.toString('base64'));
  expect(dark).toBe(true);
});

test('the menu passes axe, closes on Escape, and is there in Present mode', async ({
  page,
  isMobile,
}) => {
  await bst(page, 'light');
  const toggle = page.getByRole('button', { name: 'Save picture' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  const menu = page.locator('#save-picture-menu');
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (!isMobile) {
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(toggle).toBeFocused();
  } else await toggle.click();

  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const { name } = await save(page, 'SVG');
  expect(name).toMatch(/^bst-step-\d+\.svg$/);
  // Escape in the menu closes the menu only, not Present mode.
  if (!isMobile) {
    await toggle.click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Exit presentation' })).toBeVisible();
  }
});
