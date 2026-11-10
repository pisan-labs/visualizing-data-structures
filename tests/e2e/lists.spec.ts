/**
 * Lesson lists (src/lists): building one from the Examples panel, editing it in "My lesson
 * lists", and playing it from its link, page to page and in Present mode. Every Supabase
 * endpoint is mocked (./supabase-mock.ts, ./lists-mock.ts).
 */
import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { axeFindings, settled } from './helpers';
import { itemRow, listRow } from './lists-mock';
import { accountsOn, mockSupabase, row, SESSION, storedSession, type Mock } from './supabase-mock';

const bar = (page: Page) => page.getByRole('navigation', { name: 'Lesson list' });
const stage = (page: Page) => page.locator('.stage > svg');
const header = (page: Page) => page.locator('header.site');
const accountList = (page: Page) => page.getByRole('list', { name: 'Saved in your account' });

const stack = (ops: [string, number][]) => ({
  format: 1,
  viz: 'stack-array',
  settings: {},
  seed: 1,
  ops,
});
const queue = (ops: [string, number][]) => ({
  format: 1,
  viz: 'queue-array',
  settings: {},
  seed: 1,
  ops,
});

/** Three examples in the account and a shared list of them, with a note on the first. */
function classData() {
  const rows = [
    row({
      viz: 'stack-array',
      title: 'Three pushes',
      example: stack([
        ['push', 7],
        ['push', 8],
        ['push', 9],
      ]),
    }),
    row({
      viz: 'queue-array',
      title: 'Two in a queue',
      example: queue([
        ['enqueue', 10],
        ['enqueue', 20],
      ]),
    }),
    row({ viz: 'stack-array', title: 'One push', example: stack([['push', 4]]) }),
  ];
  const list = listRow({ title: 'Week 3', notes: 'Stacks, then queues', shared: true });
  const items = [
    itemRow({
      list_id: list.id,
      example_id: rows[0]!.id,
      position: 0,
      note: 'Ask: what comes out first?',
    }),
    itemRow({ list_id: list.id, example_id: rows[1]!.id, position: 1 }),
    itemRow({ list_id: list.id, example_id: rows[2]!.id, position: 2 }),
  ];
  const secret = listRow({ title: 'Private list', shared: false });
  return { rows, list, items, secret };
}

const callsTo = (mock: Mock, pathname: string) =>
  mock.calls.filter((c) => c.url.pathname === pathname);

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** No sideways scrolling, also with the wide font CI falls back to. */
async function fits(page: Page) {
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.addStyleTag({
    content: ":root { --font: 'DejaVu Sans', Verdana, sans-serif !important; }",
  });
  expect(await overflow(page)).toBeLessThanOrEqual(0);
}

function pageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test.describe('playing a list, signed out', () => {
  test.beforeEach(async ({ page }) => {
    await accountsOn(page);
  });

  test('its link opens the first example; Next and Previous move page to page', async ({
    page,
  }) => {
    const errors = pageErrors(page);
    const { rows, list, items, secret } = classData();
    const mock = await mockSupabase(page, { rows, lists: [list, secret], items });
    await page.goto(`/#list=${list.id}`);

    await expect(page).toHaveURL(new RegExp(`/stack-array/#.*list=${list.id}&item=1`));
    await expect(page.getByRole('heading', { name: 'Stack (array)' })).toBeVisible();
    await expect(bar(page)).toContainText('Lesson list: Week 3, 1 of 3: Three pushes');
    await expect(bar(page)).toContainText('Ask: what comes out first?');
    await expect(stage(page)).toHaveAttribute('aria-label', /From bottom to top: 7, 8, 9/);
    await expect(bar(page).getByRole('button', { name: '← Previous' })).toBeDisabled();
    // The page moves without reloading (so Present mode and full screen carry on).
    await page.evaluate(() => ((window as unknown as { stay: number }).stay = 1));

    await bar(page).getByRole('button', { name: 'Next →' }).click();
    await expect(page).toHaveURL(new RegExp(`/queue-array/#.*list=${list.id}&item=2`));
    await expect(page.getByRole('heading', { name: 'Queue (circular array)' })).toBeVisible();
    await expect(bar(page)).toContainText('2 of 3: Two in a queue');
    await expect(stage(page)).toHaveAttribute('aria-label', /From front to rear: 10, 20/);
    expect(await page.evaluate(() => (window as unknown as { stay?: number }).stay)).toBe(1);

    await bar(page).getByRole('button', { name: 'Next →' }).click();
    await expect(bar(page)).toContainText('3 of 3: One push');
    await expect(stage(page)).toHaveAttribute('aria-label', /From bottom to top: 4\.$/);
    await expect(bar(page).getByRole('button', { name: 'Next →' })).toBeDisabled();
    await bar(page).getByRole('button', { name: '← Previous' }).click();
    await expect(bar(page)).toContainText('2 of 3: Two in a queue');

    // Back and Forward walk the list too.
    await page.goBack();
    await expect(bar(page)).toContainText('3 of 3: One push');
    await page.goBack();
    await expect(bar(page)).toContainText('2 of 3');
    await page.goBack();
    await expect(bar(page)).toContainText('1 of 3: Three pushes');
    await expect(stage(page)).toHaveAttribute('aria-label', /From bottom to top: 7, 8, 9/);
    await page.goForward();
    await expect(bar(page)).toContainText('2 of 3');
    expect(await page.evaluate(() => (window as unknown as { stay?: number }).stay)).toBe(1);

    // The list was read once, through the function; the tables were never asked.
    expect(callsTo(mock, '/rest/v1/rpc/shared_lesson_list')).toHaveLength(1);
    expect(callsTo(mock, '/rest/v1/rpc/shared_lesson_list')[0]?.body).toEqual({ p_id: list.id });
    expect(mock.calls.filter((c) => c.url.pathname.startsWith('/rest/v1/lesson_'))).toEqual([]);
    expect(mock.calls.filter((c) => c.url.pathname === '/rest/v1/saved_examples')).toEqual([]);

    // A reload keeps the place in the list, and the example as the reader left it.
    await page.waitForFunction(() => location.hash.includes('ex='));
    await page.reload();
    await expect(bar(page)).toContainText('2 of 3: Two in a queue');
    await expect(stage(page)).toHaveAttribute('aria-label', /From front to rear: 10, 20/);

    await settled(page);
    const results = await new AxeBuilder({ page })
      .include('nav.list-bar')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
    await fits(page);

    // Leaving the list keeps the example and drops the list from the address.
    await bar(page).getByRole('button', { name: 'Leave the list' }).click();
    await expect(bar(page)).toHaveCount(0);
    await expect(stage(page)).toHaveAttribute('aria-label', /From front to rear: 10, 20/);
    await page.getByRole('button', { name: 'Step back' }).click();
    await expect.poll(() => page.url()).not.toContain('list=');
    expect(errors).toEqual([]);
  });

  test('Present mode keeps the bar, compact, and < and > move through the list', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Phones have no keyboard shortcuts');
    const { rows, list, items } = classData();
    await mockSupabase(page, { rows, lists: [list], items });
    await page.goto(`/#list=${list.id}`);
    await expect(bar(page)).toContainText('1 of 3');
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Exit presentation' })).toBeVisible();
    await expect(header(page)).toBeHidden();
    await expect(bar(page)).toBeVisible();
    await expect(bar(page)).toHaveClass(/compact/);
    // The list's notes are folded away while presenting.
    await expect(bar(page).getByText('About this list')).toHaveCount(0);

    await page.locator('h1').click();
    await page.keyboard.press('>');
    await expect(bar(page)).toContainText('2 of 3: Two in a queue');
    await expect(page.getByRole('heading', { name: 'Queue (circular array)' })).toBeVisible();
    // Still presenting on the next page, with no site header.
    await expect(page.getByRole('button', { name: 'Exit presentation' })).toBeVisible();
    await expect(header(page)).toBeHidden();
    await expect(bar(page)).toHaveClass(/compact/);
    await page.locator('h1').click();
    await page.keyboard.press('>');
    await expect(bar(page)).toContainText('3 of 3');
    await page.keyboard.press('>');
    await expect(bar(page)).toContainText('3 of 3');
    await page.keyboard.press('<');
    await expect(bar(page)).toContainText('2 of 3');
    await expect(page.getByRole('button', { name: 'Exit presentation' })).toBeVisible();

    // The shortcuts list shows the two keys while a list plays.
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).toContainText('Lesson list');
    await expect(dialog.locator('tr[data-shortcut="list-next"]')).toContainText('>');
    await expect(dialog.locator('tr[data-shortcut="list-previous"]')).toContainText('<');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Present', exact: true })).toBeVisible();
    await expect(header(page)).toBeVisible();
    await expect(bar(page)).not.toHaveClass(/compact/);

    // Typing in a field leaves the keys alone.
    await page.getByLabel('Value', { exact: true }).fill('1>');
    await expect(bar(page)).toContainText('2 of 3');
  });

  test('a private, missing or deleted list says so plainly', async ({ page }) => {
    const { rows, list, items, secret } = classData();
    const mock = await mockSupabase(page, { rows, lists: [list, secret], items });
    const plain =
      'This lesson list is not available. Its owner may have deleted it or stopped sharing it.';
    for (const id of [secret.id, '1a000000-0000-4000-8000-0000000000ff']) {
      await page.goto('about:blank');
      await page.goto(`/#list=${id}`);
      await expect(page.getByRole('alert')).toHaveText(plain);
      await expect(page.getByRole('link', { name: 'See all visualizations' })).toBeVisible();
    }
    const before = mock.calls.length;
    await page.goto('about:blank');
    await page.goto('/#list=not-an-id');
    await expect(page.getByRole('alert')).toHaveText(plain);
    expect(mock.calls.length).toBe(before);

    // A page of a list that went away: the page works, and the bar says why.
    await page.goto('about:blank');
    await page.goto(`/stack-array/#list=${secret.id}&item=2`);
    await expect(bar(page).getByRole('alert')).toHaveText(plain);
    await expect(page.getByRole('heading', { name: 'Stack (array)' })).toBeVisible();
    await bar(page).getByRole('button', { name: 'Leave the list' }).click();
    await expect(bar(page)).toHaveCount(0);

    // A list that shrank since its link was made stays within it.
    await page.goto('about:blank');
    await page.goto(`/stack-array/#list=${list.id}&item=9`);
    await expect(bar(page)).toContainText('3 of 3: One push');
    await expect(stage(page)).toHaveAttribute('aria-label', /From bottom to top: 4\.$/);
  });
});

