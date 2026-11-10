/**
 * The keyboard shortcuts list ("?"). It is drawn from the table the key handlers use; this
 * checks that every key it lists does what the list says, so a new row needs a check here.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart } from './helpers';

test.skip(({ isMobile }) => isMobile, 'Phones have no keyboard shortcuts');

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' });
const timeline = (page: Page) => page.getByRole('slider', { name: 'Timeline' });
const speed = (page: Page) => page.getByRole('combobox', { name: 'Speed' });
const ink = (page: Page) => page.locator('.stage .ink');
const tool = (page: Page, name: 'Pointer' | 'Pen' | 'Tools off') =>
  page.getByRole('group', { name: 'Pointer and pen' }).getByRole('button', { name, exact: true });

/** The step on screen, from the timeline's "Step 3 of 9". */
async function step(page: Page): Promise<number> {
  const text = (await timeline(page).getAttribute('aria-valuetext')) ?? '';
  return Number(/^Step (\d+)/.exec(text)?.[1] ?? NaN);
}

/** Focus somewhere neutral, so keys go to the page and not to a control. */
const neutral = (page: Page) => page.locator('h1').click();

async function stroke(page: Page) {
  const box = (await page.locator('.stage > svg').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 6 });
  await page.mouse.up();
}

async function presenting(page: Page) {
  if (await page.getByRole('button', { name: 'Exit presentation' }).isVisible()) return;
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exit presentation' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('stack-array'));
  await speed(page).selectOption('4');
  await page.getByLabel('Value', { exact: true }).fill('1 2 3');
  await page.getByRole('button', { name: 'Push', exact: true }).click();
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
});

test('"?" and the button open the list; Esc closes it and focus goes back', async ({ page }) => {
  const button = page.getByRole('button', { name: 'Keyboard shortcuts' });
  await button.click();
  await expect(dialog(page)).toBeVisible();
  // Focus stays inside the list.
  for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    expect(await dialog(page).evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
  // Esc closes the list and does nothing else (it would leave Present mode).
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(button).toBeFocused();

  await neutral(page);
  await page.keyboard.press('?');
  await expect(dialog(page)).toBeVisible();
  // While the list is open the page's keys do nothing.
  const at = await step(page);
  await page.keyboard.press('ArrowLeft');
  expect(await step(page)).toBe(at);
  await dialog(page).getByRole('button', { name: 'Close' }).click();
  await expect(dialog(page)).toBeHidden();
});

test('every key in the list does what it says', async ({ page }) => {
  await neutral(page);
  await page.keyboard.press('?');
  const rows = await dialog(page)
    .locator('tr[data-shortcut]')
    .evaluateAll((trs) =>
      trs.map((tr) => ({
        id: (tr as HTMLElement).dataset.shortcut!,
        keys: JSON.parse((tr as HTMLElement).dataset.keys!) as string[],
      })),
    );
  await page.keyboard.press('Escape');

  const checks: Record<string, (key: string) => Promise<void>> = {
    play: async (key) => {
      await speed(page).selectOption('0.25');
      await neutral(page);
      await page.keyboard.press(key);
      await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
      await page.keyboard.press(key);
      await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
      await speed(page).selectOption('4');
    },
    forward: async (key) => {
      if (await page.getByRole('button', { name: 'Step forward' }).isDisabled())
        await page.getByRole('button', { name: 'Back to the previous operation' }).click();
      await neutral(page);
      const at = await step(page);
      await page.keyboard.press(key);
      await expect.poll(() => step(page)).toBe(at + 1);
    },
    back: async (key) => {
      await neutral(page);
      const at = await step(page);
      await page.keyboard.press(key);
      await expect.poll(() => step(page)).toBe(at - 1);
    },
    slower: async (key) => {
      await speed(page).selectOption('1');
      await neutral(page);
      await page.keyboard.press(key);
      await expect(speed(page)).toHaveValue('0.5');
    },
    faster: async (key) => {
      await speed(page).selectOption('1');
      await neutral(page);
      await page.keyboard.press(key);
      await expect(speed(page)).toHaveValue('1.5');
    },
    help: async (key) => {
      await neutral(page);
      await page.keyboard.press(key);
      await expect(dialog(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toBeHidden();
    },
    tabs: async (key) => {
      const tabs = page.getByRole('tab');
      const names = await tabs.allTextContents();
      await page.getByRole('tab', { name: 'Big-O' }).click();
      const i = names.indexOf('Big-O');
      const to = names[key === 'ArrowRight' ? i + 1 : i - 1]!;
      await page.keyboard.press(key);
      await expect(page.getByRole('tab', { name: to })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('tab', { name: to })).toBeFocused();
    },
    pointer: async (key) => {
      await presenting(page);
      await neutral(page);
      await page.keyboard.press(key);
      await expect(tool(page, 'Pointer')).toHaveAttribute('aria-pressed', 'true');
      const box = (await page.locator('.stage > svg').boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.locator('.dot')).toBeVisible();
      await page.keyboard.press(key);
      await expect(tool(page, 'Tools off')).toHaveAttribute('aria-pressed', 'true');
    },
    pen: async (key) => {
      await presenting(page);
      await neutral(page);
      await page.keyboard.press(key);
      await expect(tool(page, 'Pen')).toHaveAttribute('aria-pressed', 'true');
      await stroke(page);
      await expect(ink(page)).toHaveAttribute('data-strokes', '1');
      await page.keyboard.press(key);
      await expect(tool(page, 'Tools off')).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('c');
    },
    'undo-ink': async (key) => {
      await presenting(page);
      await tool(page, 'Pen').click();
      await stroke(page);
      await stroke(page);
      await expect(ink(page)).toHaveAttribute('data-strokes', '2');
      await page.keyboard.press(key);
      await expect(ink(page)).toHaveAttribute('data-strokes', '1');
      await page.keyboard.press('c');
    },
    'clear-ink': async (key) => {
      await presenting(page);
      await tool(page, 'Pen').click();
      await stroke(page);
      await stroke(page);
      await expect(ink(page)).toHaveAttribute('data-strokes', '2');
      await page.keyboard.press(key);
      await expect(ink(page)).toHaveAttribute('data-strokes', '0');
    },
    escape: async (key) => {
      await presenting(page);
      await tool(page, 'Pointer').click();
      await page.keyboard.press(key);
      await expect(tool(page, 'Tools off')).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press(key);
      await expect(page.getByRole('button', { name: 'Present', exact: true })).toBeVisible();
    },
  };

  // Every row has a check here, and every check has a row: the list is the whole table.
  expect(rows.map((r) => r.id).sort()).toEqual(Object.keys(checks).sort());
  for (const row of rows) {
    for (const key of row.keys) {
      await test.step(`${row.id}: ${key === ' ' ? 'Space' : key}`, () => checks[row.id]!(key));
    }
  }
});

test('the compare page lists and does its own shortcuts', async ({ page }) => {
  await page.goto('/stack-array/#compare=stack-list');
  await expect(page.getByRole('heading', { name: /vs/ })).toBeVisible();
  await page.locator('h1').click();
  await page.keyboard.press('?');
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('tr[data-shortcut]')).toHaveCount(6);
  await expect(dialog(page)).not.toContainText('Present mode');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  // The speed chosen before (4x) is remembered; minus is one notch slower.
  await page.keyboard.press('-');
  await expect(speed(page)).toHaveValue('2');
});
