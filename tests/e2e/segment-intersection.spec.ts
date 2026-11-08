import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function loadExample(page: Page, title: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Load' })
    .click();
}

async function load(page: Page, segs: string) {
  await page.getByLabel('Segments', { exact: true }).fill(segs);
  await page.getByRole('button', { name: 'Load segments', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/segment-intersection/');
  await expect(
    page.getByRole('heading', { name: 'Segment intersection (sweep line)' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('the CLRS sweep stops at the first intersection', async ({ page }) => {
  await load(page, '1,2 9,8 2,10 10,3 0,6 5,5 6,1 11,2');
  await page.getByRole('button', { name: 'Sweep', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('Yes: A and C intersect at (5, 5)');
  await expect(page.locator('.code')).toContainText('ANY-SEGMENTS-INTERSECT(S)');
});

test('Bentley–Ottmann reports every crossing', async ({ page }) => {
  await loadExample(page, 'Report every crossing');
  await toEnd(page);
  await expect(narration(page)).toContainText('2 intersection points');
  await expect(narration(page)).toContainText('A and B at (6.46, 6.1)');
  await expect(page.locator('.code')).toContainText('BENTLEY-OTTMANN(S)');
});

test('vertical segments are refused with a reason', async ({ page }) => {
  await load(page, '1,2 1,8');
  await expect(page.getByRole('alert')).toContainText('vertical');
});

test('the status and the event queue are drawn', async ({ page }) => {
  await loadExample(page, 'Three segments through one point');
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(stage(page).locator('text', { hasText: 'event queue' })).toBeVisible();
  await expect
    .poll(async () => {
      const box = await stage(page).boundingBox();
      return box ? box.width > 200 && box.height > 150 : false;
    })
    .toBe(true);
});

test('a concept check answers and Show me plays an example', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  const check = page.locator('.check').filter({ hasText: 'Which pair is tested?' });
  await check.getByRole('button', { name: 'A and B', exact: true }).click();
  await expect(check).toContainText('Yes.');
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('practice questions grade and Show me plays the answer', async ({ page }) => {
  await page.goto('/segment-intersection/#practice=7&n=3');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations during the sweep (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await loadExample(page, 'Report every crossing');
    for (let i = 0; i < 16; i++) await page.getByRole('button', { name: 'Step forward' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
