import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/kruskal/');
  await expect(
    page.getByRole('heading', { name: "Kruskal's minimum spanning tree", exact: true }),
  ).toBeVisible();
});

test('Kruskal keeps the light edges and rejects the ones that close cycles', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Run Kruskal', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('total weight 19');
  await expect(narration(page)).toContainText('7 edges were rejected');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Tree edges: C-D, A-C, E-G, B-E, F-H, A-B, D-F, weight 19\. Rejected \(cycle\): B-D, F-G, A-D, D-G, C-F, D-E, G-H\./,
  );
  // The sorted list marks rejected edges with a cross.
  await expect(stage(page).locator('text.shape', { hasText: 'B-D:5 ✗' })).toHaveCount(1);
});

test('stopping early skips the heavy edges', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Stop as soon as the tree has V − 1 edges').check();
  await page.getByText('Options', { exact: true }).click();
  await expect(page.locator('.code')).toContainText('if |A| == |V| − 1: break');
  await fast(page);
  await page.getByRole('button', { name: 'Run Kruskal', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('Stopped early.');
  await expect(stage(page)).toHaveAttribute('aria-label', /Rejected \(cycle\): none\./);
});

test('the edge list and forest stay readable on the screen', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Run Kruskal', exact: true }).click();
  await toEnd(page);
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^([A-H]|[A-H]-[A-H]:\d.*)$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await expect.poll(async () => (await heights()).length).toBeGreaterThan(25);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(7);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a practice question is graded', async ({ page }) => {
  await page.goto('/kruskal/#practice=2468&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\./)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
});
