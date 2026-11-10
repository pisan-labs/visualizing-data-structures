import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { BUILD_META } from './protocol';

/**
 * Build-time helpers for the service worker (src/pwa/sw.js). scripts/prerender.mjs lists the
 * files in dist, picks the ones a reader can keep for offline use with `offlineList` and the app
 * shell with `shellList`, and writes dist/sw.js with `serviceWorkerSource`. Nothing here runs in
 * the browser.
 */

/** Small files besides the pages and the hashed assets: thumbnails, manifest, icons. */
const SMALL = ['previews.json', 'manifest.webmanifest', 'favicon.svg', 'apple-touch-icon.png'];

export interface OfflineFile {
  /** The address the worker fetches and caches, such as /stack-array/. */
  url: string;
  /** The file in dist that serves it, such as stack-array/index.html. */
  path: string;
}

/**
 * Everything a reader needs to open every page offline: the home page, each page's own HTML,
 * every hashed file in assets/ (the app and each page's chunk), the catalog thumbnails and the
 * icons. The worker caches these as pages are opened, or all at once when the reader asks ("Make
 * every page available offline"). Left out: source maps, the per-page thumbnail frames
 * (previews/<id>.json, cached when a thumbnail first plays), the sitemap, robots.txt, the
 * link-preview image and the worker itself. `files` are paths relative to dist with forward
 * slashes, in any order; the result is sorted by address, so the same build gives the same list.
 */
export function offlineList(files: string[], pageIds: string[]): OfflineFile[] {
  const have = new Set(files);
  const missing = ['index.html', ...pageIds.map((id) => `${id}/index.html`)].filter(
    (f) => !have.has(f),
  );
  if (missing.length) throw new Error(`Missing from dist: ${missing.join(', ')}`);
  const pages = new Map(pageIds.map((id) => [`${id}/index.html`, `/${id}/`]));
  pages.set('index.html', '/');
  const entries: OfflineFile[] = [];
  for (const path of have) {
    const page = pages.get(path);
    if (page) entries.push({ url: page, path });
    else if (
      (path.startsWith('assets/') && !path.endsWith('.map')) ||
      path.startsWith('icons/') ||
      SMALL.includes(path)
    )
      entries.push({ url: `/${path}`, path });
  }
  return entries.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
}

/**
 * The app shell, precached when the worker installs: the home page, the scripts and stylesheets
 * its HTML loads, the manifest and the icons. The app reads the address to decide what to show,
 * so with the shell and a page's own chunk any page opens; the chunks come as pages are opened.
 */
export function shellList(all: OfflineFile[], homeHtml: string): OfflineFile[] {
  const urls = new Set(['/', '/manifest.webmanifest', '/favicon.svg', '/apple-touch-icon.png']);
  const tags = /<(?:script|link)\b[^>]*?\b(?:src|href)="(\/assets\/[^"]+)"/g;
  for (const [, url] of homeHtml.matchAll(tags)) urls.add(url!);
  for (const f of all) if (f.url.startsWith('/icons/')) urls.add(f.url);
  const shell = all.filter((f) => urls.has(f.url));
  const missing = [...urls].filter((u) => !shell.some((f) => f.url === u));
  if (missing.length) throw new Error(`The app shell needs files not in dist: ${missing}`);
  return shell;
}

/** About how many bytes a file costs to download (gzip; brotli, where served, is smaller). */
export function transferSize(bytes: Uint8Array | string): number {
  return gzipSync(bytes, { level: 9 }).length;
}

/**
 * The worker's version: a hash of its own code and of every address and file it can cache, so a
 * build that changes anything a reader would see gets a new worker, and an identical build gets
 * the same one (no update notice for nothing). `read` gives a file's bytes.
 */
export function buildVersion(
  template: string,
  entries: OfflineFile[],
  read: (path: string) => Uint8Array | string,
): string {
  const all = createHash('sha256').update(template);
  for (const e of entries) {
    const file = createHash('sha256').update(read(e.path)).digest('hex');
    all.update(`\n${e.url} ${file}`);
  }
  return all.digest('hex').slice(0, 16);
}

const VERSION_LINE = "const VERSION = 'dev';";
const SHELL_LINE = 'const SHELL = [];';
const FILES_LINE = 'const FILES = [];';

/**
 * dist/sw.js: the worker's code with its version, the shell and every file with its download size
 * filled in. The template keeps them as placeholder lines so it stays plain, lintable JavaScript.
 */
export function serviceWorkerSource(
  template: string,
  version: string,
  shell: string[],
  files: [url: string, bytes: number][],
): string {
  for (const line of [VERSION_LINE, SHELL_LINE, FILES_LINE])
    if (template.split(line).length !== 2)
      throw new Error(`The service worker template needs exactly one line "${line}"`);
  if (!/^[0-9a-f]+$/.test(version)) throw new Error(`Bad service worker version: ${version}`);
  const urls = new Set(files.map(([url]) => url));
  const outside = shell.filter((u) => !urls.has(u));
  if (outside.length) throw new Error(`Shell files missing from the file list: ${outside}`);
  const rows = files.map(([url, bytes]) => `  [${JSON.stringify(url)}, ${Math.round(bytes)}],`);
  return template
    .replace(VERSION_LINE, `const VERSION = '${version}';`)
    .replace(SHELL_LINE, `const SHELL = ${JSON.stringify(shell, null, 2)};`)
    .replace(FILES_LINE, `const FILES = [\n${rows.join('\n')}\n];`);
}

/** Tag a page with its build's version (before </head>), so the page can tell a newer worker. */
export function stampBuild(html: string, version: string): string {
  if (!html.includes('</head>')) throw new Error('A page without </head>');
  const tag = `<meta name="${BUILD_META}" content="${version}" />`;
  return html.replace('</head>', `  ${tag}\n  </head>`);
}