test.describe('lists with accounts off or signed out', () => {
  test('accounts off: the link says why, and nothing is sent', async ({ page }) => {
    const mock = await mockSupabase(page);
    await page.goto('/#list=1a000000-0000-4000-8000-000000000001');
    await expect(page.getByRole('alert')).toHaveText(
      'This link opens a lesson list saved in an account, and accounts are not available here.',
    );
    await page.goto('/#lists');
    await expect(page.getByText('accounts are not available on this site')).toBeVisible();
    await page.goto('/stack-array/#list=1a000000-0000-4000-8000-000000000001&item=1');
    await expect(bar(page).getByRole('alert')).toContainText('accounts are not available here');
    expect(mock.calls).toEqual([]);
  });

  test('signed out, My lesson lists asks to sign in and loads nothing', async ({ page }) => {
    await accountsOn(page);
    const mock = await mockSupabase(page);
    await page.goto('/#lists');
    await expect(page.getByRole('heading', { name: 'My lesson lists' })).toBeVisible();
    await expect(page.getByText('Sign in (at the top of the page) to make one.')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(mock.calls).toEqual([]);
    expect(mock.chunks).toEqual([]);
    // The catalog is still one click away.
    await page.getByRole('link', { name: 'StepWise home' }).click();
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('My lesson lists');
  });
});

test.describe('building lists, signed in', () => {
  test.beforeEach(async ({ page }) => {
    await accountsOn(page);
    await storedSession(page);
  });

  test('add examples from the Examples panel, edit the list, play it, delete it', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors = pageErrors(page);
    const { rows } = classData();
    const mock = await mockSupabase(page, { rows });
    await page.goto('/stack-array/');
    await page.getByRole('tab', { name: 'Examples' }).click();
    const list = accountList(page);
    await expect(list.getByRole('listitem')).toHaveCount(2);

    // The first example makes a new list; the second goes into it.
    await list.getByRole('button', { name: 'Add Three pushes to a lesson list' }).click();
    const picker = page.getByRole('form', { name: 'Add Three pushes to a lesson list' });
    await expect(picker.getByLabel('Name of the new list')).toBeFocused();
    await picker.getByLabel('Name of the new list').fill('Week 3');
    await picker.getByRole('button', { name: 'Make the list and add' }).click();
    await expect(page.getByText('Added "Three pushes" to "Week 3".')).toBeVisible();
    await expect(picker).toHaveCount(0);
    await expect(
      list.getByRole('button', { name: 'Add Three pushes to a lesson list' }),
    ).toBeFocused();
    expect(mock.lists.map((l) => l.title)).toEqual(['Week 3']);

    await list.getByRole('button', { name: 'Add One push to a lesson list' }).click();
    const second = page.getByRole('form', { name: 'Add One push to a lesson list' });
    await expect(second.getByLabel('Lesson list')).toHaveValue(mock.lists[0]!.id);
    await expect(second.getByLabel('Lesson list')).toContainText('Week 3 (1)');
    await second.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Added "One push" to "Week 3".')).toBeVisible();
    expect(mock.items.map((i) => i.position)).toEqual([0, 1]);

    await settled(page);
    const panel = await new AxeBuilder({ page })
      .include('#panel-examples')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(panel)).toEqual([]);

    // The queue example goes in from its own page.
    await page.goto('/queue-array/');
    await page.getByRole('tab', { name: 'Examples' }).click();
    await accountList(page)
      .getByRole('button', { name: 'Add Two in a queue to a lesson list' })
      .click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Added "Two in a queue" to "Week 3".')).toBeVisible();

    // My lesson lists, from the account menu.
    await header(page).locator('summary', { hasText: 'Account' }).click();
    await header(page).getByRole('link', { name: 'My lesson lists' }).click();
    await expect(page).toHaveURL(/\/#lists$/);
    await expect(page.getByRole('heading', { name: 'My lesson lists' })).toBeVisible();
    const card = page
      .getByRole('list', { name: 'Your lesson lists' })
      .getByRole('listitem')
      .first();
    await expect(card).toContainText('Week 3');
    await expect(card).toContainText('3 examples · Private');

    // A private list plays for its owner.
    await card.getByRole('link', { name: 'Play Week 3' }).click();
    await expect(bar(page)).toContainText('Lesson list: Week 3, 1 of 3: Three pushes');
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'My lesson lists' })).toBeVisible();

    await card.getByRole('button', { name: 'Edit Week 3' }).click();
    const items = card.getByRole('list', { name: 'Examples, in the order they play' });
    await expect(items.getByRole('listitem')).toHaveCount(3);
    await expect(items.getByRole('listitem').nth(1)).toContainText('2. Stack (array): One push');
    await expect(items.getByRole('listitem').nth(2)).toContainText(
      '3. Queue (circular array): Two in a queue',
    );

    // Reorder by keyboard: the queue goes up one, and keeps the focus.
    const up = items.getByRole('button', { name: 'Move Two in a queue up' });
    await up.focus();
    await page.keyboard.press('Enter');
    await expect(items.getByRole('listitem').nth(1)).toContainText('Two in a queue');
    await expect(up).toBeFocused();
    const ordered = () =>
      [...mock.items]
        .sort((a, b) => a.position - b.position)
        .map((i) => mock.rows.find((r) => r.id === i.example_id)?.title);
    expect(ordered()).toEqual(['Three pushes', 'Two in a queue', 'One push']);
    const reorder = callsTo(mock, '/rest/v1/rpc/reorder_lesson_list')[0];
    expect((reorder?.body as { p_items: string[] }).p_items).toHaveLength(3);
    await page.keyboard.press('Enter');
    await expect(items.getByRole('listitem').first()).toContainText('Two in a queue');
    // At the top, Up is off and the focus moves to Down.
    await expect(up).toBeDisabled();
    await expect(items.getByRole('button', { name: 'Move Two in a queue down' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(items.getByRole('listitem').nth(1)).toContainText('Two in a queue');
    await expect.poll(ordered).toEqual(['Three pushes', 'Two in a queue', 'One push']);

    // A note for one example, and the list's name and notes.
    await items.getByLabel('Note while it plays').first().fill('Ask: what comes out first?');
    await items.getByRole('button', { name: 'Save the note for Three pushes' }).click();
    await expect(page.getByText('Saved the note.')).toBeVisible();
    expect(mock.items.find((i) => i.position === 0)?.note).toBe('Ask: what comes out first?');
    await card.getByLabel('Name', { exact: true }).fill('Week 3: stacks and queues');
    await card.getByLabel('Notes about the list').fill('For Tuesday');
    await card.getByRole('button', { name: 'Save name and notes' }).click();
    await expect(card.getByRole('heading', { name: 'Week 3: stacks and queues' })).toBeVisible();
    expect(mock.lists[0]).toMatchObject({
      title: 'Week 3: stacks and queues',
      notes: 'For Tuesday',
    });

    // Take one out.
    await items.getByRole('button', { name: 'Take One push out of the list' }).click();
    await expect(items.getByRole('listitem')).toHaveCount(2);
    await expect(card).toContainText('2 examples');
    expect(mock.rows.some((r) => r.title === 'One push')).toBe(true);

    // Share it and copy its link.
    await card.getByRole('checkbox', { name: 'Shared: Week 3: stacks and queues' }).check();
    await expect.poll(() => mock.lists[0]?.shared).toBe(true);
    await card.getByRole('button', { name: 'Copy link to Week 3: stacks and queues' }).click();
    const link = page.getByLabel('Link to the lesson list');
    await expect(link).toHaveValue(new URL(`/#list=${mock.lists[0]!.id}`, page.url()).href);

    await settled(page);
    const editor = await new AxeBuilder({ page })
      .include('.lesson-lists')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(editor)).toEqual([]);
    await fits(page);

    // Deleting a saved example takes it out of the list, and the page says so first.
    await page.goto('/queue-array/');
    await page.getByRole('tab', { name: 'Examples' }).click();
    await accountList(page).getByRole('button', { name: 'Delete Two in a queue' }).click();
    await expect(accountList(page)).toContainText('It also comes out of any lesson list it is in.');
    await accountList(page).getByRole('button', { name: 'Delete it' }).click();
    await expect(accountList(page).getByRole('listitem')).toHaveCount(0);
    await page.goto('/#lists');
    const again = page
      .getByRole('list', { name: 'Your lesson lists' })
      .getByRole('listitem')
      .first();
    await expect(again).toContainText('1 example · Shared');

    // Delete the list, after a confirmation that can be declined.
    await again.getByRole('button', { name: 'Delete Week 3: stacks and queues' }).click();
    await again.getByRole('button', { name: 'Keep it' }).click();
    await expect(
      again.getByRole('button', { name: 'Delete Week 3: stacks and queues' }),
    ).toBeFocused();
    await again.getByRole('button', { name: 'Delete Week 3: stacks and queues' }).click();
    await expect(again).toContainText('Its examples stay in your account.');
    await again.getByRole('button', { name: 'Delete it' }).click();
    await expect(page.getByText('No lesson lists yet.')).toBeVisible();
    expect(mock.lists).toEqual([]);
    expect(mock.rows.map((r) => r.title).sort()).toEqual(['One push', 'Three pushes']);
    expect(errors).toEqual([]);
  });

  test('a full list and an unreachable server fail with a plain message', async ({ page }) => {
    const { rows } = classData();
    const full = listRow({ title: 'Full' });
    const items = Array.from({ length: 100 }, (_, i) =>
      itemRow({ list_id: full.id, example_id: rows[0]!.id, position: i }),
    );
    await mockSupabase(page, { rows, lists: [full], items });
    await page.goto('/stack-array/');
    await page.getByRole('tab', { name: 'Examples' }).click();
    await accountList(page).getByRole('button', { name: 'Add One push to a lesson list' }).click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.locator('.notice.error')).toHaveText(
      'A lesson list holds at most 100 examples. Remove some, or start another list.',
    );
  });
});

