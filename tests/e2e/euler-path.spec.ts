import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
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

test.beforeEach(async ({ page }) => {
  await page.goto('/euler-path/');
  await expect(
    page.getByRole('heading', { name: 'Euler paths (Hierholzer)', exact: true }),
  ).toBeVisible();
});

test('Find traces the house from D to E', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Find Euler path', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('Euler path: D → B → A → C → B → E → C → D → E');
  await expect(page.locator('.vars')).toContainText(/used\s*8(?!\d)/);
});

test('a detour is spliced into the circuit', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Detail' }).selectOption({ label: 'Every detail' });
  await fast(page);
  await loadExample(page, 'Stuck early, then a detour is spliced in');
  await toEnd(page);
  await expect(narration(page)).toContainText('Euler circuit: A → B → C → D → E → C → A');
  await expect(stage(page)).toHaveAttribute('aria-label', /Circuit: A, B, C, D, E, C, A\./);
});

test('Königsberg is refused with the reason', async ({ page }) => {
  await fast(page);
  await loadExample(page, 'The seven bridges of Königsberg');
  await toEnd(page);
  await expect(narration(page)).toContainText('No Euler path. 4 vertices (A, B, C and D)');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded', async ({ page }) => {
  await page.goto('/euler-path/#practice=2468&n=4');
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
});

test('the drawing stays readable and in the page', async ({ page }) => {
  await fast(page);
  await loadExample(page, 'Two detours from two places');
  await toEnd(page);
  await settled(page);
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height).filter((h) => h > 0));
  await expect.poll(async () => (await heights()).length).toBeGreaterThan(20);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(7);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-walk (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await page.getByRole('combobox', { name: 'Detail' }).selectOption({ label: 'Every detail' });
    await fast(page);
    await loadExample(page, 'Two detours from two places');
    await toEnd(page);
    for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
