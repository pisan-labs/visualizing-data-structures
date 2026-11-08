import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function build(page: Page, list: string) {
  await page.getByLabel('Level order', { exact: true }).fill(list);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** Answer the first practice question by reading the answer a wrong try reveals. */
async function answerFirst(page: Page) {
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
  return first;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/binary-tree/');
  await expect(page.getByRole('heading', { name: 'Binary tree and traversals' })).toBeVisible();
});

test('builds a tree from a level-order list with gaps', async ({ page }) => {
  await fast(page);
  await build(page, '1 2 3 _ 5');
  await toEnd(page);
  await expect(narration(page)).toContainText('4 nodes, height 2');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /The root is 1\. 1 has left 2 and right 3\. 2 has right 5\./,
  );
  await expect(page.locator('.vars')).toContainText(/size\s*4/);
});

test('a list that is not a tree is refused and the tree stays', async ({ page }) => {
  await build(page, '1 2 3');
  await toEnd(page);
  await build(page, '1 _ _ 4');
  await expect(page.getByRole('alert')).toContainText('"4" has no node above it');
  await expect(stage(page)).toHaveAttribute('aria-label', /3 nodes/);
});

test('preorder shows the call stack and the output', async ({ page }) => {
  await fast(page);
  await build(page, '1 2 3 4 5 _ 6');
  await toEnd(page);
  await page.getByRole('button', { name: 'Preorder', exact: true }).click();
  await expect(stage(page).locator('text', { hasText: 'call stack' })).toBeVisible();
  await toEnd(page);
  await expect(narration(page)).toContainText('Preorder: 1 2 4 5 3 6.');
  await expect(page.locator('.vars')).toContainText('1 2 4 5 3 6');
  // The side column stays inside the page while code and variables are showing.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the iterative setting swaps the code and keeps the order', async ({ page }) => {
  await fast(page);
  await build(page, '4 2 6 1 3 5 7');
  await toEnd(page);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Iterative (an explicit stack keeps track)').check();
  await page.getByRole('button', { name: 'Inorder', exact: true }).click();
  await expect(page.locator('.code')).toContainText('S.push(x)');
  await expect(stage(page).locator('text', { hasText: 'stack S' })).toBeVisible();
  await toEnd(page);
  await expect(narration(page)).toContainText('Inorder: 1 2 3 4 5 6 7.');
});

test('level order shows the queue', async ({ page }) => {
  await fast(page);
  await build(page, '1 2 3 4 5 6 7');
  await toEnd(page);
  await page.getByRole('button', { name: 'Level order', exact: true }).click();
  await expect(stage(page).locator('text', { hasText: 'queue' })).toBeVisible();
  await toEnd(page);
  await expect(narration(page)).toContainText('Level order: 1 2 3 4 5 6 7.');
});

test('empty children can be drawn as squares', async ({ page }) => {
  await build(page, '1 2 3');
  await toEnd(page);
  await expect(stage(page).locator('rect.null')).toHaveCount(0);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Draw empty children (nil) as small squares').check();
  await expect(stage(page).locator('rect.null')).toHaveCount(4);
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Show me' }).first().click();
  await expect(page).toHaveURL(/\/binary-tree\//);
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(narration(page)).toContainText('preorder');
  await expect(stage(page)).toHaveAttribute('aria-label', /6 nodes/);
});

test('a practice set grades an answer and shows it on the tree', async ({ page }) => {
  await page.goto('/binary-tree/#practice=24680&n=5');
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.question')).toHaveCount(5);
  const first = await answerFirst(page);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /A binary tree with \d+ nodes/);
});

test('concept page links load examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Four ways to walk one tree' }).first().click();
  await expect(page.getByText('Loaded "Four ways to walk one tree"')).toBeVisible();
  await expect(stage(page)).toHaveAttribute('aria-label', /6 nodes/);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-traversal (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await build(page, '1 2 3 4 5');
    await toEnd(page);
    await page.getByRole('button', { name: 'Postorder', exact: true }).click();
    await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
