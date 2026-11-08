import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Language, string, split or i', { exact: true });

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function press(page: Page, name: string, text?: string) {
  if (text !== undefined) await input(page).fill(text);
  await page.getByRole('button', { name, exact: true }).click();
}

async function option(page: Page, label: string) {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel(label).check();
  await page.getByText('Options', { exact: true }).click();
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.beforeEach(async ({ page }) => {
  await page.goto('/pumping-lemma/');
  await expect(
    page.getByRole('heading', { name: 'The pumping lemma game', exact: true }),
  ).toBeVisible();
});

test('aᵖbᵖ beats every split, and i = 2 wins the game', async ({ page }) => {
  await fast(page);
  await press(page, 'String', 'aaaabbbb');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'The adversary tried all 10 legal splits, and none survives every i from 0 to 5. It picks x = ε, y = a, z = a³b⁴',
  );
  await press(page, 'Pump', '2');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    "xy²z = a⁵b⁴ is not in L: it has 5 a's and 4 b's. You win this game. One game proves nothing by itself",
  );
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /xy²z = a⁵b⁴, not in L\. You win this game\./,
  );
  await expect(stage(page).locator('text', { hasText: '✗ not in L' })).toHaveCount(1);
});

test('a string shorter than p, and a split you choose yourself, are explained', async ({
  page,
}) => {
  await press(page, 'String', 'ab');
  await expect(narration(page)).toContainText(
    's = ab is in L, but |s| = 2 is less than p = 4. The lemma only promises a split for strings at least p long',
  );
  await press(page, 'Split', 'aaa|ab|bbb');
  await expect(narration(page)).toContainText('In this role the adversary splits s, not you.');
});

test('on a regular language the adversary always survives', async ({ page }) => {
  await fast(page);
  await press(page, 'Language', '(ab)*');
  await press(page, 'String', 'abababab');
  await press(page, 'Pump', '0');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'xy⁰z = (ab)³ is in L: it is ab repeated 3 times. The adversary wins this game.',
  );
  await expect(narration(page)).toContainText('the lemma only works one way');
});

test('in the adversary’s role you split the page’s string', async ({ page }) => {
  await option(page, 'You defend: pick p and the split');
  await expect(narration(page)).toContainText('The page picks s = a⁴b⁴.');
  await fast(page);
  await press(page, 'Split', 'aa|a|abbbb');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    "The page picks i = 0: xy⁰z = a³b⁴ is not in L, because it has 3 a's and 4 b's. The page wins this game.",
  );
  await press(page, 'Split', 'aaa|ab|bbb');
  await expect(narration(page)).toContainText('|xy| = 5 is more than p = 4');
  await press(page, 'Language', '(ab)*');
  await press(page, 'Split', 'ε|ab|ababab');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'No i from 0 to 5 pumps s out of L: your split survives, and you win this game.',
  );
});

test('the context-free lemma pumps aⁿbⁿ on both sides', async ({ page }) => {
  await option(page, 'Context-free: s = uvxyz, |vxy| ≤ p, |vy| ≥ 1');
  await expect(page.locator('.code')).toContainText(
    'adversary: “L is context-free”, so it picks p ≥ 1',
  );
  await fast(page);
  await press(page, 'String', 'aaabbb');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'survive every i from 0 to 5. It picks u = ε, v = a, x = aa, y = b, z = bb.',
  );
  await expect(narration(page)).toContainText('No i can beat that split');
});

test('bad input is explained', async ({ page }) => {
  await press(page, 'String', 'xyz');
  await expect(page.getByRole('alert')).toContainText(
    '"xyz" is not a language, string, split or number on this page.',
  );
  await press(page, 'Language', 'aaaa');
  await expect(narration(page)).toContainText('"aaaa" is not a language on this page.');
});

test('a 20-symbol string pumped five times stays readable and fits', async ({ page }) => {
  await fast(page);
  await press(page, 'Language', 'ww');
  await press(page, 'String', 'abababababababababab');
  await press(page, 'Pump', '5');
  await toEnd(page);
  await expect(narration(page)).toContainText('xy⁵z');
  // Every symbol on a cell is at least 8 CSS pixels tall. Poll: the pump is still animating.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^[ab]$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await settled(page);
  await expect.poll(async () => (await heights()).length).toBeGreaterThanOrEqual(40);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(8);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  // CI's default font (DejaVu Sans) is wider: the page must still fit.
  await page.addStyleTag({
    content: ":root { --font: 'DejaVu Sans', Verdana, sans-serif !important; }",
  });
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  // Text in the drawing stays inside it, so rows wrap rather than run off the edge.
  const outside = await stage(page).evaluate((svg) => {
    const box = svg.getBoundingClientRect();
    return Array.from(svg.querySelectorAll('text'))
      .map((t) => t.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1)).length;
  });
  expect(outside).toBe(0);
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/pumping-lemma/#practice=24680&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\.(\s|$)/)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /Pumping game on L = /);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations mid-game (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await press(page, 'Language', 'paren');
    await press(page, 'String', '(((())))');
    await press(page, 'Pump', '2');
    await toEnd(page);
    await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
