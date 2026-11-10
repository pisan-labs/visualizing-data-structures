import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SITE_NAME } from '../site';
import { lightToken, makeManifest } from './manifest';

describe('web app manifest', () => {
  const m = makeManifest();

  it('is named after the site and opens the home page as an app', () => {
    expect(m.name).toBe(SITE_NAME);
    expect(m.short_name).toBe(SITE_NAME);
    expect(m.short_name.length).toBeLessThanOrEqual(12);
    expect(m.start_url).toBe('/');
    expect(m.scope).toBe('/');
    expect(m.display).toBe('standalone');
  });

  it("takes its colors from the light theme, matching the pages' theme-color", () => {
    expect(m.theme_color).toBe('#2457c5');
    expect(m.background_color).toBe('#f6f7f9');
    const html = fs.readFileSync('index.html', 'utf8');
    expect(html).toContain(`<meta name="theme-color" content="${m.theme_color}" />`);
    expect(() => lightToken('no-such-token')).toThrow('--no-such-token');
  });

  it('lists icons that exist, with a maskable one and the sizes they claim', () => {
    const purposes = new Set(m.icons.map((i) => i.purpose));
    expect([...purposes].sort()).toEqual(['any', 'maskable']);
    for (const size of ['192x192', '512x512'])
      expect(m.icons.some((i) => i.sizes === size && i.purpose === 'any')).toBe(true);
    for (const icon of m.icons) {
      const file = fs.readFileSync(`public${icon.src}`);
      if (icon.type === 'image/png') {
        // A PNG's width and height are the two big-endian words after its IHDR tag.
        const [w, h] = [file.readUInt32BE(16), file.readUInt32BE(20)];
        expect(`${w}x${h}`, icon.src).toBe(icon.sizes);
      } else expect(file.toString('utf8'), icon.src).toMatch(/^<svg /);
    }
  });

  it('is linked from index.html, which every prerendered page is made from', () => {
    expect(fs.readFileSync('index.html', 'utf8')).toContain(
      '<link rel="manifest" href="/manifest.webmanifest" />',
    );
  });
});
