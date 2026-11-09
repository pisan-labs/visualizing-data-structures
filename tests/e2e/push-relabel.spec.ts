import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Network', { exact: true });

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function option(page: Page, label: string) {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel(label).check();
  await page.getByText('Options', { exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/push-relabel/');
  await expect(
    page.getByRole('heading', { name: 'Push-relabel max flow', exact: true }),
  ).toBeVisible();
});

test('FIFO push-relabel finds 23 and compares with Edmonds-Karp', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Find max flow', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('the maximum flow is 23');
  await expect(narration(page)).toContainText('15 pushes (3 saturating), 12 relabels');
  await expect(narration(page)).toContainText('Edmonds-Karp takes 3 augmenting paths');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Maximum flow 23\. Minimum cut S = \{s, a, b, d\}, capacity 23\./,
  );
  await expect(page.locator('.vars')).toContainText(/relabels\s*12/);
  // Heights sit beside the vertices; the s side is shaded and the cut arcs are red.
  await expect(stage(page).getByText('h=6', { exact: true })).toBeVisible();
  await expect(stage(page).locator('circle.role-found')).toHaveCount(4);
  await expect
    .poll(() => stage(page).locator('.arrow.role-error').count())
    .toBeGreaterThanOrEqual(3);
});

test('relabel-to-front changes the pseudocode and keeps a list', async ({ page }) => {
  await option(page, 'Relabel-to-front: a list, risers to the front (CLRS 26.5)');
  await expect(page.locator('.code')).toContainText('RELABEL-TO-FRONT(G, s, t)');
  await fast(page);
  await page.getByRole('button', { name: 'Find max flow', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('relabel-to-front took 15 pushes');
});

test('extra flow climbs above s and goes back', async ({ page }) => {
  await fast(page);
  await input(page).fill('s>a:9, a>b:4, a>c:5, b>t:3, c>t:2');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Find max flow', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('the maximum flow is 5');
  await expect(page.locator('.narration')).toContainText('No vertex overflows');
});

test('a bad capacity is refused with a reason', async ({ page }) => {
  await input(page).fill('s>a:0, a>t:2');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Capacities are whole numbers from 1 to 99');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(stage(page)).toHaveAttribute('aria-label', /A flow network/);
});

test('labels stay readable and the page fits', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Find max flow', exact: true }).click();
  await toEnd(page);
  await settled(page);
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^h=\d+$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await expect.poll(async () => (await heights()).length).toBe(6);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(8);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('compare mode puts max-flow beside it on the same network', async ({ page }) => {
  await page.goto('/push-relabel/#compare=max-flow');
  await fast(page);
  await page.getByRole('button', { name: 'Find max flow', exact: true }).click();
  await toEnd(page);
  const sides = page.locator('.sides > .side');
  await expect(sides.nth(0).locator('.narration p')).toContainText('the maximum flow is 23');
  await expect(sides.nth(1).locator('.narration p')).toContainText('the maximum flow is 23');
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/push-relabel/#practice=24680&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /A flow network/);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await page.getByRole('button', { name: 'Find max flow', exact: true }).click();
    await toEnd(page);
    for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