/**
 * Pictures of a playing list, Present mode and My lesson lists for a person to look at, at
 * device scale 1 on a laptop and a phone, light and dark. Runs only when LISTS_SHOTS names a
 * folder to write them to.
 */
test('screenshots', async ({ browser }, info) => {
  const dir = process.env.LISTS_SHOTS;
  test.skip(!dir || info.project.name !== 'desktop', 'Set LISTS_SHOTS to a folder to take them');
  test.setTimeout(120_000);
  const sizes = {
    laptop: { viewport: { width: 1366, height: 768 } },
    phone: { ...devices['Pixel 7'] },
  };
  for (const [name, device] of Object.entries(sizes)) {
    for (const theme of ['light', 'dark'] as const) {
      const context = await browser.newContext({
        ...device,
        deviceScaleFactor: 1,
        colorScheme: theme,
      });
      const page = await context.newPage();
      await accountsOn(page);
      await page.addInitScript((session) => {
        localStorage.setItem('stepwise:auth', JSON.stringify(session));
      }, SESSION);
      const { rows, list, items } = classData();
      await mockSupabase(page, {
        rows,
        lists: [
          list,
          listRow({ title: 'Week 4: trees, with a longer name that wraps on a phone' }),
        ],
        items,
      });
      await page.goto(`/#list=${list.id}`);
      await expect(bar(page)).toContainText('1 of 3');
      await settled(page);
      await page.screenshot({ path: path.join(dir!, `bar-${name}-${theme}.png`) });
      if (name === 'laptop') {
        await page.getByRole('button', { name: 'Present', exact: true }).click();
        await bar(page).getByRole('button', { name: 'Next →' }).click();
        await expect(bar(page)).toContainText('2 of 3');
        await settled(page);
        await page.screenshot({ path: path.join(dir!, `present-${name}-${theme}.png`) });
        await page.keyboard.press('Escape');
      }
      await page.goto('/#lists');
      const card = page
        .getByRole('list', { name: 'Your lesson lists' })
        .getByRole('listitem')
        .first();
      await card.getByRole('button', { name: /^Edit / }).click();
      await expect(card.getByRole('list')).toBeVisible();
      await page.screenshot({
        path: path.join(dir!, `lists-${name}-${theme}.png`),
        fullPage: true,
      });
      await page.goto('/stack-array/');
      await page.getByRole('tab', { name: 'Examples' }).click();
      await accountList(page)
        .getByRole('button', { name: 'Add Three pushes to a lesson list' })
        .click();
      await page.locator('#save-heading').scrollIntoViewIfNeeded();
      await page
        .locator('#panel-examples')
        .screenshot({ path: path.join(dir!, `add-${name}-${theme}.png`) });
      await context.close();
    }
  }
  expect(fs.readdirSync(dir!).length).toBeGreaterThanOrEqual(14);
});
