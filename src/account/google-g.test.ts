import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GOOGLE_G_FILES, GOOGLE_G_SHA256, googleG } from './google-g';

const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

describe("Google's G", () => {
  it("embeds Google's own files, byte for byte", () => {
    for (const theme of ['light', 'dark'] as const) {
      const bytes = readFileSync(new URL(`./google-g-${theme}.svg`, import.meta.url));
      expect(sha256(bytes)).toBe(GOOGLE_G_SHA256[theme]);
      expect(sha256(GOOGLE_G_FILES[theme])).toBe(GOOGLE_G_SHA256[theme]);
    }
  });

  it('changes only the opening tag, to show the 20x20 G', () => {
    for (const theme of ['light', 'dark'] as const) {
      const g = googleG(theme);
      expect(g.startsWith('<svg width="20" height="20" viewBox="10 10 20 20"')).toBe(true);
      expect(g).toContain('aria-hidden="true"');
      const rest = (s: string) => s.slice(s.indexOf(' fill="none"'));
      expect(rest(g)).toBe(rest(GOOGLE_G_FILES[theme]));
    }
  });

  it('keeps the two Gs apart when both are on the page (no shared ids)', () => {
    const ids = (s: string) => [...s.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    const light = ids(googleG('light'));
    const dark = ids(googleG('dark'));
    expect(light.length).toBeGreaterThan(0);
    expect(light.filter((id) => dark.includes(id))).toEqual([]);
  });
});
