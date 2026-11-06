import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/suffix-tree/');
  await expect(page.getByRole('heading', { name: 'Suffix tree' })).toBeVisible();
});

test('Build puts the suffixes of BANANA$ in a tree', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('7 leaves');
  await expect(narration(page)).toContainText('3 internal nodes');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /\(\$ A\(\$ NA\(\$ NA\$\)\) BANANA\$ NA\(\$ NA\$\)\)/,
  );
});

test('Search finds both copies of ANA, building first', async ({ page }) => {
  await fast(page);
  await page.locator('#op-input').fill('ANA');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('at positions 1 and 3');
  await expect(page.locator('.vars')).toContainText(/found\s*"1 3"/);
});

test('Count and longest repeat in MISSISSIPPI', async ({ page }) => {
  await fast(page);
  await page.locator('#op-input').fill('MISSISSIPPI');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.locator('#op-input').fill('SS');
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText("'SS' occurs 2 times");
  await page.getByRole('button', { name: 'Longest repeat', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText("spells 'ISSI'");
});

test("Ukkonen's build gives the same tree", async ({ page }) => {
  await fast(page);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel("Ukkonen's online algorithm (active point, suffix links)").check();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText("Ukkonen's build");
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /\(\$ A\(\$ NA\(\$ NA\$\)\) BANANA\$ NA\(\$ NA\$\)\)/,
  );
  // Suffix links (ANA to NA, NA to A) are drawn dashed.
  await expect.poll(() => stage(page).locator('[stroke-dasharray]').count()).toBeGreaterThan(0);
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question has a Show me that plays the answer', async ({ page }) => {
  await page.goto('/suffix-tree/#practice=31415&n=4');
  const first = page.locator('.question').first();
  await expect(first).toBeVisible();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-build (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await toEnd(page);
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step back' }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
