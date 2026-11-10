import { createHash } from 'node:crypto';
import { BUILD_META } from './protocol';

/**
 * Build-time helpers for the service worker (src/pwa/sw.js). scripts/prerender.mjs lists the
 * files in dist, picks the ones to precache with `precacheList`, and writes dist/sw.js with
 * `serviceWorkerSource`. Nothing here runs in the browser.
 */

/** Small files the app shell asks for on every page, besides the pages and the hashed assets. */
const SHELL = ['previews.json', 'manifest.webmanifest', 'favicon.svg', 'apple-touch-icon.png'];

export interface PrecacheEntry {
  /** The address the worker fetches and caches, such as /stack-array/. */
  url: string;
  /** The file in dist that serves it, such as stack-array/index.html. */
  path: string;
}

/**
 * What a reader needs to open every page offline: the home page, each page's own HTML, every
 * hashed file in assets/ (the app and each page's chunk), the catalog thumbnails and the icons.
 * Left out: source maps, the per-page thumbnail frames (previews/<id>.json, fetched when a
 * thumbnail first plays and cached then), the sitemap, robots.txt, the link-preview image and the
 * worker itself. `files` are paths relative to dist with forward slashes, in any order; the
 * result is sorted by address, so the same build gives the same list.
 */
export function precacheList(files: string[], pageIds: string[]): PrecacheEntry[] {
  const have = new Set(files);
  const missing = ['index.html', ...pageIds.map((id) => `${id}/index.html`)].filter(
    (f) => !have.has(f),
  );
  if (missing.length) throw new Error(`Missing from dist: ${missing.join(', ')}`);
  const pages = new Map(pageIds.map((id) => [`${id}/index.html`, `/${id}/`]));
  pages.set('index.html', '/');
  const entries: PrecacheEntry[] = [];
  for (const path of have) {
    const page = pages.get(path);
    if (page) entries.push({ url: page, path });
    else if (
      (path.startsWith('assets/') && !path.endsWith('.map')) ||
      path.startsWith('icons/') ||
      SHELL.includes(path)
    )
      entries.push({ url: `/${path}`, path });
  }
  return entries.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
}

/**
 * The worker's version: a hash of its own code and of every precached address and file, so a
 * build that changes anything a reader would see gets a new worker, and an identical build gets
 * the same one (no update notice for nothing). `read` gives a file's bytes.
 */
export function buildVersion(
  template: string,
  entries: PrecacheEntry[],
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
const PRECACHE_LINE = 'const PRECACHE = [];';

/**
 * dist/sw.js: the worker's code with its version and precache list filled in. The template keeps
 * both as placeholder lines so it stays plain, lintable JavaScript.
 */
export function serviceWorkerSource(template: string, version: string, urls: string[]): string {
  for (const line of [VERSION_LINE, PRECACHE_LINE])
    if (template.split(line).length !== 2)
      throw new Error(`The service worker template needs exactly one line "${line}"`);
  if (!/^[0-9a-f]+$/.test(version)) throw new Error(`Bad service worker version: ${version}`);
  return template
    .replace(VERSION_LINE, `const VERSION = '${version}';`)
    .replace(PRECACHE_LINE, `const PRECACHE = ${JSON.stringify(urls, null, 2)};`);
}

/** Tag a page with its build's version (before </head>), so the page can tell a newer worker. */
export function stampBuild(html: string, version: string): string {
  if (!html.includes('</head>')) throw new Error('A page without </head>');
  const tag = `<meta name="${BUILD_META}" content="${version}" />`;
  return html.replace('</head>', `  ${tag}\n  </head>`);
}
