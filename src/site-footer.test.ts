import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The HintWise footer, as the platform session sent it (footerHtml('stepwise')). Its wording is the
// owner's; when it changes, the platform sends the new markup and its sha256, and both change here.
const FOOTER_SHA256 = '487cb295f97d1c68622de7d150534ac9fd9fafb25d6a9356f1845e3daf1b491e';

describe('the HintWise footer', () => {
  const bytes = readFileSync(new URL('../scripts/site-footer.html', import.meta.url));

  it('is the platform markup, byte for byte', () => {
    expect(bytes.length).toBe(2234);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(FOOTER_SHA256);
  });

  it('is one declarative shadow root, marked for the build check', () => {
    const html = bytes.toString('utf8');
    expect(html.startsWith('<site-footer data-site-footer><template shadowrootmode="open">')).toBe(
      true,
    );
    expect(html.split('data-site-footer')).toHaveLength(2);
  });

  it('carries the HintWise mark (added to the shared footer on 11 November)', () => {
    const html = bytes.toString('utf8');
    expect(html.split('class="mark"')).toHaveLength(2);
    expect(html).toContain('aria-hidden="true"');
  });
});
