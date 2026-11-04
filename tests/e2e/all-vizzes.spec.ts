/**
 * Runs against every visualization folder in src/viz, so new visualizations are covered
 * without writing anything here. Visualization-specific behavior goes in its own spec file.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

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
      await page.goto(`./#/${id}`);
      await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
      const form = page.locator('form.controls');
      const input = form.locator('#op-input');
      const sample = (await input.count()) ? await input.getAttribute('data-sample') : null;
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
      for (let i = 0; i < count + 2 && (await next.isEnabled()); i++) await next.click();
      await expect(page.locator('.narration p')).not.toBeEmpty();
      await page.getByRole('button', { name: 'Back to the previous operation' }).click();
      await expect(page.locator('.narration p')).not.toBeEmpty();
      expect(errors).toEqual([]);
    });

    test('fits the screen and has no axe violations', async ({ page }) => {
      await page.goto(`./#/${id}`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  });
}
