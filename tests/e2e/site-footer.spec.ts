import { expect, test } from '@playwright/test';

// The HintWise footer (scripts/site-footer.html), added to every page by scripts/prerender.mjs.
for (const path of ['/', '/stack-array/', '/dijkstra/']) {
  test(`the HintWise footer renders once, after our own footer, on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('[data-site-footer]')).toHaveCount(1);
    const aside = page.locator('site-footer').locator('aside');
    await expect(aside).toContainText('HintWise builds tools like this');
    await expect(aside).toContainText('Yusuf Pisan, Chief Education Officer, HintWise');
    // Our own footer stays above it.
    const ours = await page.locator('footer').first().boundingBox();
    const theirs = await page.locator('site-footer').boundingBox();
    expect(ours && theirs && ours.y + ours.height <= theirs.y + 1).toBe(true);
  });
}

test('the HintWise footer causes no sideways scroll at 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/stack-array/');
  await expect(page.locator('site-footer').locator('aside')).toBeVisible();
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
});

test('the HintWise footer stays out of embeds and Present mode', async ({ page }) => {
  await page.goto('/stack-array/#embed=1');
  await expect(page.locator('site-footer')).toBeHidden();
  await page.goto('/stack-array/');
  await expect(page.locator('site-footer')).toBeVisible();
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(page.locator('site-footer')).toBeHidden();
});
