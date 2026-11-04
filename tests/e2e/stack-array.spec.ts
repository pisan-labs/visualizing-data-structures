import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function push(page: Page, values: string) {
  await page.getByLabel('Value').fill(values);
  await page.getByRole('button', { name: 'Push', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('./#/stack-array');
  await expect(page.getByRole('heading', { name: 'Stack (array)' })).toBeVisible();
});

test('catalog links to the stack', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'Stack (array)' }).click();
  await expect(page).toHaveURL(/#\/stack-array/);
  await expect(narration(page)).toContainText('An empty stack');
});

test('push and pop play through with narration and pseudocode', async ({ page }) => {
  await fast(page);
  await push(page, '10 20 30');
  await expect(narration(page)).toContainText('30 is now the top of the stack', {
    timeout: 10_000,
  });
  await expect(stage(page)).toHaveAttribute('aria-label', /From bottom to top: 10, 20, 30/);

  await page.getByRole('button', { name: 'Pop', exact: true }).click();
  await expect(narration(page)).toContainText('Return A[2] = 30', { timeout: 10_000 });
  await expect(page.locator('.code li.active')).toContainText('return A[top]');
  await expect(page.locator('.vars')).toContainText('returned');
});

test('step back walks through earlier steps', async ({ page }) => {
  await fast(page);
  await push(page, '7');
  await expect(narration(page)).toContainText('7 is now the top', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Store 7 in A[0]');
  await expect(page.locator('.code li.active')).toContainText('A[top] = x');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('is there room?');
});

test('keyboard shortcuts step and play', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Phones have no keyboard shortcuts');
  await fast(page);
  await push(page, '1 2');
  await expect(narration(page)).toContainText('2 is now the top', { timeout: 10_000 });
  await page.locator('h1').click();
  await page.keyboard.press('ArrowLeft');
  await expect(narration(page)).toContainText('Store 2 in A[1]');
  await page.keyboard.press('ArrowRight');
  await expect(narration(page)).toContainText('2 is now the top');
});

test('the address bar holds the work, so a link reopens it', async ({ page, context }) => {
  await fast(page);
  await push(page, 'S T A');
  await expect(narration(page)).toContainText('"A" is now the top', { timeout: 10_000 });
  await expect(page).toHaveURL(/\?ex=z/);
  const url = page.url();

  const other = await context.newPage();
  await other.goto(url);
  await expect(other.locator('.stage > svg')).toHaveAttribute(
    'aria-label',
    /From bottom to top: S, T, A/,
  );
  await expect(other.locator('.narration p')).toContainText('"A" is now the top');
});

test('a curated example loads from the Examples tab', async ({ page }) => {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Overflow at capacity' })
    .getByRole('button', { name: 'Load' })
    .click();
  await expect(narration(page)).toContainText('capacity 4');
  for (let i = 0; i < 5; i++)
    await page.getByRole('button', { name: 'Forward to the next operation' }).click();
  await expect(narration(page)).toContainText('Stack overflow: 5 is not pushed.');
  await expect(page.locator('.narration')).toHaveClass(/error/);
});

test('concept page links load examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Reverse a word' }).click();
  await expect(page.getByText('Loaded "Reverse a word"')).toBeVisible();
  await expect(page).toHaveURL(/#\/stack-array/);
});

test('switching the meaning of top changes the code and replays', async ({ page }) => {
  await fast(page);
  await push(page, '4');
  await expect(narration(page)).toContainText('4 is now the top', { timeout: 10_000 });
  await page.getByText('Options').click();
  await page.getByLabel('Index of the top item (starts at -1)').check();
  await expect(page.locator('.vars')).toContainText(/top\s*0/);
  await page.getByRole('button', { name: 'push', exact: true }).click();
  await expect(page.locator('.code')).toContainText('if top == capacity - 1');
});

test('bad input and bad links get readable errors', async ({ page }) => {
  await push(page, 'waytoolong');
  await expect(page.getByRole('alert')).toContainText('6 characters');
  await page.goto('./#/stack-array?ex=zgarbage');
  await expect(page.getByRole('status')).toContainText('not a valid example');
});

test('history panel jumps and undoes', async ({ page }) => {
  await fast(page);
  await push(page, '1 2 3');
  await expect(narration(page)).toContainText('3 is now the top', { timeout: 10_000 });
  await page.getByRole('tab', { name: 'History' }).click();
  await page.getByRole('button', { name: '1. push(1)' }).click();
  await expect(stage(page)).toHaveAttribute('aria-label', /From bottom to top: 1\./);
  await page.getByRole('button', { name: 'Undo last operation' }).click();
  await expect(page.getByRole('button', { name: /3\. push\(3\)/ })).toHaveCount(0);
});

test('no horizontal scrolling, even with long lines of real code', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Show the code as' }).selectOption('java');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await push(page, '5');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}

test('catalog has no axe violations', async ({ page }) => {
  await page.goto('./');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test('embed mode hides the site chrome', async ({ page }) => {
  await page.goto('./#/stack-array?embed=1');
  await expect(page.getByRole('link', { name: /Open in/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Learn' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'All visualizations' })).toHaveCount(0);
});

test('Big-O self-test reveals answers and loads examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Big-O' }).click();
  await page.getByRole('button', { name: 'Reveal the worst case for push(x)' }).click();
  await expect(page.locator('.bigo')).toContainText('Even a full array costs one check');
  await page.getByRole('button', { name: 'Watch it' }).first().click();
  await expect(page.getByText('Loaded "Overflow at capacity"')).toBeVisible();
  await page.getByRole('button', { name: 'Show all' }).click();
  await expect(page.getByRole('button', { name: /^Reveal the/ })).toHaveCount(0);
});

test('code panel switches between pseudocode, plain English and real code', async ({ page }) => {
  const view = page.getByRole('combobox', { name: 'Show the code as' });
  await view.selectOption('plain');
  await expect(page.locator('.code')).toContainText('Put x in the first free slot.');
  await view.selectOption('python');
  await expect(page.locator('.code pre')).toContainText('class ArrayStack');
  await view.selectOption('java');
  await expect(page.locator('.code pre')).toContainText('public class ArrayStack');
  await view.selectOption('cpp');
  await expect(page.locator('.code pre')).toContainText('class ArrayStack');
  await view.selectOption('formal');
  await expect(page.locator('.code')).toContainText('A[top] = x');
});

test('a preset starts over and shows the result', async ({ page }) => {
  await page
    .getByLabel('Start over with', { exact: true })
    .selectOption({ label: 'The letters of a word' });
  await page.getByLabel('How many').selectOption('5');
  await page.getByRole('button', { name: 'Fill' }).click();
  await expect(stage(page)).toHaveAttribute('aria-label', /From bottom to top: A, L, G, O, R\./);
});

test('concept checks give feedback and Show me plays an example', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  const check = page.locator('.check').filter({ hasText: 'What is in' });
  await check.getByRole('button', { name: 'Nothing, pop erased it' }).click();
  await expect(check).toContainText('Not quite.');
  await check.getByRole('button', { name: 'Try again' }).click();
  await check.getByRole('button', { name: '2', exact: true }).click();
  await expect(check).toContainText('Yes.');
  await page.getByRole('link', { name: 'Show me' }).first().click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
});
