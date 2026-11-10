import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { axeFindings, settled } from './helpers';

/**
 * The offline app: the web app manifest, the service worker (src/pwa/sw.js) and the two notices
 * (src/ui/AppStatus.svelte). Every other spec runs with service workers blocked
 * (playwright.config.ts); the tests here that need the worker allow it. Each test has a fresh
 * browser context, so no worker or cache carries over from one test to the next.
 */

const dist = path.resolve('dist');
const status = (page: Page) => page.locator('.app-status');
const narration = (page: Page) => page.locator('.narration p');
const updateNotice = (page: Page) => status(page).getByText('A new version is ready.');

/** The worker as the build wrote it: its version, its app shell and every file it can keep. */
async function builtWorker(request: APIRequestContext) {
  const source = await (await request.get('/sw.js')).text();
  const list = (name: string) =>
    JSON.parse(
      new RegExp(`const ${name} = (\\[[^;]*\\]);`).exec(source)![1]!.replace(/,\s*\]$/, ']'),
    );
  return {
    version: /const VERSION = '([0-9a-f]+)';/.exec(source)![1]!,
    shell: list('SHELL') as string[],
    files: (list('FILES') as [string, number][]).map(([url]) => url),
  };
}

/** Wait until the worker is active and controls the page (so the app shell is kept). */
async function installed(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          return reg?.active?.state === 'activated' && navigator.serviceWorker.controller !== null;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
}

/** The version of the worker that controls the page. */
function controllerVersion(page: Page): Promise<unknown> {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (e) => resolve(e.data);
        navigator.serviceWorker.controller?.postMessage({ type: 'version' }, [channel.port2]);
        setTimeout(() => resolve(null), 3000);
      }),
  );
}

/**
 * The built site on a server of the test's own, so a test can ship "the next deploy" of the
 * worker: after `ship(edit)`, /sw.js is served edited. (Playwright's routing does not see the
 * browser's update checks for a worker, so the edit has to come from a real server.) It runs on
 * its own port, so its worker and caches are apart from every other test's.
 */
async function serveBuild(extra: Record<string, string> = {}) {
  let edit: (source: string) => string = (source) => source;
  const requests: string[] = [];
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json',
  };
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    requests.push(pathname);
    if (pathname in extra) {
      res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(extra[pathname]);
      return;
    }
    const file = path.join(dist, pathname.endsWith('/') ? `${pathname}index.html` : pathname);
    if (!file.startsWith(dist) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    const body = fs.readFileSync(file);
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(pathname === '/sw.js' ? edit(body.toString('utf8')) : body);
  });
  await new Promise<void>((done) => server.listen(0, 'localhost', done));
  return {
    url: `http://localhost:${(server.address() as AddressInfo).port}`,
    ship: (f: (source: string) => string) => (edit = f),
    /** Every address asked for since the last call. */
    requested: () => requests.splice(0),
    close: () => new Promise((done) => server.close(done)),
  };
}

/** Make the browser look for a new worker now, as it does on its own from time to time. */
async function checkForUpdate(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
}

/** The paths of every file in StepWise's caches. */
async function kept(page: Page): Promise<string[]> {
  return (await cachedUrls(page, 'stepwise-')).map((u) => new URL(u).pathname);
}

/** Wait until StepWise's caches hold all of `paths`. */
async function keptSoon(page: Page, paths: string[]): Promise<void> {
  await expect
    .poll(async () => {
      const have = new Set(await kept(page));
      return paths.filter((p) => !have.has(p));
    })
    .toEqual([]);
}

/** Every address in StepWise's caches named `prefix`. */
function cachedUrls(page: Page, prefix: string): Promise<string[]> {
  return page.evaluate(async (prefix) => {
    const urls: string[] = [];
    for (const key of await caches.keys())
      if (key.startsWith(prefix))
        for (const r of await (await caches.open(key)).keys()) urls.push(r.url);
    return urls.sort();
  }, prefix);
}

async function axeInEveryTheme(page: Page): Promise<void> {
  for (const theme of ['light', 'dark', 'contrast']) {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results), theme).toEqual([]);
  }
}

const saveButton = (page: Page) =>
  page.getByRole('button', { name: 'Make every page available offline' });
const allSaved = (page: Page) => page.getByText('Every page is available offline on this device.');

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('every page links the manifest, which names the app and its icons', async ({ request }) => {
  const { version } = await builtWorker(request);
  for (const path of ['/', '/stack-array/', '/bst/']) {
    const html = await (await request.get(path)).text();
    expect(html, path).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html, path).toContain(`<meta name="stepwise-build" content="${version}" />`);
  }
  const res = await request.get('/manifest.webmanifest');
  expect(res.headers()['content-type']).toContain('application/manifest+json');
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: 'StepWise', start_url: '/', display: 'standalone' });
  expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    const file = await request.get(icon.src);
    expect(file.status(), icon.src).toBe(200);
    expect(file.headers()['content-type'], icon.src).toContain(icon.type);
  }
  expect((await request.get('/sw.js')).headers()['content-type']).toContain('javascript');
});

