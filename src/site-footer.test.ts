import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The HintWise footer, as the platform session sent it (footerHtml('stepwise')). Its wording is the
// owner's; when it changes, the platform sends the new markup and its sha256, and both change here.
const FOOTER_SHA256 = 'f40ff32d2c9636c909182888feb4e8966206c81cf37112ba5d9054b4904b91a1';

describe('the HintWise footer', () => {
  const bytes = readFileSync(new URL('../scripts/site-footer.html', import.meta.url));

  it('is the platform markup, byte for byte', () => {
    expect(bytes.length).toBe(1463);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(FOOTER_SHA256);
  });

  it('is one declarative shadow root, marked for the build check', () => {
    const html = bytes.toString('utf8');
    expect(html.startsWith('<site-footer data-site-footer><template shadowrootmode="open">')).toBe(
      true,
    );
    expect(html.split('data-site-footer')).toHaveLength(2);
  });
});
