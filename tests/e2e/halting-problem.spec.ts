import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Program and input', { exact: true });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const svgText = (page: Page, text: string | RegExp) =>
  stage(page).locator('text', { hasText: text });

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function run(page: Page, text: string) {
  await input(page).fill(text);
  await button(page, 'Run').click();
}

async function options(page: Page, set: (page: Page) => Promise<void>) {
  await page.getByText('Options', { exact: true }).click();
  await set(page);
  await page.getByText('Options', { exact: true }).click();
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.beforeEach(async ({ page }) => {
  await page.goto('/halting-problem/');
  await expect(
    page.getByRole('heading', { name: 'The halting problem', exact: true }),
  ).toBeVisible();
});

test('the page opens on the built table, every cell from a run', async ({ page }) => {
  await expect(narration(page)).toContainText(
    'The table is built: 16 runs, 9 halted and 7 looped.',
  );
  const counter = page.locator('.narration .muted');
  await expect(counter).toHaveText(/^Step (\d+) of \1$/);
  await expect(svgText(page, /^acc$/)).toHaveCount(7);
  await expect(svgText(page, /^∞$/)).toHaveCount(7);
  await expect(svgText(page, /^rej$/)).toHaveCount(2);
  await expect(stage(page)).toHaveAttribute('aria-label', /M3: ∞, acc, ∞, acc/);
  await page.getByRole('slider', { name: 'Timeline' }).press('Home');
  await settled(page);
  await expect(svgText(page, /^acc$/)).toHaveCount(0);
});

test('Diagonalize flips the diagonal, and D on ⟨D⟩ refutes both answers', async ({ page }) => {
  await fast(page);
  await button(page, 'Diagonalize').click();
  await toEnd(page);
  await expect(narration(page)).toContainText("D's row is rej, acc, acc, acc.");
  await expect(narration(page)).toContainText('so D is none of M1 to M4');
  await button(page, 'D on ⟨D⟩').click();
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Both answers are impossible, so nothing can go in that cell.',
  );
  await expect(narration(page)).toContainText('no Turing machine decides A_TM');
  await expect(stage(page)).toHaveAttribute('aria-label', /D on ⟨D⟩: impossible either way\./);
  await expect(svgText(page, /^\?$/)).toHaveCount(1);
  await expect(svgText(page, 'If D accepts ⟨D⟩')).toHaveCount(1);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Say D does not accept ⟨D⟩.');
});

test('Run walks one program through a description and catches the loop', async ({ page }) => {
  await fast(page);
  await run(page, '3 3');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Before step 24, M3 is on line 3 with the head on cell 9 again, just as before step 23.',
  );
  await expect(svgText(page, 'loops: step 24 repeats step 23')).toHaveCount(1);
  await expect(svgText(page, /^3 {2}if end goto 3$/)).toHaveCount(1);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Step 23: line 3, if end goto 3');
});

test('the HALT version shows halt and ∞, and D loops where Mi halts', async ({ page }) => {
  await options(page, (p) => p.getByLabel('HALT: does M halt on w?').check());
  await expect(svgText(page, /^halt$/)).toHaveCount(9);
  await fast(page);
  await button(page, 'Diagonalize').click();
  await toEnd(page);
  await expect(narration(page)).toContainText("D's row is ∞, halt, halt, ∞.");
});

test('the reduction answers every cell through the other decider', async ({ page }) => {
  await fast(page);
  await page.getByText('More operations', { exact: true }).click();
  await button(page, 'Reduce').click();
  await toEnd(page);
  await expect(narration(page)).toContainText('S decides A_TM');
  await expect(svgText(page, /^∞$/)).toHaveCount(0);
  await expect(svgText(page, 'If R decided HALT')).toHaveCount(1);
});

test('bad input is explained', async ({ page }) => {
  await run(page, '9 1');
  await expect(page.getByRole('alert')).toContainText('"9" is not a program number.');
  await run(page, '3');
  await expect(page.getByRole('alert')).toContainText('Run needs a program and an input');
  await run(page, '6 1');
  await expect(narration(page)).toContainText('M6 is not in this table: it has 4 programs.');
});

test('six programs and a 40-step run stay readable and fit', async ({ page }) => {
  await options(page, async (p) => {
    const size = p.getByLabel('Programs in the table');
    await size.fill('6');
    await size.press('Enter');
  });
  await fast(page);
  await toEnd(page);
  await expect(narration(page)).toContainText('The table is built: 36 runs');
  await run(page, '6 5');
  await toEnd(page);
  await expect(narration(page)).toContainText('M6 accepts ⟨M5⟩ after 40 steps.');
  // Every cell's value is at least 9 CSS pixels tall. Poll: the run may still be animating.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^(acc|rej|∞)$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await expect.poll(async () => (await heights()).length).toBeGreaterThanOrEqual(36);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(9);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  // CI's default font (DejaVu Sans) is wider: the page must still fit, and the panel's rows
  // must wrap rather than run off the drawing.
  await page.addStyleTag({
    content: ":root { --font: 'DejaVu Sans', Verdana, sans-serif !important; }",
  });
  for (const step of ['back', 'home']) {
    if (step === 'home') await page.getByRole('slider', { name: 'Timeline' }).press('Home');
    else await page.getByRole('button', { name: 'Back to the previous operation' }).click();
    await settled(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const outside = await stage(page).evaluate((svg) => {
      const box = svg.getBoundingClientRect();
      return Array.from(svg.querySelectorAll('text'))
        .map((t) => t.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1)).length;
    });
    expect(outside).toBe(0);
  }
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(stage(page)).toHaveAttribute('aria-label', /Panel: M3 on ⟨M3⟩/);
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/halting-problem/#practice=24680&n=4');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /Table of \d toy programs/);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations mid-argument (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await button(page, 'Diagonalize').click();
    await button(page, 'D on ⟨D⟩').click();
    await toEnd(page);
    await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    let results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await run(page, '4 2');
    await toEnd(page);
    await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