test('other specs run without the service worker', async ({ page, context }) => {
  // playwright.config.ts blocks service workers; only the tests below allow them.
  await page.goto('/stack-array/');
  await expect(page.getByRole('heading', { name: 'Stack (array)' })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations())).toHaveLength(0);
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  expect(context.serviceWorkers()).toHaveLength(0);
});

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' });

  test('the offline notice is quiet, fits the screen and passes axe', async ({ page, context }) => {
    await page.goto('/stack-array/');
    await installed(page);
    await expect(status(page)).toBeEmpty();
    await context.setOffline(true);
    await expect(status(page)).toHaveText('Offline: pages you have opened still work');
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await axeInEveryTheme(page);
    // Lectures and handouts get the drawing only.
    await page.evaluate(() => document.documentElement.classList.add('presenting'));
    await expect(status(page)).toBeHidden();
    await page.evaluate(() => document.documentElement.classList.remove('presenting'));
    await context.setOffline(false);
    await expect(status(page)).toBeEmpty();
  });

  test('offline, a page never opened says so and links home', async ({ page, context }) => {
    await page.goto('/');
    await installed(page);
    await context.setOffline(true);
    await page.goto('/avl/');
    await expect(
      page.getByRole('heading', { name: 'This page has not been saved for offline use yet' }),
    ).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await axeInEveryTheme(page);
    await page.getByRole('link', { name: 'See all visualizations' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('one step at a time');
  });

  test('"Make every page available offline" downloads the rest, with its size and progress', async ({
    page,
    context,
    request,
  }) => {
    // It downloads every page (about 490 files), then scans all three themes twice and browses
    // offline: well past the default 30 s on CI's runners, though each step is quick.
    test.setTimeout(180_000);
    const { files } = await builtWorker(request);
    await page.goto('/');
    await installed(page);
    await expect(saveButton(page)).toBeVisible();
    await expect(page.locator('.offline-download')).toContainText(
      /about \d+(\.\d)? MB to download/,
    );
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await axeInEveryTheme(page);
    await saveButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel(/Saving every page for offline use/)).toBeVisible();
    await expect(allSaved(page)).toBeVisible({ timeout: 60_000 });
    await keptSoon(page, files);
    // Done for this build: it says so on the next visit too.
    await page.reload();
    await expect(allSaved(page)).toBeVisible();
    await expect(saveButton(page)).toHaveCount(0);
    await axeInEveryTheme(page);

    await context.setOffline(true);
    await expect(status(page)).toHaveText('Offline: every page still works');
    await page.goto('/avl/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('AVL tree');
    await page.goto('/bst/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Binary search tree');
  });

  test.describe('desktop', () => {
    test.skip(({ isMobile }) => isMobile, 'Desktop Chromium covers the worker itself');

    test('install keeps only the app shell, and a page opened since works offline', async ({
      page,
      context,
      request,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const { shell, files } = await builtWorker(request);
      await page.goto('/');
      await installed(page);
      await keptSoon(page, shell);
      // Besides the shell, only what the home page itself loaded (its thumbnails): no page and
      // no page's chunk.
      const loaded = await page.evaluate(() =>
        performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname),
      );
      expect((await kept(page)).filter((p) => !shell.includes(p) && !loaded.includes(p))).toEqual(
        [],
      );
      expect((await kept(page)).filter((p) => files.includes(p)).length).toBeLessThan(20);

      await page.goto('/stack-array/');
      await expect(page.getByRole('heading', { name: 'Stack (array)' })).toBeVisible();
      await keptSoon(page, ['/stack-array/']);
      await context.setOffline(true);
      await page.goto('/stack-array/');
      await expect(page.getByRole('heading', { name: 'Stack (array)' })).toBeVisible();
      await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
      await page.getByLabel('Value').fill('10 20');
      await page.getByRole('button', { name: 'Push', exact: true }).click();
      await expect(narration(page)).toContainText('20 is now the top of the stack');
      await expect(status(page)).toHaveText('Offline: pages you have opened still work');
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Stack (array)' })).toBeVisible();
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('one step at a time');
      await page.goto('/no-such-page/');
      await expect(page.getByRole('heading', { name: 'Not here yet' })).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('the first page opened, before the worker, is kept too', async ({ page, context }) => {
      await page.goto('/bst/');
      await installed(page);
      await keptSoon(page, ['/bst/']);
      // Its chunk too: every script the page loaded.
      const scripts = await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .map((e) => new URL(e.name).pathname)
          .filter((p) => p.startsWith('/assets/')),
      );
      await keptSoon(page, scripts);
      await context.setOffline(true);
      await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Binary search tree');
    });

    test('with Save-Data on, nothing downloads unasked, and the button still works', async ({
      page,
      context,
      request,
    }) => {
      const { files } = await builtWorker(request);
      const site = await serveBuild();
      try {
        // Save-Data as the page sees it, and as the worker does (Playwright cannot set it there).
        await context.addInitScript(() =>
          Object.defineProperty(navigator, 'connection', {
            value: { saveData: true },
            configurable: true,
          }),
        );
        site.ship((source) =>
          source.replace(/const saveData = [^;]+;/, 'const saveData = () => true;'),
        );
        await page.goto(`${site.url}/stack-array/`);
        await installed(page);
        await page.waitForTimeout(1500);
        expect(await kept(page)).toEqual([]);

        // A page fetched anyway is kept; the shell was never fetched for its own sake.
        await page.goto(`${site.url}/`);
        await expect(saveButton(page)).toBeVisible();
        await saveButton(page).click();
        await expect(allSaved(page)).toBeVisible({ timeout: 60_000 });
        await keptSoon(page, files);
      } finally {
        await site.close();
      }
    });

    test('a new build tops up only what it changed for a reader who saved every page', async ({
      page,
    }) => {
      const changed = '/assets/zz-changed-for-the-test.js';
      const site = await serveBuild({ [changed]: 'export {};' });
      try {
        await page.goto(`${site.url}/`);
        await installed(page);
        await saveButton(page).click();
        await expect(allSaved(page)).toBeVisible({ timeout: 60_000 });
        const old = await controllerVersion(page);
        const next = old === 'f'.repeat(16) ? 'e'.repeat(16) : 'f'.repeat(16);
        // The next build: another version, and one hashed file that is new.
        site.ship((source) =>
          source
            .replace(`const VERSION = '${old}';`, `const VERSION = '${next}';`)
            .replace('const FILES = [', `const FILES = [\n  ["${changed}", 20],`),
        );
        site.requested();
        await checkForUpdate(page);
        await expect(updateNotice(page)).toBeVisible({ timeout: 30_000 });
        await Promise.all([
          page.waitForEvent('load'),
          page.getByRole('button', { name: 'Reload' }).click(),
        ]);
        await expect.poll(() => controllerVersion(page)).toBe(next);
        await expect(allSaved(page)).toBeVisible({ timeout: 60_000 });
        // Every hashed file the old build kept was carried over: only the new one was fetched.
        expect(site.requested().filter((p) => p.startsWith('/assets/'))).toEqual([changed]);
      } finally {
        await site.close();
      }
    });

    test('never intercepts or caches another origin', async ({ page, context }) => {
      let hits = 0;
      const server = http.createServer((_req, res) => {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-store',
        });
        res.end(`hit ${++hits}`);
      });
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
      const other = `http://127.0.0.1:${(server.address() as AddressInfo).port}/rest/v1/examples`;
      try {
        await page.goto('/');
        await installed(page);
        const call = (method: string) =>
          page.evaluate(
            ([url, method]) =>
              fetch(url!, { method, body: method === 'POST' ? 'x' : undefined }).then(
                (r) => r.text(),
                () => 'failed',
              ),
            [other, method],
          );
        for (const [method, answer] of [
          ['GET', 'hit 1'],
          ['POST', 'hit 2'],
        ]) {
          const response = page.waitForResponse((r) => r.url() === other);
          expect(await call(method!)).toBe(answer);
          expect((await response).fromServiceWorker(), method).toBe(false);
        }
        // A request to the site itself does go through the worker.
        const own = page.waitForResponse((r) => r.url().endsWith('/previews.json'));
        await page.evaluate(() => fetch('/previews.json').then((r) => r.ok));
        expect((await own).fromServiceWorker()).toBe(true);

        const origins = new Set((await cachedUrls(page, '')).map((u) => new URL(u).origin));
        expect([...origins]).toEqual([new URL(page.url()).origin]);
        await context.setOffline(true);
        expect(await call('GET')).toBe('failed');
        expect(hits).toBe(2);
      } finally {
        server.close();
      }
    });

    test('offers a reload when a newer version is waiting, and reloads only when asked', async ({
      page,
    }) => {
      const site = await serveBuild();
      try {
        await page.goto(`${site.url}/stack-array/`);
        await installed(page);
        const old = await controllerVersion(page);
        expect(old).toMatch(/^[0-9a-f]{16}$/);
        const next = old === 'f'.repeat(16) ? 'e'.repeat(16) : 'f'.repeat(16);
        // The next deploy's worker: the same file with another version.
        site.ship((source) =>
          source.replace(`const VERSION = '${old}';`, `const VERSION = '${next}';`),
        );
        await page.evaluate(() => Object.assign(window, { notReloaded: true }));
        await checkForUpdate(page);
        await expect(updateNotice(page)).toBeVisible({ timeout: 30_000 });
        // Nothing happens on the reader's behalf: same page, old worker.
        await page.waitForTimeout(500);
        expect(await page.evaluate(() => 'notReloaded' in window)).toBe(true);
        expect(await controllerVersion(page)).toBe(old);
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        for (const theme of ['light', 'dark', 'contrast']) {
          await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
          await settled(page);
          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze();
          expect(axeFindings(results), theme).toEqual([]);
        }

        // Dismissed, it stays away until the next page load, which finds the worker waiting.
        await page.getByRole('button', { name: 'Dismiss' }).click();
        await expect(updateNotice(page)).toBeHidden();
        await page.reload();
        await expect(updateNotice(page)).toBeVisible({ timeout: 10_000 });
        expect(await controllerVersion(page)).toBe(old);

        // Reload, from the keyboard.
        const reload = page.getByRole('button', { name: 'Reload' });
        await reload.focus();
        await expect(reload).toBeFocused();
        await page.evaluate(() => Object.assign(window, { notReloaded: true }));
        await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
        await expect.poll(() => controllerVersion(page)).toBe(next);
        expect(await page.evaluate(() => 'notReloaded' in window)).toBe(false);
        await expect(page.getByRole('heading', { name: 'Stack (array)' })).toBeVisible();
        await page.waitForTimeout(500);
        await expect(updateNotice(page)).toBeHidden();
      } finally {
        await site.close();
      }
    });

    test("a waiting worker of the page's own build takes over quietly", async ({ page }) => {
      const site = await serveBuild();
      try {
        await page.goto(`${site.url}/`);
        await installed(page);
        const version = await controllerVersion(page);
        // Other bytes, same version: the page already is what the worker would bring.
        site.ship((source) => `${source}\n// same build\n`);
        await page.evaluate(() => {
          const w = window as unknown as { changes: number; notReloaded: boolean };
          w.changes = 0;
          w.notReloaded = true;
          navigator.serviceWorker.addEventListener('controllerchange', () => w.changes++);
        });
        await checkForUpdate(page);
        await expect
          .poll(() => page.evaluate(() => (window as unknown as { changes: number }).changes), {
            timeout: 30_000,
          })
          .toBe(1);
        expect(await controllerVersion(page)).toBe(version);
        await page.waitForTimeout(500);
        await expect(updateNotice(page)).toBeHidden();
        expect(await page.evaluate(() => 'notReloaded' in window)).toBe(true);
      } finally {
        await site.close();
      }
    });

    test('the kill switch removes the worker and its caches, and offers nothing', async ({
      page,
    }) => {
      const site = await serveBuild();
      try {
        await page.goto(`${site.url}/stack-array/`);
        await installed(page);
        expect(await cachedUrls(page, 'stepwise-')).not.toEqual([]);
        site.ship(() => fs.readFileSync('scripts/sw-kill.js', 'utf8'));
        await page.evaluate(() => Object.assign(window, { notReloaded: true }));
        await checkForUpdate(page);
        await expect
          .poll(() => page.evaluate(() => navigator.serviceWorker.getRegistrations()), {
            timeout: 30_000,
          })
          .toHaveLength(0);
        expect(await cachedUrls(page, 'stepwise-')).toEqual([]);
        await page.waitForTimeout(3500);
        await expect(updateNotice(page)).toBeHidden();
        expect(await page.evaluate(() => 'notReloaded' in window)).toBe(true);
        // The next visit comes from the network, and the page registers the kill switch again,
        // which goes away again.
        await page.reload();
        await expect(page.getByRole('heading', { name: 'Stack (array)' })).toBeVisible();
        await expect
          .poll(() => page.evaluate(() => navigator.serviceWorker.getRegistrations()), {
            timeout: 30_000,
          })
          .toHaveLength(0);
      } finally {
        await site.close();
      }
    });

    test('embeds do not install the app', async ({ page }) => {
      await page.goto('/stack-array/#embed=1');
      await expect(page.getByRole('heading', { name: 'Stack (array)' })).toBeVisible();
      await page.waitForTimeout(1500);
      expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations())).toHaveLength(0);
    });
  });
});
