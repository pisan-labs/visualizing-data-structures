import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings } from './helpers';

/** Pages in a PDF Chrome made: one page object each. */
const pageCount = (pdf: Buffer) => pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g)?.length;

// The browser's print dialog would wait for a person, so `print()` only counts here. Printing
// to PDF (page.pdf) fires the print events, so each PDF needs a print of its own.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { printed: number };
    w.printed = 0;
    window.print = () => void (w.printed += 1);
  });
});

async function printSheet(page: Page, count: 5 | 10, key = true) {
  const menu = page.locator('details.sheet');
  if (!(await menu.evaluate((d) => (d as HTMLDetailsElement).open)))
    await menu.locator('summary').click();
  await menu.getByRole('radio', { name: String(count), exact: true }).check();
  await menu.getByRole('checkbox', { name: 'Answer key on its own page' }).setChecked(key);
  const before = await page.evaluate(() => (window as unknown as { printed: number }).printed);
  await menu.getByRole('button', { name: 'Print the worksheet' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed))
    .toBe(before + 1);
}

test('a worksheet prints the assignment set with pictures, boxes and a key', async ({
  page,
}, info) => {
  await page.goto('/stack-array/#practice=12345&n=10');
  await expect(page.locator('.question')).toHaveCount(10);
  const prompts = await page.locator('.question .prompt').allTextContents();
  expect(prompts).toHaveLength(10);
  await printSheet(page, 10);

  // On screen nothing changes: the sheet is there, but hidden, and the page still shows.
  const sheet = page.locator('.ws-root');
  await expect(sheet).toBeAttached();
  await expect(sheet).toBeHidden();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/printing-worksheet/);
  await expect(page).toHaveTitle('Stack (array) worksheet, set 12345');

  // On paper only the sheet shows, with the same questions as the assignment link.
  await page.emulateMedia({ media: 'print' });
  await expect(sheet).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  await expect(sheet.getByRole('heading', { level: 1, name: 'Stack (array)' })).toBeVisible();
  await expect(sheet).toContainText('Set 12345, 10 questions.');
  await expect(sheet.locator('.ws-link')).toHaveText(/\/stack-array\/#practice=12345&n=10$/);
  await expect(sheet.locator('.ws-q .ws-prompt')).toHaveText(prompts);
  await expect(sheet.locator('.ws-q svg.ws-pic')).toHaveCount(10);
  await expect(sheet.locator('.ws-q svg.ws-pic').first().locator('rect').first()).toBeVisible();
  // Choice questions get a box per option; the others a line to write on.
  const choices = await sheet
    .locator('.ws-q')
    .filter({ has: page.locator('.ws-choices') })
    .count();
  const lines = await sheet.locator('.ws-q .ws-answer').count();
  expect(choices + lines).toBe(10);
  expect(choices).toBeGreaterThan(0);
  await expect(sheet.locator('.ws-choices li').first().locator('.ws-box')).toBeVisible();
  // The key starts a page of its own, with an answer and a reason for each question.
  const key = sheet.locator('.ws-key');
  await expect(key.getByRole('heading', { name: 'Answer key' })).toBeVisible();
  await expect(key.locator('li')).toHaveCount(10);
  await expect(key.locator('li').first().locator('.ws-why')).not.toBeEmpty();
  expect(await key.evaluate((el) => getComputedStyle(el).breakBefore)).toBe('page');
  // Paper colors, whatever the screen theme.
  expect(await sheet.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgb(255, 255, 255)',
  );

  // A4 and Letter both fit; the sheets are kept for a look (test-results).
  const a4 = await page.pdf({ format: 'A4', path: info.outputPath('worksheet-a4.pdf') });
  // Printing to PDF fired "afterprint": the sheet is gone and the page is as it was.
  await expect(sheet).not.toBeAttached();
  await expect(page.locator('html')).not.toHaveClass(/printing-worksheet/);
  await expect(page).toHaveTitle('Stack (array) · StepWise');
  // Back to the screen (emulating "screen" would make page.pdf print the screen view).
  await page.emulateMedia({ media: null });

  await printSheet(page, 10);
  await expect(sheet).toBeAttached();
  const letter = await page.pdf({
    format: 'Letter',
    path: info.outputPath('worksheet-letter.pdf'),
  });
  await expect(sheet).not.toBeAttached();
  await printSheet(page, 10, false);
  await expect(sheet.locator('.ws-q')).toHaveCount(10);
  await expect(sheet.locator('.ws-key')).toHaveCount(0);
  const noKey = await page.pdf({ format: 'A4', path: info.outputPath('worksheet-no-key.pdf') });
  expect(pageCount(a4)).toBeGreaterThanOrEqual(3);
  expect(pageCount(letter)).toBeGreaterThanOrEqual(3);
  // The key adds at least a page: it never shares one with the questions.
  expect(pageCount(a4)! - pageCount(noKey)!).toBeGreaterThanOrEqual(1);
});

test('a five-question worksheet is the start of the same set', async ({ page }) => {
  await page.goto('/bst/#practice=777&n=10');
  await expect(page.locator('.question')).toHaveCount(10);
  const prompts = await page.locator('.question .prompt').allTextContents();
  await printSheet(page, 5);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.ws-q .ws-prompt')).toHaveText(prompts.slice(0, 5));
  await expect(page.locator('.ws-root')).toContainText('#practice=777&n=5');
});

test('the worksheet menu works from the keyboard and passes axe', async ({ page }) => {
  await page.goto('/stack-array/#practice=4242&n=5');
  const summary = page.locator('details.sheet summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  const menu = page.locator('details.sheet');
  await expect(menu.getByRole('radio', { name: '5', exact: true })).toBeChecked();
  await expect(menu.getByRole('checkbox', { name: 'Answer key on its own page' })).toBeChecked();
  const results = await new AxeBuilder({ page })
    .include('.practice')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
  await menu.getByRole('button', { name: 'Print the worksheet' }).focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed))
    .toBe(1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
