/** Present mode's pointer and pen: ink over the stage that never moves the drawing. */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled } from './helpers';

const drawing = (page: Page) => page.locator('.stage > svg');
const ink = (page: Page) => page.locator('.stage .ink');
const tools = (page: Page) => page.getByRole('group', { name: 'Pointer and pen' });
const tool = (page: Page, name: 'Pointer' | 'Pen' | 'Tools off') =>
  tools(page).getByRole('button', { name, exact: true });
const timeline = (page: Page) => page.getByRole('slider', { name: 'Timeline' });

/** Three pushes, played to the end, then Present mode. */
async function presentStack(page: Page) {
  await page.goto(emptyStart('stack-array'));
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
  await page.getByLabel('Value', { exact: true }).fill('1 2 3');
  await page.getByRole('button', { name: 'Push', exact: true }).click();
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
  await page.getByRole('button', { name: 'Present' }).click();
  await expect(tools(page)).toBeVisible();
  await settled(page);
}

/** A stroke from (x1, y1) to (x2, y2), as fractions of the drawing, with the mouse. */
async function stroke(page: Page, x1 = 0.2, y1 = 0.3, x2 = 0.6, y2 = 0.5) {
  const box = (await drawing(page).boundingBox())!;
  await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    await page.mouse.move(
      box.x + box.width * (x1 + (x2 - x1) * t),
      box.y + box.height * (y1 + (y2 - y1) * t),
    );
  }
  await page.mouse.up();
}

/** A stroke made of pointer events of one type (touch or a stylus), with the given pointer id. */
async function pointerStroke(page: Page, pointerType: 'touch' | 'pen', pointerId: number) {
  const box = (await ink(page).boundingBox())!;
  const at = (f: number) => ({
    clientX: box.x + box.width * (0.3 + 0.3 * f),
    clientY: box.y + box.height * 0.6,
    pointerId,
    pointerType,
    isPrimary: true,
    bubbles: true,
    button: 0,
    buttons: 1,
  });
  await ink(page).dispatchEvent('pointerdown', at(0));
  for (const f of [0.25, 0.5, 0.75, 1]) await ink(page).dispatchEvent('pointermove', at(f));
  await ink(page).dispatchEvent('pointerup', { ...at(1), buttons: 0 });
}

test('the pen draws over the stage, and Undo and Clear take ink away', async ({ page }) => {
  await presentStack(page);
  const before = await drawing(page).getAttribute('viewBox');
  await tool(page, 'Pen').click();
  await expect(tool(page, 'Pen')).toHaveAttribute('aria-pressed', 'true');
  // Pan and zoom stay still while a tool is on.
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
  await stroke(page);
  await expect(ink(page)).toHaveAttribute('data-strokes', '1');
  await expect(ink(page).locator('path.line')).toHaveAttribute('stroke', '#e53935');
  expect(await drawing(page).getAttribute('viewBox')).toBe(before);

  await tools(page).getByRole('button', { name: 'Blue ink' }).click();
  await stroke(page, 0.3, 0.6, 0.7, 0.7);
  await expect(ink(page).locator('path.line').nth(1)).toHaveAttribute('stroke', '#1e88e5');
  await tools(page).getByRole('button', { name: 'Undo last stroke' }).click();
  await expect(ink(page)).toHaveAttribute('data-strokes', '1');
  await tools(page).getByRole('button', { name: 'Clear ink' }).click();
  await expect(ink(page)).toHaveAttribute('data-strokes', '0');
  await expect(tools(page).getByRole('button', { name: 'Clear ink' })).toBeDisabled();
});

test('ink goes when the step changes, unless Keep ink is on', async ({ page }) => {
  await presentStack(page);
  // The address follows the work 400 ms after a change.
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#ex=z/);
  const hash = new URL(page.url()).hash;
  await tool(page, 'Pen').click();
  await stroke(page);
  await expect(ink(page)).toHaveAttribute('data-strokes', '1');
  // Ink is not part of the work: the link stays as it was.
  await page.waitForTimeout(600);
  expect(new URL(page.url()).hash).toBe(hash);

  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(ink(page)).toHaveAttribute('data-strokes', '0');

  await tools(page).getByRole('checkbox', { name: 'Keep ink' }).check();
  await stroke(page);
  const step = await timeline(page).getAttribute('aria-valuetext');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(timeline(page)).not.toHaveAttribute('aria-valuetext', step!);
  await expect(ink(page)).toHaveAttribute('data-strokes', '1');

  // Leaving Present mode takes the ink and the tool away.
  await page.getByRole('button', { name: 'Exit presentation' }).click();
  await expect(ink(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Present' }).click();
  await expect(ink(page)).toHaveAttribute('data-strokes', '0');
  await expect(tool(page, 'Tools off')).toHaveAttribute('aria-pressed', 'true');
});

test('the pointer follows the mouse; with the tools off, dragging pans again', async ({ page }) => {
  await presentStack(page);
  const box = (await drawing(page).boundingBox())!;
  const before = await drawing(page).getAttribute('viewBox');
  await tool(page, 'Pointer').click();
  const x = box.x + box.width * 0.4;
  const y = box.y + box.height * 0.5;
  await page.mouse.move(x, y);
  const dot = page.locator('.dot');
  await expect(dot).toBeVisible();
  const d = (await dot.boundingBox())!;
  expect(Math.abs(d.x + d.width / 2 - x)).toBeLessThan(2);
  expect(Math.abs(d.y + d.height / 2 - y)).toBeLessThan(2);
  // A drag with the pointer on does not pan the drawing or draw.
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 30, { steps: 5 });
  await page.mouse.up();
  expect(await drawing(page).getAttribute('viewBox')).toBe(before);
  await expect(ink(page)).toHaveAttribute('data-strokes', '0');

  await tool(page, 'Tools off').click();
  await expect(dot).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeEnabled();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 30, { steps: 5 });
  await page.mouse.up();
  expect(await drawing(page).getAttribute('viewBox')).not.toBe(before);
});

test('a finger and a stylus draw; after a stylus, a resting palm does not', async ({ page }) => {
  await presentStack(page);
  await tool(page, 'Pen').click();
  await pointerStroke(page, 'touch', 11);
  await expect(ink(page)).toHaveAttribute('data-strokes', '1');
  await pointerStroke(page, 'pen', 12);
  await expect(ink(page)).toHaveAttribute('data-strokes', '2');
  await pointerStroke(page, 'touch', 13);
  await expect(ink(page)).toHaveAttribute('data-strokes', '2');
  // The ink layer takes touches itself, so the page does not scroll under a finger.
  await expect(ink(page)).toHaveCSS('touch-action', 'none');
});

test('Escape turns the tool off before it leaves Present mode', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Phones have no keyboard shortcuts');
  await presentStack(page);
  await page.locator('h1').click();
  await page.keyboard.press('p');
  await expect(tool(page, 'Pen')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(tool(page, 'Tools off')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Exit presentation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Present' })).toBeVisible();
  await expect(tools(page)).toHaveCount(0);
});

for (const theme of ['light', 'dark', 'contrast'] as const) {
  test(`the tools fit and pass axe (${theme})`, async ({ page }) => {
    await presentStack(page);
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await tool(page, 'Pen').click();
    await stroke(page);
    await expect(ink(page)).toHaveAttribute('data-strokes', '1');
    await settled(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
    // CI's font is wider; the toolbar wraps instead of widening the page.
    await page.addStyleTag({
      content: ":root { --font: 'DejaVu Sans', Verdana, sans-serif !important; }",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
}
