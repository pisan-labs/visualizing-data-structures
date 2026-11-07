import { expect, test, type Page } from '@playwright/test';
import { showMe, settled } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Graph or vertex', { exact: true });

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value: string) {
  await input(page).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

const ROADS =
  'A-B:2, A-C:6, A-E:7, A-F:6, B-E:3, B-F:3, C-D:4, C-F:7, D-F:4, D-G:2, E-G:7, E-H:1, F-G:2, G-H:9';

test.beforeEach(async ({ page }) => {
  await page.goto('/bellman-ford/');
  await expect(page.getByRole('heading', { name: 'Bellman-Ford', exact: true })).toBeVisible();
});

test('all V - 1 passes, then the check, on the starting graph', async ({ page }) => {
  await fast(page);
  await op(page, 'Run Bellman-Ford from', 'A');
  await toEnd(page);
  await expect(narration(page)).toContainText('Bellman-Ford returns TRUE.');
  await expect(narration(page)).toContainText(
    '3 of the 6 passes changed something: 8, 5, 1, 0, 0, 0.',
  );
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Bellman-Ford from A\. It returned TRUE\. Distances so far: A 0, B 3, C 2, D 6, E 5, F 9, G 9\./,
  );
});

test('a negative cycle is found by following π, and drawn', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', 'A>B:1, B>C:2, C>D:-6, D>E:1, E>B:2, E>F:3');
  await op(page, 'Run Bellman-Ford from', 'A');
  await toEnd(page);
  await expect(narration(page)).toContainText('C ← B ← E ← D ← C');
  await expect(narration(page)).toContainText('Bellman-Ford returns FALSE.');
  await expect(stage(page)).toHaveAttribute('aria-label', /Negative cycle: B → C → D → E → B\./);
  // The cycle's vertices are drawn as errors.
  await expect(stage(page).locator('circle.role-error')).toHaveCount(4);
});

test('stopping early changes the pseudocode and ends after a quiet pass', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Stop early when a pass changes nothing').check();
  await page.getByText('Options', { exact: true }).click();
  await expect(page.locator('.code')).toContainText('if no d changed: return TRUE');
  await fast(page);
  await op(page, 'Run Bellman-Ford from', 'A');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Pass 4 changed nothing, so no later pass can change anything either',
  );
});

test('eight vertices and fourteen edges stay readable', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', ROADS);
  await op(page, 'Run Bellman-Ford from', 'A');
  await toEnd(page);
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Step back' }).click();
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^([A-H]|[0-9]{1,2}|∞)$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await settled(page);
  await expect.poll(async () => (await heights()).length).toBeGreaterThan(40);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(9);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/bellman-ford/#practice=24680&n=5');
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
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
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /Bellman-Ford from A\./);
});
