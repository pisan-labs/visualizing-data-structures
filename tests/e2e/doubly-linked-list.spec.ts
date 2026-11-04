import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, button: string, text?: string) {
  if (text !== undefined) await page.getByLabel('Value or index').fill(text);
  await page.getByRole('button', { name: button, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/doubly-linked-list/');
  await expect(page.getByRole('heading', { name: 'Doubly linked list' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('starts with a sentinel and links nodes both ways', async ({ page }) => {
  await expect(narration(page)).toContainText('sentinel, nil');
  await op(page, 'Insert at tail', '10 20');
  await expect(narration(page)).toContainText('20 is at the back', { timeout: 10_000 });
  await expect(stage(page)).toHaveAttribute('aria-label', /nil ⇄ 10 ⇄ 20 ⇄ nil/);
});

test('removes the tail without walking, in four pointer updates', async ({ page }) => {
  await op(page, 'Insert at tail', '1 2 3');
  await expect(narration(page)).toContainText('3 is at the back', { timeout: 10_000 });
  await op(page, 'Remove tail');
  await expect(narration(page)).toContainText('collected', { timeout: 10_000 });
  await expect(stage(page)).toHaveAttribute('aria-label', /nil ⇄ 1 ⇄ 2 ⇄ nil/);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('it is garbage');
  for (const line of ['cur.prev = null', 'cur.next = null', 'cur.next.prev = cur.prev']) {
    await page.getByRole('button', { name: 'Step back' }).click();
    await expect(page.locator('.code li.active')).toContainText(line);
  }
});

test('without a sentinel the pseudocode has the if statements', async ({ page }) => {
  await page.getByText('Options').click();
  await page.getByLabel('head and tail pointers').check();
  await expect(narration(page)).toContainText('head and tail are both null');
  await op(page, 'Insert at head', '5');
  await expect(stage(page)).toHaveAttribute('aria-label', /null ⇄ 5 ⇄ null/, {
    timeout: 10_000,
  });
  await op(page, 'Remove head');
  await expect(narration(page)).toContainText('collected', { timeout: 10_000 });
  await expect(page.locator('.code')).toContainText('if cur.prev == null');
});

test('get walks from the nearer end', async ({ page }) => {
  await op(page, 'Insert at tail', '10 20 30 40');
  await expect(narration(page)).toContainText('40 is at the back', { timeout: 10_000 });
  await op(page, 'Get (i)', '3');
  await expect(narration(page)).toContainText('Return cur.value = 40', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('back half');
});
