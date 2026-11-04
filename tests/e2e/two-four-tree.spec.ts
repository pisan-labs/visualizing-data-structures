import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Key', { exact: true }).fill(value);
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible())) await page.getByText('More operations').click();
  await button.click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** Step forward until the narration says `text`. */
async function stepTo(page: Page, text: string) {
  const forward = page.getByRole('button', { name: 'Step forward' });
  for (let i = 0; i < 30; i++) {
    if ((await narration(page).textContent())?.includes(text)) return;
    await forward.click();
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/two-four-tree/');
  await expect(page.getByRole('heading', { name: '2-4 tree', exact: true })).toBeVisible();
});

test('a 4-node overflows and splits around its third key', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '10 20 30 40');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Root \[30\]\. Depth 1: \[10 20\] \[40\]/,
  );
  await page.getByRole('button', { name: 'Back to the previous operation' }).click();
  await stepTo(page, 'an overflow');
  await expect(narration(page)).toContainText('Now it holds 4 keys (a 5-node)');
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(narration(page)).toContainText('They are a 3-node and a 2-node');
  await expect(page.locator('.vars')).toContainText(/splits\s*1/);
});

test('an underflow is fixed by a transfer, or else a fusion', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '10 20 30 40 50 60 70 80 90');
  await op(page, 'Delete', '50 40');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /Root \[20 60\]/);
  await expect(page.locator('.vars')).toContainText(/transfers\s*1/);
  await op(page, 'Delete', '10');
  await toEnd(page);
  await page.getByRole('button', { name: 'Back to the previous operation' }).click();
  await stepTo(page, 'Fusion:');
  await expect(narration(page)).toContainText('Fusion: merge the empty node with [30]');
  await toEnd(page);
  await expect(page.locator('.vars')).toContainText(/fusions\s*1/);
});

test('the successor option changes the swap', async ({ page }) => {
  await fast(page);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Swap it with its successor').check();
  await page.getByText('Options', { exact: true }).click();
  await op(page, 'Insert', '10 20 30 40 50 60 70 80 90');
  await op(page, 'Delete', '60');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /Root \[30 70\]/);
  await expect(page.locator('.code')).toContainText("swap k with v's first key");
});

test('a twenty-key tree stays readable', async ({ page }) => {
  await fast(page);
  await op(
    page,
    'Insert',
    '10 20 30 40 50 60 70 80 90 100 110 120 130 140 150 160 170 180 190 200',
  );
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /20 keys/);
  // Every key label is drawn at least 9 CSS pixels tall, phone included.
  const heights = await stage(page)
    .locator('text.shape')
    .evaluateAll((els) =>
      els
        .filter((e) => /^-?\d+$/.test(e.textContent ?? ''))
        .map((e) => e.getBoundingClientRect().height),
    );
  expect(heights.length).toBeGreaterThanOrEqual(20);
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(9);
});

test('a practice set grades an answer and shows it on the tree', async ({ page }) => {
  await page.goto('/two-four-tree/#practice=13579&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const verdict = (await feedback.locator('strong').textContent()) ?? '';
  const answer = verdict.match(/The answer is (.+)\.$/)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await first.getByRole('button', { name: 'Show me' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(stage(page)).toHaveAttribute('aria-label', /A 2-4 tree with \d+ keys/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'A transfer from the left' }).click();
  await expect(
    page.getByText('Loaded "Underflow fixed by a transfer from the left"'),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Show me' }).first().click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(narration(page)).toContainText(/insert\(40\)|overflow|Split/);
});

test('no axe violations mid-fusion in the dark theme, and no sideways scroll', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
  await fast(page);
  await op(page, 'Insert', '30 90 70 80 10 60 20');
  await op(page, 'Delete', '90');
  await page.getByRole('button', { name: 'Step back' }).click();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
