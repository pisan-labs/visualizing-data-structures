import fs from 'node:fs';
import { SITE_NAME, TAGLINE } from '../site';

/**
 * The web app manifest (dist/manifest.webmanifest, written by scripts/prerender.mjs; the dev
 * server serves the same). The name comes from src/site.ts and the colors from the light theme
 * in src/app.css. The icons are made from public/logo.svg by scripts/icons.mjs. Build time only.
 */
export function makeManifest() {
  return {
    id: '/',
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: TAGLINE,
    lang: 'en',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: lightToken('accent'),
    background_color: lightToken('bg'),
    icons: [
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

/** A color token of the light theme: the first :root block of app.css. */
export function lightToken(name: string): string {
  const css = fs.readFileSync(new URL('../app.css', import.meta.url), 'utf8');
  const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  const value = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(root)?.[1];
  if (!value) throw new Error(`No --${name} color in the light theme (src/app.css)`);
  return value;
}
