// After `vite build`: write dist/<id>/index.html for every visualization, so each page has its
// own title, description and link preview, plus a sitemap, robots.txt, the catalog thumbnails
// (previews.json, previews/<id>.json), the web app manifest and the service worker (sw.js). The
// app itself is the same on every page; it reads the page's path to decide what to show.
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

const dist = path.resolve('dist');
const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const setMeta = (html, attr, key, value) =>
  html.replace(new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`), `$1${esc(value)}$2`);

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
try {
  const { vizzes } = await server.ssrLoadModule('/src/viz/all.ts');
  const { SITE_NAME, SITE_URL } = await server.ssrLoadModule('/src/site.ts');
  const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  if (!template.includes('<div id="app"></div>')) throw new Error('Unexpected dist/index.html');

  for (const def of vizzes) {
    const title = `${def.title} · ${SITE_NAME}`;
    const url = `${SITE_URL}/${def.id}/`;
    let html = template.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
    html = setMeta(html, 'name', 'description', def.blurb);
    html = setMeta(html, 'property', 'og:title', title);
    html = setMeta(html, 'property', 'og:description', def.blurb);
    html = setMeta(html, 'property', 'og:url', url);
    html = html.replace('</head>', `  <link rel="canonical" href="${url}" />\n  </head>`);
    html = html.replace(
      '<div id="app"></div>',
      `<div id="app"></div>\n    <noscript><h1>${esc(def.title)}</h1><p>${esc(def.blurb)}</p>` +
        `<p>This interactive visualization needs JavaScript.</p></noscript>`,
    );
    fs.mkdirSync(path.join(dist, def.id), { recursive: true });
    fs.writeFileSync(path.join(dist, def.id, 'index.html'), html);
  }

  // Catalog thumbnails: the steps of one example per page, stripped to bare shapes.
  // previews.json holds the still pictures; previews/<id>.json the frames, fetched on first play.
  const { makePreviews, posterOf } = await server.ssrLoadModule('/src/render/preview.ts');
  const previews = makePreviews(vizzes);
  fs.mkdirSync(path.join(dist, 'previews'), { recursive: true });
  const posters = {};
  for (const [id, p] of Object.entries(previews)) {
    posters[id] = posterOf(p);
    fs.writeFileSync(path.join(dist, 'previews', `${id}.json`), JSON.stringify(p));
  }
  fs.writeFileSync(path.join(dist, 'previews.json'), JSON.stringify(posters));

  const urls = [`${SITE_URL}/`, ...vizzes.map((d) => `${SITE_URL}/${d.id}/`)];
  fs.writeFileSync(
    path.join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n') +
      `\n</urlset>\n`,
  );
  fs.writeFileSync(
    path.join(dist, 'robots.txt'),
    `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`,
  );
  console.log(
    `prerendered ${vizzes.length} visualization pages, ${Object.keys(previews).length} previews`,
  );

  // The installable app: the manifest, then the service worker with every file a reader needs
  // to open any page offline (src/pwa/precache.ts). Each page is tagged with the build's version
  // so it can tell whether a waiting worker is newer than itself.
  const { makeManifest } = await server.ssrLoadModule('/src/pwa/manifest.ts');
  fs.writeFileSync(
    path.join(dist, 'manifest.webmanifest'),
    `${JSON.stringify(makeManifest(), null, 2)}\n`,
  );
  const { precacheList, buildVersion, serviceWorkerSource, stampBuild } =
    await server.ssrLoadModule('/src/pwa/precache.ts');
  const files = fs
    .readdirSync(dist, { recursive: true })
    .map((f) => String(f).split(path.sep).join('/'))
    .filter((f) => fs.statSync(path.join(dist, f)).isFile());
  const entries = precacheList(
    files,
    vizzes.map((d) => d.id),
  );
  const worker = fs.readFileSync(path.resolve('src/pwa/sw.js'), 'utf8');
  const version = buildVersion(worker, entries, (f) => fs.readFileSync(path.join(dist, f)));
  for (const { path: f } of entries.filter((e) => e.path.endsWith('.html'))) {
    const file = path.join(dist, f);
    fs.writeFileSync(file, stampBuild(fs.readFileSync(file, 'utf8'), version));
  }
  const bytes = entries.reduce((n, e) => n + fs.statSync(path.join(dist, e.path)).size, 0);
  // A committed public/sw.js (the kill switch, scripts/sw-kill.js; see README) wins.
  if (fs.existsSync(path.resolve('public/sw.js'))) {
    console.warn('public/sw.js exists, so dist/sw.js is that file (the kill switch?)');
  } else {
    const urls = entries.map((e) => e.url);
    fs.writeFileSync(path.join(dist, 'sw.js'), serviceWorkerSource(worker, version, urls));
  }
  console.log(
    `service worker ${version}: precaches ${entries.length} files, ${(bytes / 1e6).toFixed(1)} MB`,
  );
} finally {
  await server.close();
}
