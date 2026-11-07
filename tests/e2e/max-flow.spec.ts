import { expect, test, type Page } from '@playwright/test';
import { showMe, settled } from './helpers';

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

async function option(page: Page, label: string, value?: string) {
  await page.getByText('Options', { exact: true }).click();
  if (value) await page.getByLabel(label).selectOption(value);
  else await page.getByLabel(label).check();
  await page.getByText('Options', { exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/max-flow/');
  await expect(
    page.getByRole('heading', { name: 'Maximum flow and minimum cut', exact: true }),
  ).toBeVisible();
});

test('Edmonds-Karp finds 23 and marks the minimum cut', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Find max flow', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('the maximum flow is 23, after 3 augmenting paths');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Maximum flow 23\. Minimum cut S = \{s, a, b, d\}, capacity 23\./,
  );
  // The s side is shaded and the three cut arcs are red.
  await expect(stage(page).locator('circle.role-found')).toHaveCount(4);
  await expect
    .poll(() => stage(page).locator('.arrow.role-error').count())
    .toBeGreaterThanOrEqual(3);
  await expect(stage(page).getByText('12/12', { exact: true })).toBeVisible();
});

test('depth-first search changes the pseudocode and the paths', async ({ page }) => {
  await option(page, 'Ford-Fulkerson with depth-first search');
  await expect(page.locator('.code')).toContainText('FORD-FULKERSON(G, s, t)');
  await fast(page);
  await page.getByRole('button', { name: 'Find max flow', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('the maximum flow is 23, after 4 augmenting paths');
});

test('the residual network shows reverse arcs, dashed', async ({ page }) => {
  await option(page, 'Draw the residual network');
  await fast(page);
  await input(page).fill('s>a:1, a>b:1, b>e:1, e>t:1, s>c:1, c>d:1, d>t:1, a>d:1');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Find max flow', exact: true }).click();
  await toEnd(page);
  await expect.poll(() => stage(page).locator('[stroke-dasharray]').count()).toBeGreaterThan(0);
  await expect(narration(page)).toContainText('the maximum flow is 2');
});

test('a bad capacity is refused with a reason', async ({ page }) => {
  await input(page).fill('s>a:0, a>t:2');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Capacities are whole numbers from 1 to 99');
});

test('labels stay readable and the page fits', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Find max flow', exact: true }).click();
  await toEnd(page);
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^\d+\/\d+$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await settled(page);
  await expect.poll(async () => (await heights()).length).toBe(9);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(8);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('compare mode puts min-cost flow beside it on the same network', async ({ page }) => {
  await page.goto('/max-flow/#compare=min-cost-flow');
  await fast(page);
  await page.getByRole('button', { name: 'Find max flow', exact: true }).click();
  await toEnd(page);
  const sides = page.locator('.sides > .side');
  await expect(sides.nth(0).locator('.narration p')).toContainText('the maximum flow is 23');
  await expect(sides.nth(1).locator('.narration p')).toContainText(
    'a maximum flow of 23 at the least possible cost, 467',
  );
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/max-flow/#practice=24680&n=5');
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\.(\s|$)/)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /A flow network/);
});
