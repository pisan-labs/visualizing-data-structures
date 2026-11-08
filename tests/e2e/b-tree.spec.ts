import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

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

async function option(page: Page, label: string) {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel(label).check();
  await page.getByText('Options', { exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/b-tree/');
  await expect(page.getByRole('heading', { name: 'B-tree', exact: true })).toBeVisible();
});

test('a full root splits and the tree grows at the top', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '10 20 30 40 50 60');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /6 keys in 3 nodes, height 1\. Root \[30\]/,
  );
  await page.getByRole('button', { name: 'Back to the previous operation' }).click();
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(narration(page)).toContainText('2t - 1 = 5 keys');
  await page.getByRole('button', { name: 'Step forward' }).click();
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(narration(page)).toContainText('its middle key 30 moves up');
  await expect(page.locator('.vars')).toContainText(/splits\s*1/);
});

test('delete borrows from a sibling through the parent', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '10 20 30 40 50 60 70 80 90');
  await op(page, 'Delete', '50');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Root \[30 70\]\. Depth 1: \[10 20\] \[40 60\] \[80 90\]/,
  );
  await expect(page.locator('.vars')).toContainText(/borrows\s*1/);
  await page.getByRole('button', { name: 'Back to the previous operation' }).click();
  for (let i = 0; i < 6; i++) {
    if ((await narration(page).textContent())?.includes('Case 3a')) break;
    await page.getByRole('button', { name: 'Step forward' }).click();
  }
  await expect(narration(page)).toContainText(
    'Case 3a: its right sibling [70 80 90] has 3 ≥ t = 3 keys',
  );
});

test('splitting on the way back up changes the pseudocode and the tree', async ({ page }) => {
  await fast(page);
  await option(page, 't = 2: 1 to 3 keys per node (a 2-3-4 tree)');
  await op(page, 'Insert', '10 20 30 40 50 60 70 80 5');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /height 2\. Root \[40\]/);
  await option(page, 'On the way back up, after it overflows');
  await expect(page.locator('.code')).toContainText('while x.n == 2t');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /height 1\. Root \[30 60\]/);
});

test('a twenty-key tree with t = 2 stays readable', async ({ page }) => {
  await fast(page);
  await option(page, 't = 2: 1 to 3 keys per node (a 2-3-4 tree)');
  await op(page, 'Insert', '15 82 47 3 66 29 91 54 8 73 38 60 21 95 12 44 77 33 58 86');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /20 keys/);
  // Every key label is drawn at least 9 CSS pixels tall, phone included. Measure again until the
  // last step has finished animating.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^-?\d+$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await settled(page);
  await expect.poll(async () => (await heights()).length).toBeGreaterThanOrEqual(20);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(9);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a practice set grades an answer and shows it on the tree', async ({ page }) => {
  await page.goto('/b-tree/#practice=24680&n=5');
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
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /A B-tree of minimum degree \d/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Delete from a leaf' }).first().click();
  await expect(page.getByText('Loaded "Case 1: delete from a leaf"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText(/search\(|found it|not in the tree/);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-merge and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await op(page, 'Insert', '10 20 30 40 50 60 70 80 90');
    await op(page, 'Delete', '30');
    await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
