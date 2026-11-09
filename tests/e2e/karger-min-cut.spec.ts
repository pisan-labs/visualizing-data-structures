import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Graph or edge', { exact: true });

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/karger-min-cut/');
  await expect(page.getByRole('heading', { name: "Karger's min cut", exact: true })).toBeVisible();
});

test('opens on one random trial, ended at two super-vertices', async ({ page }) => {
  // The page's seed is random, so the trial may or may not find the bridge.
  await expect(narration(page)).toContainText('Two super-vertices are left');
  await expect(narration(page)).toContainText('The minimum cut has');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Cut: \d+ edges?\. Minimum cut: 1 edge\./,
  );
  await expect.poll(() => stage(page).locator('.arrow.role-error').count()).toBeGreaterThan(0);
});

test('the bridge example finds the minimum cut', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText('so this trial found one', { timeout: 60_000 });
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Super-vertices: \{A, B, C, D\}, \{E, F, G, H\}/,
  );
  await expect(stage(page).locator('.arrow.role-error')).toHaveCount(1);
});

test('contracting by hand keeps the parallel edges', async ({ page }) => {
  await page.goto(emptyStart('karger-min-cut'));
  await fast(page);
  for (const e of ['A-B', 'A-C']) {
    await input(page).fill(e);
    await page.getByRole('button', { name: 'Contract edge', exact: true }).click();
  }
  await toEnd(page);
  await expect(narration(page)).toContainText('{A, B} and { C } become {A, B, C}');
  await expect(stage(page)).toHaveAttribute('aria-label', /Super-vertices: \{A, B, C\}, \{ D \}/);
  // A-D, B-D and C-D are three parallel edges from the box to D.
  await input(page).fill('A-B');
  await page.getByRole('button', { name: 'Contract edge', exact: true }).click();
  await expect(narration(page)).toContainText('already in the same super-vertex');
});

test('many trials beat the bound', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Run trials', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('100 trials: a minimum cut (1 edge) came up');
  await expect(narration(page)).toContainText('against the bound of at least 3.6%');
  await expect(stage(page).getByText('cut sizes in 100 trials')).toBeVisible();
});

test('the shuffle setting changes the pseudocode', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Shuffle once, skip self-loops (Kruskal style)').check();
  await page.getByText('Options', { exact: true }).click();
  await expect(page.locator('.code')).toContainText('shuffle the edges of G');
  await fast(page);
  await page.getByRole('button', { name: 'Random trial', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('Two super-vertices are left');
});

test('a directed graph is refused with a reason', async ({ page }) => {
  await input(page).fill('A>B, B>C');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(narration(page)).toContainText('type an undirected graph');
});

test('a practice question can be shown', async ({ page }) => {
  await page.goto('/karger-min-cut/#practice=24680&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

test('the page fits the screen', async ({ page }) => {
  await settled(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await page.getByRole('button', { name: 'Random trial', exact: true }).click();
    await toEnd(page);
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
