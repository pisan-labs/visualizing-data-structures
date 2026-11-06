/**
 * Runs against every visualization folder in src/viz, so new visualizations are covered
 * without writing anything here. Visualization-specific behavior goes in its own spec file.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { settled } from './helpers';

const root = path.resolve('src/viz');
const ids = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, 'index.ts')))
  .map((d) => d.name);

for (const id of ids) {
  test.describe(id, () => {
    test('runs every operation without errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.goto(`/${id}/`);
      await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
      const form = page.locator('form.controls');
      const input = form.locator('#op-input');
      const sample = (await input.count()) ? await input.getAttribute('data-sample') : null;
      // Open "More operations" so every operation button can be clicked.
      const more = form.locator('details.more > summary');
      if (await more.count()) await more.click();
      const buttons = form.locator('button');
      const count = await buttons.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        // A button that reads several values (data-args) gets the sample once per value.
        const args = Number((await buttons.nth(i).getAttribute('data-args')) ?? 1);
        if (sample !== null) await input.fill(Array(args).fill(sample).join(' '));
        await buttons.nth(i).click();
        await expect(page.getByRole('alert')).toHaveCount(0);
      }
      const next = page.getByRole('button', { name: 'Forward to the next operation' });
      // Playback may finish (and disable the button) between the check and the click, so the
      // click must not wait for "enabled". Jumping to an operation also pauses playback.
      for (let i = 0; i < count + 2; i++) {
        if (await next.isDisabled()) break;
        await next.click({ force: true });
      }
      await expect(page.locator('.narration p')).not.toBeEmpty();
      await page.getByRole('button', { name: 'Back to the previous operation' }).click();
      await expect(page.locator('.narration p')).not.toBeEmpty();
      expect(errors).toEqual([]);
    });

    test('fits the screen and has no axe violations', async ({ page }) => {
      await page.goto(`/${id}/`);
      const overflow = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
      expect(await overflow()).toBeLessThanOrEqual(0);
      await settled(page);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
      // Text widths depend on the fonts a device has, and the default font differs between
      // machines (CI resolves it to DejaVu Sans, which is wide). Check with a wide font too.
      await page.addStyleTag({
        content: ":root { --font: 'DejaVu Sans', Verdana, sans-serif !important; }",
      });
      expect(await overflow()).toBeLessThanOrEqual(0);
    });
  });
}
