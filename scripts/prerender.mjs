// After `vite build`: write dist/<id>/index.html for every visualization, so each page has its
// own title, description and link preview, plus a sitemap, robots.txt and the catalog thumbnails
// (previews.json). The app itself is the same on every page; it reads the page's path to decide
// what to show.
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
  const { makePreviews } = await server.ssrLoadModule('/src/render/preview.ts');
  const previews = makePreviews(vizzes);
  fs.writeFileSync(path.join(dist, 'previews.json'), JSON.stringify(previews));

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
} finally {
  await server.close();
}
