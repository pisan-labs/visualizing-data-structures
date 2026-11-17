import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { axeFindings } from './helpers';

const at = '2026-11-15T00:00:00.000Z';
/** Progress with these pages finished (one lesson each, read). */
const finished = (ids: string[]) => ({
  version: 1,
  pages: Object.fromEntries(
    ids.map((id) => [
      id,
      {
        lessons: { one: { done: true, at } },
        checks: {},
        practice: {},
        outline: { lessons: ['one'], checks: [], at },
      },
    ]),
  ),
});

test('the home page links to a learning path, which leads to its first step', async ({ page }) => {
  await page.goto('/');
  const paths = page.getByRole('region', { name: 'Learning paths' });
  await paths.getByRole('link', { name: /A first data structures course/ }).click();
  await expect(page).toHaveURL(/\/path\/data-structures\/$/);
  await expect(page).toHaveTitle(/^A first data structures course · /);
  await expect(page.getByRole('progressbar', { name: 'Path progress' })).toHaveAttribute(
    'aria-valuenow',
    '0',
  );

  await page.getByRole('link', { name: /^Start: step 1, Memory model/ }).click();
  await expect(page).toHaveURL(/\/memory-model\/#.*path=data-structures/);
  const bar = page.getByRole('navigation', { name: 'Learning path' });
  await expect(bar).toContainText('step 1 of 19');
  // The step opens on its suggested example.
  await expect(page).toHaveURL(/#ex=/);

  await bar.getByRole('link', { name: /^Next: Big-O growth lab/ }).click();
  await expect(page).toHaveURL(/\/big-o-lab\/#.*path=data-structures/);
  await expect(page.getByRole('navigation', { name: 'Learning path' })).toContainText(
    'step 2 of 19',
  );

  await page.getByRole('button', { name: 'Leave the path' }).click();
  await expect(page.getByRole('navigation', { name: 'Learning path' })).toHaveCount(0);
  await expect(page).not.toHaveURL(/path=/);
});

test('a path shows the share of steps finished and the next step', async ({ page }) => {
  await page.addInitScript(
    (p) => localStorage.setItem('stepwise:progress', JSON.stringify(p)),
    finished(['memory-model', 'big-o-lab', 'dynamic-array', 'stack-array']),
  );
  await page.goto('/path/data-structures/');
  // 4 of 19 is 21%.
  await expect(page.getByRole('progressbar', { name: 'Path progress' })).toHaveAttribute(
    'aria-valuenow',
    '21',
  );
  await expect(page.getByText('4 of 19 steps done')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Continue: step 5, Queue/ })).toBeVisible();

  // The home page card shows it too.
  await page.goto('/');
  await expect(
    page
      .getByRole('region', { name: 'Learning paths' })
      .getByRole('progressbar', { name: 'A first data structures course: progress' }),
  ).toHaveAttribute('aria-valuenow', '21');
  // big-o-lab is a step of the tour too: 1 of its 10.
  await expect(
    page.getByRole('progressbar', { name: 'A tour for the curious: progress' }),
  ).toHaveAttribute('aria-valuenow', '10');

  // No horizontal scroll, on any viewport.
  await page.goto('/path/data-structures/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  const results = await new AxeBuilder({ page }).analyze();
  expect(axeFindings(results)).toEqual([]);
});

test('an unknown path says so', async ({ page }) => {
  await page.goto('/path/nope/');
  await expect(page.getByRole('heading', { name: 'Not here yet' })).toBeVisible();
});

test('the step bar passes axe', async ({ page }) => {
  await page.goto('/bst/#path=data-structures');
  await expect(page.getByRole('navigation', { name: 'Learning path' })).toContainText(
    'step 9 of 19',
  );
  const results = await new AxeBuilder({ page }).include('.path-bar').analyze();
  expect(axeFindings(results)).toEqual([]);
});

test('the credits under a page line up with its column, and a path page keeps a side margin', async ({
  page,
}) => {
  const lefts = async () =>
    page.evaluate(() => {
      const main = document.querySelector('main > *') as HTMLElement;
      const pad = parseFloat(getComputedStyle(main).paddingLeft);
      return {
        column: Math.round(main.getBoundingClientRect().left + pad),
        credits: Math.round(document.querySelector('footer.site p')!.getBoundingClientRect().left),
      };
    });
  for (const url of ['/path/llms/', '/', '/stack-array/']) {
    await page.goto(url);
    await expect(page.locator('footer.site p').first()).toBeVisible();
    const { column, credits } = await lefts();
    expect(Math.abs(column - credits), url).toBeLessThanOrEqual(1);
  }
  await page.goto('/path/llms/');
  const box = await page.getByRole('heading', { level: 1 }).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(16);
});
