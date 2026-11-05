import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Graph or vertex', { exact: true });

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await input(page).fill(value);
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible())) await page.getByText('More operations').click();
  await button.click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/graph-representations/');
  await expect(
    page.getByRole('heading', { name: 'Graph representations', exact: true }),
  ).toBeVisible();
});

test('each representation counts its own checks for a missing edge', async ({ page }) => {
  await fast(page);
  await op(page, 'Has edge?', 'A-H');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'No: A-H is not an edge. Entries touched: adjacency list 2, matrix 1, edge list 10.',
  );
  await expect(page.locator('.vars')).toContainText(/edge list\s*10/);
});

test('loading a matrix and adding a vertex', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', '0 1 1; 1 0 0; 1 0 0');
  await toEnd(page);
  await expect(narration(page)).toContainText('read as an adjacency matrix');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /An undirected graph with 3 vertices and 2 edges\. A with B, C/,
  );
  await op(page, 'Add vertex', 'D');
  await toEnd(page);
  await expect(narration(page)).toContainText('copied into a 4 × 4 matrix');
  // A bad graph is refused, with the bad token named, and the graph stays.
  await input(page).fill('A-B, C-');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('"C-" needs a vertex after "-"');
});

test('stacked for a phone, every label stays readable', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'The stacked arrangement is for phones.');
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Stacked: for a phone held upright').check();
  await page.getByText('Options', { exact: true }).click();
  const heights = await stage(page)
    .locator('text.shape')
    .evaluateAll((els) =>
      els
        .filter((e) => /^[A-H01]$/.test(e.textContent ?? ''))
        .map((e) => e.getBoundingClientRect().height),
    );
  expect(heights.length).toBeGreaterThan(60);
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(9);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/graph-representations/#practice=13579&n=5');
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.question')).toHaveCount(5);
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
  await first.getByRole('button', { name: 'Show me' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(stage(page)).toHaveAttribute('aria-label', /graph with \d+ vertices/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'the star' }).first().click();
  await expect(
    page.getByText('Loaded "Worst case for the list: v at the end of a long list"'),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Show me' }).first().click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
});
