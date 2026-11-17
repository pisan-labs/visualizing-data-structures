import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { track } from './analytics';

type G = { hintwise?: { track?: (name: string, props?: object) => void } };

afterEach(() => {
  delete (globalThis as G).hintwise;
});

describe('track', () => {
  it('passes the event to hw-events.js when it is loaded', () => {
    const spy = vi.fn();
    (globalThis as G).hintwise = { track: spy };
    track('op_run', { op: 'push' });
    expect(spy).toHaveBeenCalledWith('op_run', { op: 'push' });
  });
  it('does nothing without the script, and never throws', () => {
    expect(() => track('play')).not.toThrow();
    (globalThis as G).hintwise = {
      track: () => {
        throw new Error('blocked');
      },
    };
    expect(() => track('play')).not.toThrow();
  });
});

describe('public/hw-events.js', () => {
  // The platform's file (pisanuw/claude-built-apps platform/src/analytics/hw-events.js), copied
  // byte for byte. Update both the copy and this hash when the platform's file changes.
  it('is the platform script, unchanged', () => {
    const text = readFileSync(new URL('../public/hw-events.js', import.meta.url));
    expect(createHash('sha256').update(text).digest('hex')).toBe(
      'd2833162b9f18f9f2fdb36dbd62440c13ee26c6600200d8e55ad32b907f00633',
    );
  });
  it('is loaded by index.html as app stepwise', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).toContain('<script defer src="/hw-events.js" data-app="stepwise"></script>');
  });
});
