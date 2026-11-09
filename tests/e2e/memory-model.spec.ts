/**
 * The memory model's own browser checks. Running every operation, the axe scan and the fit at
 * the phone project's width are in all-vizzes.spec.ts.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled } from './helpers';

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function run(page: Page, statement: string) {
  await page.getByLabel('Statement', { exact: true }).fill(statement);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
}

// The concept page compares statements in a table of four columns, with code in the first. Its
// words do not break, so on a small phone it is wider than the page: it scrolls inside its own
// box, and the page itself never scrolls sideways.
for (const width of [390, 360]) {
  test(`no sideways scroll on a phone ${width} px wide`, async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'Checks phone widths.');
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/memory-model/');
    const table = page.getByRole('region', { name: /^Table: Statement/ });
    await expect(table).toHaveAttribute('tabindex', '0');
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
    await run(page, 'xs = [1, 2, 3, 4]');
    await run(page, 'ys = xs');
    await run(page, 'grow(xs)');
    for (const lang of ['java', 'cpp', 'python']) {
      await page.getByRole('combobox', { name: 'Show the code as' }).selectOption(lang);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    }
    await settled(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // A box that scrolls must be reachable by keyboard; axe checks it while it scrolls.
    const results = await new AxeBuilder({ page })
      .include('.learn')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);

    // CI's default font, DejaVu Sans, is wider than most.
    await page.addStyleTag({
      content: ":root { --font: 'DejaVu Sans', Verdana, sans-serif !important; }",
    });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
}
