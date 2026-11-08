import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { karatsuba } from '.';
import type { KaraSettings, Split } from './model';

/** The recursion's call count, written straight from the definition. */
function refCalls(x: number, y: number, split: Split): number {
  if (x < 10 || y < 10) return 1;
  const m = Math.floor(Math.max(String(x).length, String(y).length) / 2);
  const p = 10 ** m;
  const [a, b, c, d] = [Math.floor(x / p), x % p, Math.floor(y / p), y % p];
  return split === 'three'
    ? 1 + refCalls(a, c, split) + refCalls(b, d, split) + refCalls(a + b, c + d, split)
    : 1 +
        refCalls(a, c, split) +
        refCalls(a, d, split) +
        refCalls(b, c, split) +
        refCalls(b, d, split);
}

describe('karatsuba', () => {
  it('multiplies correctly, with every call returning its own product', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9999 }),
        fc.integer({ min: 0, max: 9999 }),
        fc.constantFrom<Split>('three', 'four'),
        (x, y, split) => {
          const settings: KaraSettings = { split };
          const steps = new Timeline(karatsuba, settings, 1, [['multiply', x, y]]).entries[0]!
            .steps;
          const end = steps.at(-1)!.state;
          expect(end.calls[0]!.result).toBe(x * y);
          expect(end.calls.length).toBe(refCalls(x, y, split));
          for (const c of end.calls) expect(c.result).toBe(c.x * c.y);
          // A call returns only after all of its children did.
          for (const s of steps)
            for (const id of s.state.returned)
              for (const kid of s.state.calls[id - 1]!.children)
                expect(s.state.returned).toContain(kid);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('makes 16 digit products with four products per split, as many as schoolbook', () => {
    const t = new Timeline(karatsuba, { split: 'four' }, 1, [['multiply', 1234, 5678]]);
    expect(t.entries[0]!.end.digitMults).toBe(16);
    const k = new Timeline(karatsuba, { split: 'three' }, 1, [['multiply', 1234, 5678]]);
    expect(k.entries[0]!.end.digitMults).toBeLessThan(16);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(karatsuba, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(karatsuba, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
