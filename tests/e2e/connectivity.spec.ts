/** Connected components, the bipartite check and topological sort by in-degree. */
import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Graph or vertex', { exact: true });

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function load(page: Page, text: string) {
  await input(page).fill(text);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test('connected components numbers every piece', async ({ page }) => {
  await page.goto('/connected-components/');
  await fast(page);
  await load(page, 'A-B, A-C, B-D, C-D, E-F, G-H, H-I, G-I');
  await page.getByRole('button', { name: 'Find components', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText(
    '3 components: 1: A, B, C and D; 2: E and F; 3: G, H and I.',
  );
  await expect(stage(page)).toHaveAttribute('aria-label', /component 3: G, H, I/);
  // Each vertex carries its component number in a badge.
  await expect.poll(() => stage(page).locator('text', { hasText: /^#3$/ }).count()).toBe(3);
});

test('the bipartite check shows the odd cycle', async ({ page }) => {
  await page.goto('/bipartite/');
  await fast(page);
  await load(page, 'A-B, A-C, B-D, C-E, D-E, E-F');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('Not bipartite. The odd cycle D → B → A → C → E → D');
  await expect(stage(page)).toHaveAttribute('aria-label', /odd cycle D, B, A, C, E/);
});

test('topological sort finds an order and then a cycle', async ({ page }) => {
  await page.goto('/topo-indegree/');
  await fast(page);
  await page.getByRole('button', { name: 'Sort', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('in the order: A, C, B, E, D, F, G.');
  await load(page, 'A>B, A>F, B>C, C>D, D>B, D>E');
  await page.getByRole('button', { name: 'Sort', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('B → C → D → B is a cycle');
});

test('the stage drawing stays readable', async ({ page }, info) => {
  for (const id of ['connected-components', 'bipartite', 'topo-indegree']) {
    await page.goto(`/${id}/`);
    await fast(page);
    const run = page.locator('form.controls button').nth(1);
    await run.click();
    await toEnd(page);
    // Vertex names are drawn at a readable size once the animation settles.
    await expect
      .poll(async () => {
        const box = await page.locator('.stage svg text').first().boundingBox();
        return box?.height ?? 0;
      })
      .toBeGreaterThan(8);
    if (process.env.SHOTS)
      await page.screenshot({ path: `${process.env.SHOTS}/${id}-${info.project.name}.png` });
  }
});
