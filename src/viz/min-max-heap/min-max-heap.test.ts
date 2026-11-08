import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { minMaxHeap } from '.';
import { better, sideOf, type MMSettings, type MMState, type Side } from './model';

const settings = (s: Partial<MMSettings> = {}): MMSettings =>
  ({ ...minMaxHeap.defaults, ...s }) as MMSettings;

/** Every key on a min level is no bigger than anything below it; on a max level, no smaller. */
function ordered(s: MMState, root: Side): boolean {
  const n = s.items.length;
  const below = (p: number): number[] => {
    const out: number[] = [];
    for (const q of [2 * p + 1, 2 * p + 2]) if (q < n) out.push(q, ...below(q));
    return out;
  };
  for (let p = 0; p < n; p++) {
    const side = sideOf(p, root);
    for (const q of below(p)) if (better(side, s.items[q]!.key, s.items[p]!.key)) return false;
  }
  return true;
}

describe('min-max heap', () => {
  it('keeps the min at the root and the max beside it', () => {
    const t = new Timeline(minMaxHeap, settings(), 1, [
      ['build', '40 12 77 5 93 28 61 3 50'],
      ['extractMax'],
      ['extractMin'],
    ]);
    expect(t.entries[0]!.end.items[0]!.key).toBe(3);
    expect(t.entries[1]!.steps.at(-1)!.vars?.returned).toBe(93);
    expect(t.entries[2]!.steps.at(-1)!.vars?.returned).toBe(3);
  });

  it('matches a reference double-ended queue and stays ordered after every operation', () => {
    const call = fc.oneof(
      fc.integer({ min: -20, max: 120 }).map((k) => ['insert', k] as OpCall),
      fc.constant(['extractMin'] as OpCall),
      fc.constant(['extractMax'] as OpCall),
      fc
        .array(fc.integer({ min: 0, max: 99 }), { minLength: 1, maxLength: 20 })
        .map((ks) => ['build', ks.join(' ')] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.constantFrom('min' as const, 'max' as const),
        fc.constantFrom('one' as const, 'zero' as const),
        fc.array(call, { maxLength: 40 }),
        (root, index, calls) => {
          const t = new Timeline(minMaxHeap, settings({ root, index }), 1, calls);
          let ref: number[] = [];
          calls.forEach((c, k) => {
            const last = t.entries[k]!.steps.at(-1)!;
            if (c[0] === 'insert' && ref.length < 31) ref.push(c[1] as number);
            if (c[0] === 'build') ref = String(c[1]).split(' ').map(Number);
            ref.sort((a, b) => a - b);
            if (c[0] === 'extractMin' && ref.length) expect(last.vars?.returned).toBe(ref.shift());
            if (c[0] === 'extractMax' && ref.length) expect(last.vars?.returned).toBe(ref.pop());
            expect(ordered(t.entries[k]!.end, root)).toBe(true);
          });
          expect(
            t
              .endState()
              .items.map((x) => x.key)
              .sort((a, b) => a - b),
          ).toEqual(ref);
          for (let i = 0; i < t.length; i++) {
            const its = t.at(i).step.state.items;
            expect(new Set(its.map((x) => x.uid)).size).toBe(its.length);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('drawn text size', () => {
  // The tree's index labels are the smallest text: 14.8 px on a laptop, 10.6 on a phone.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(minMaxHeap, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(13);
    expect(smallestText(minMaxHeap, PHONE_STAGE).px).toBeGreaterThanOrEqual(10);
  });
});
