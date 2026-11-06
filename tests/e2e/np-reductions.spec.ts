import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/np-reductions/');
  await expect(page.getByRole('heading', { name: 'NP-completeness reductions map' })).toBeVisible();
});

test('starts on the map', async ({ page }) => {
  await expect(stage(page)).toHaveAttribute('aria-label', /Map of reductions/);
  await expect(stage(page)).toContainText('SET-COVER');
});

test('3-SAT to IND-SET builds triangles and carries the certificate', async ({ page }) => {
  await fast(page);
  await button(page, 'To IND-SET').click();
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'In each triangle, take a vertex whose literal is true',
  );
  await expect(page.locator('.vars')).toContainText(/answer\s*"yes"/);
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /INDEPENDENT-SET: a graph with 9 vertices/,
  );
});

test('an unsatisfiable formula maps to a no', async ({ page }) => {
  await fast(page);
  await page.locator('#op-input').fill('(a), (!a | b), (!b | c), (!c)');
  await button(page, 'Load').click();
  await button(page, 'To IND-SET').click();
  await toEnd(page);
  await expect(narration(page)).toContainText('no maps to no');
  await expect(page.locator('.vars')).toContainText(/answer\s*"no"/);
});

test('the chain goes on to V-COVER and SET-COVER', async ({ page }) => {
  await fast(page);
  await page.locator('#op-input').fill('a | b | !c, !a | !b, b | c');
  await button(page, 'Load').click();
  await button(page, 'To IND-SET').click();
  await button(page, 'To V-COVER').click();
  await button(page, 'To SET-COVER').click();
  await toEnd(page);
  await expect(narration(page)).toContainText('Yes maps to yes');
  await expect(stage(page)).toHaveAttribute('aria-label', /SET-COVER: universe \{1, …, 9\}/);
});

test('a graph goes to CLIQUE through the complement', async ({ page }) => {
  await fast(page);
  await page.locator('#op-input').fill('A-B, B-C, C-D, D-A, A-C k=2');
  await button(page, 'Load').click();
  await button(page, 'To CLIQUE').click();
  await toEnd(page);
  await expect(narration(page)).toContainText('a clique of size 2');
  await expect(page.locator('.vars')).toContainText(/E\s*1k/);
});

test('a reduction that cannot start here says why', async ({ page }) => {
  await button(page, 'To SET-COVER').click();
  await expect(narration(page)).toContainText('starts from VERTEX-COVER');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question has a Show me that plays the answer', async ({ page }) => {
  await page.goto('/np-reductions/#practice=31415&n=4');
  const first = page.locator('.question').first();
  await expect(first).toBeVisible();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations on the map and mid-reduction (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    const scan = async () => {
      await settled(page);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    };
    await scan();
    await fast(page);
    await button(page, 'To IND-SET').click();
    await toEnd(page);
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await scan();
  });
}
