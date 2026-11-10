import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildVersion,
  offlineList,
  serviceWorkerSource,
  shellList,
  stampBuild,
  transferSize,
} from './precache';
import { ASK_STATUS, ASK_VERSION, BUILD_META, DOWNLOAD, SKIP_WAITING } from './protocol';

const template = fs.readFileSync(new URL('./sw.js', import.meta.url), 'utf8');

const dist = [
  'index.html',
  'stack-array/index.html',
  'bst/index.html',
  'assets/index-AbC123.js',
  'assets/index-AbC123.css',
  'assets/bst-x9Y8z7.js',
  'assets/bst-x9Y8z7.js.map',
  'previews.json',
  'previews/bst.json',
  'previews/stack-array.json',
  'manifest.webmanifest',
  'favicon.svg',
  'apple-touch-icon.png',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/maskable-512.png',
  'og-image.png',
  'logo.svg',
  'sitemap.xml',
  'robots.txt',
  'sw.js',
  'drafts/index.html',
];

describe('offline list', () => {
  const entries = offlineList(dist, ['stack-array', 'bst']);
  const urls = entries.map((e) => e.url);

  it('holds the home page, every page, the hashed assets, the thumbnails and the icons', () => {
    expect(urls).toEqual([
      '/',
      '/apple-touch-icon.png',
      '/assets/bst-x9Y8z7.js',
      '/assets/index-AbC123.css',
      '/assets/index-AbC123.js',
      '/bst/',
      '/favicon.svg',
      '/icons/icon-192.png',
      '/icons/icon.svg',
      '/icons/maskable-512.png',
      '/manifest.webmanifest',
      '/previews.json',
      '/stack-array/',
    ]);
  });

  it('maps each address to the file that serves it', () => {
    const byUrl = Object.fromEntries(entries.map((e) => [e.url, e.path]));
    expect(byUrl['/']).toBe('index.html');
    expect(byUrl['/bst/']).toBe('bst/index.html');
    expect(byUrl['/assets/bst-x9Y8z7.js']).toBe('assets/bst-x9Y8z7.js');
  });

  it('leaves out source maps, thumbnail frames, crawler files, the worker and stray pages', () => {
    for (const url of [
      '/assets/bst-x9Y8z7.js.map',
      '/previews/bst.json',
      '/sitemap.xml',
      '/robots.txt',
      '/og-image.png',
      '/logo.svg',
      '/sw.js',
      '/drafts/',
      '/drafts/index.html',
    ])
      expect(urls).not.toContain(url);
  });

  it('does not depend on the order the files were listed in', () => {
    expect(offlineList([...dist].reverse(), ['bst', 'stack-array'])).toEqual(entries);
  });

  it('refuses a build that lacks a page', () => {
    expect(() => offlineList(dist, ['stack-array', 'avl'])).toThrow('avl/index.html');
    expect(() => offlineList(dist.slice(1), [])).toThrow('index.html');
  });
});

describe('app shell', () => {
  const all = offlineList(dist, ['stack-array', 'bst']);
  const home =
    '<link rel="icon" href="/favicon.svg" /><link rel="manifest" href="/manifest.webmanifest" />' +
    '<script type="module" crossorigin src="/assets/index-AbC123.js"></script>' +
    '<link rel="stylesheet" crossorigin href="/assets/index-AbC123.css">';

  it("is the home page, the files its HTML loads, the manifest and the icons, and no page's own", () => {
    expect(shellList(all, home).map((e) => e.url)).toEqual([
      '/',
      '/apple-touch-icon.png',
      '/assets/index-AbC123.css',
      '/assets/index-AbC123.js',
      '/favicon.svg',
      '/icons/icon-192.png',
      '/icons/icon.svg',
      '/icons/maskable-512.png',
      '/manifest.webmanifest',
    ]);
  });

  it('takes module preloads too, and refuses files that are not in the build', () => {
    const preload = `${home}<link rel="modulepreload" crossorigin href="/assets/bst-x9Y8z7.js">`;
    expect(shellList(all, preload).map((e) => e.url)).toContain('/assets/bst-x9Y8z7.js');
    expect(() => shellList(all, '<script src="/assets/gone-1.js"></script>')).toThrow('gone-1');
  });

  it('measures what a file costs to download', () => {
    const text = 'stack '.repeat(1000);
    expect(transferSize(text)).toBeGreaterThan(0);
    expect(transferSize(text)).toBeLessThan(text.length / 10);
  });
});

describe('worker version', () => {
  const entries = offlineList(dist, ['stack-array', 'bst']);
  const files: Record<string, string> = Object.fromEntries(dist.map((f) => [f, `contents ${f}`]));
  const version = (t = template, read = (f: string) => files[f]!) => buildVersion(t, entries, read);

  it('is the same for the same build and changes when any precached file does', () => {
    expect(version()).toMatch(/^[0-9a-f]{16}$/);
    expect(version()).toBe(version());
    const changed = (path: string) => version(template, (f) => (f === path ? 'new' : files[f]!));
    expect(changed('bst/index.html')).not.toBe(version());
    expect(changed('assets/bst-x9Y8z7.js')).not.toBe(version());
    expect(changed('previews.json')).not.toBe(version());
    // Files the worker never caches do not matter.
    expect(changed('previews/bst.json')).toBe(version());
  });

  it("changes with the worker's own code", () => {
    expect(version(`${template}\n// changed`)).not.toBe(version());
  });
});

describe('dist/sw.js', () => {
  const shell = ['/', '/assets/index-AbC123.js'];
  const files: [string, number][] = [
    ['/', 900],
    ['/assets/index-AbC123.js', 80_000],
    ['/stack-array/', 1200],
  ];
  const source = serviceWorkerSource(template, '0123456789abcdef', shell, files);

  it('fills in the version, the shell and every file with its size', () => {
    expect(source).toContain("const VERSION = '0123456789abcdef';");
    expect(source).not.toContain("const VERSION = 'dev';");
    const list = (name: string) =>
      JSON.parse(
        new RegExp(`const ${name} = (\\[[^;]*\\]);`).exec(source)![1]!.replace(/,\s*\]$/, ']'),
      );
    expect(list('SHELL')).toEqual(shell);
    expect(list('FILES')).toEqual(files);
  });

  it('refuses a shell file that is not in the list', () => {
    expect(() => serviceWorkerSource(template, 'abc', ['/nope.js'], files)).toThrow('/nope.js');
  });

  it('is valid JavaScript', () => {
    expect(() => new Function(source)).not.toThrow();
  });

  it('refuses a template without the placeholder lines, or a strange version', () => {
    expect(() => serviceWorkerSource('self.x = 1;', 'abc', shell, files)).toThrow(
      'exactly one line',
    );
    expect(() => serviceWorkerSource(template, "x'; alert(1); '", shell, files)).toThrow('version');
  });

  it('uses the message names the page sends', () => {
    expect(template).toContain(`type === '${ASK_VERSION}'`);
    expect(template).toContain(`type === '${SKIP_WAITING}'`);
    expect(template).toContain(`type === '${ASK_STATUS}'`);
    expect(template).toContain(`type === '${DOWNLOAD}'`);
  });
});

describe('build tag', () => {
  it('goes into the head once', () => {
    const html = '<html><head><title>x</title></head><body></body></html>';
    const out = stampBuild(html, 'abc123');
    expect(out).toContain(`<meta name="${BUILD_META}" content="abc123" />`);
    expect(out.indexOf(BUILD_META)).toBeLessThan(out.indexOf('</head>'));
    expect(out.split(BUILD_META)).toHaveLength(2);
  });
});
