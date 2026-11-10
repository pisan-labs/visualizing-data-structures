// Makes the app icons in public/icons from the mark in public/logo.svg (the staircase of cells,
// without the word): the mark's cells in white on a tile of the logo's blue, the amber cell kept,
// as on the favicon. Run it after changing the logo, then commit the files it writes:
//
//   node scripts/icons.mjs
//
// icon.svg, icon-192.png and icon-512.png are rounded tiles with a margin; the maskable ones fill
// the square edge to edge with the mark inside the safe zone (the middle 80% circle), because the
// device cuts its own shape out of them. Playwright's Chromium draws the PNGs.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const out = path.resolve('public/icons');
const logo = fs.readFileSync(path.resolve('public/logo.svg'), 'utf8');

// The mark is every rect before the word; the blue is the fill of the group that holds the cells.
const head = logo.slice(0, logo.indexOf('<text'));
const blue = /<g fill="(#[0-9a-fA-F]{3,8})">/.exec(head)?.[1];
const rects = [...head.matchAll(/<rect ([^>]*?)\/>/g)].map(([, attrs]) => {
  const get = (name) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1];
  return {
    x: Number(get('x')),
    y: Number(get('y')),
    w: Number(get('width')),
    h: Number(get('height')),
    rx: Number(get('rx') ?? 0),
    opacity: get('opacity'),
    fill: get('fill'),
  };
});
if (!blue || rects.length < 2 || rects.some((r) => [r.x, r.y, r.w, r.h].some(Number.isNaN)))
  throw new Error('public/logo.svg no longer has the mark this script expects');

const box = {
  x: Math.min(...rects.map((r) => r.x)),
  y: Math.min(...rects.map((r) => r.y)),
  w: Math.max(...rects.map((r) => r.x + r.w)) - Math.min(...rects.map((r) => r.x)),
  h: Math.max(...rects.map((r) => r.y + r.h)) - Math.min(...rects.map((r) => r.y)),
};

/** The icon as SVG: a `size` square, the mark scaled to `fill` of it and centered. */
function icon({ size, fill, round }) {
  const scale = (size * fill) / Math.max(box.w, box.h);
  const dx = (size - box.w * scale) / 2 - box.x * scale;
  const dy = (size - box.h * scale) / 2 - box.y * scale;
  const n = (v) => +v.toFixed(3);
  const cells = rects
    .map(
      (r) =>
        `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" rx="${n(r.rx)}"` +
        (r.fill
          ? ` fill="${r.fill}"`
          : ` fill="#fff"${r.opacity ? ` opacity="${r.opacity}"` : ''}`) +
        '/>',
    )
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" rx="${round ? n(size * 0.22) : 0}" fill="${blue}"/>` +
    `<g transform="translate(${n(dx)} ${n(dy)}) scale(${n(scale)})">${cells}</g></svg>\n`
  );
}

const tile = (size) => icon({ size, fill: 0.7, round: true });
const maskable = (size) => icon({ size, fill: 0.5, round: false });

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.svg'), tile(64));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [name, svg, size] of [
    ['icon-192.png', tile(192), 192],
    ['icon-512.png', tile(512), 512],
    ['maskable-192.png', maskable(192), 192],
    ['maskable-512.png', maskable(512), 512],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>` +
        svg.replace('<svg ', `<svg width="${size}" height="${size}" `),
    );
    await page.screenshot({ path: path.join(out, name), omitBackground: true });
  }
} finally {
  await browser.close();
}
console.log(`wrote icon.svg and four PNGs to ${path.relative(process.cwd(), out)}`);
