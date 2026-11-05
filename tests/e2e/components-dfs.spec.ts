import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Graph or vertex', { exact: true });

async function open(page: Page, id: string) {
  await page.goto(`/${id}/`);
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

async function option(page: Page, label: string) {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel(label).check();
  await page.getByText('Options', { exact: true }).click();
}

test('topological sort orders the DAG, puts G in front, and stops at a cycle', async ({ page }) => {
  await open(page, 'topo-dfs');
  await page.getByRole('button', { name: 'Sort', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('L = A, C, B, E, F, D, G');
  await load(page, 'A>B, A>D, B>C, C>F, D>C, D>E, E>F, G>D, G>E');
  await page.getByRole('button', { name: 'Sort', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('L = G, A, D, E, B, C, F');
  await expect(stage(page)).toHaveAttribute('aria-label', /L = G, A, D, E, B, C, F/);
  await load(page, 'A>B, A>E, B>C, C>D, D>B, E>D');
  await page.getByRole('button', { name: 'Sort', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('the cycle B → C → D → B');
});

test('SCC finds four components either way', async ({ page }) => {
  await open(page, 'scc');
  await page.getByRole('button', { name: 'Find SCCs', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText(
    '4 strongly connected components, {A, B, E}, {C, D}, {F, G} and { H }',
  );
  await expect(page.locator('.vars')).toContainText(/SCCs\s*4/);
  await option(page, 'Tarjan: one DFS with low-links and a stack');
  await page.getByRole('button', { name: 'Find SCCs', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('{ H }, {F, G}, {C, D} and {A, B, E}');
});

test('cut vertices and bridges, with the root rule', async ({ page }) => {
  await open(page, 'bridges');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'cut vertices C, D, F and G, and 3 bridges, C-D, F-G and G-H',
  );
  await load(page, 'A-B, A-C, B-C, A-D, A-E, D-E');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('one cut vertex, A, and no bridges');
});
