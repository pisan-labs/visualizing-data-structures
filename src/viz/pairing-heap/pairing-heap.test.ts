import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { pairingHeap } from '.';
import { count, preorder, type PairSettings, type PairState } from './model';

const settings = (s: Partial<PairSettings> = {}): PairSettings =>
  ({ ...pairingHeap.defaults, ...s }) as PairSettings;

/** Every child's key is at least its parent's. */
function heapOrdered(s: PairState): boolean {
  return Object.values(s.nodes).every((v) => v.kids.every((u) => s.nodes[u]!.key >= v.key));
}

describe('pairing heap', () => {
  it('pairs left to right, then melds right to left', () => {
    const t = new Timeline(pairingHeap, settings(), 1, [
      ['insert', 1],
      ['insert', 5],
      ['insert', 3],
      ['insert', 7],
      ['insert', 2],
      ['deleteMin'],
    ]);
    // Root 1's children, leftmost first: 2 7 3 5. Pass 1: (2,7) -> 2, (3,5) -> 3. Pass 2: 2 wins.
    const end = t.endState();
    const root = end.nodes[end.roots[0]!]!;
    expect(root.key).toBe(2);
    expect(root.kids.map((u) => end.nodes[u]!.key)).toEqual([3, 7]);
    expect(t.entries[5]!.steps.at(-1)!.vars?.links).toBe(3);
  });

  it('decrease-key cuts the subtree and melds it with the root', () => {
    const t = new Timeline(pairingHeap, settings(), 1, [
      ['insert', 10],
      ['insert', 20],
      ['insert', 30],
      ['decrease', 30, 5],
    ]);
    const end = t.endState();
    expect(end.nodes[end.roots[0]!]!.key).toBe(5);
    expect(t.entries[3]!.steps.at(-1)!.vars?.links).toBe(1);
  });

  it('matches a reference priority queue in both pairing variants', () => {
    const key = fc.integer({ min: -20, max: 99 });
    const call = fc.oneof(
      key.map((k) => ['insert', k] as OpCall),
      fc.constant(['deleteMin'] as OpCall),
      fc.tuple(key, key).map(([a, b]) => ['decrease', a, b] as OpCall),
      fc.array(key, { minLength: 1, maxLength: 6 }).map((ks) => ['meld', ks.join(' ')] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.constantFrom('two-pass' as const, 'multipass' as const),
        fc.array(call, { maxLength: 40 }),
        (pass, calls) => {
          const t = new Timeline(pairingHeap, settings({ pass }), 1, calls);
          const ref: number[] = [];
          calls.forEach((c, k) => {
            const last = t.entries[k]!.steps.at(-1)!;
            if (c[0] === 'insert' && ref.length < 31) ref.push(c[1] as number);
            if (c[0] === 'meld') {
              const ks = String(c[1]).split(' ').map(Number);
              if (ref.length + ks.length <= 31) ref.push(...ks);
            }
            if (c[0] === 'decrease') {
              const i = ref.indexOf(c[1] as number);
              if (i >= 0 && (c[2] as number) <= (c[1] as number)) ref[i] = c[2] as number;
            }
            if (c[0] === 'deleteMin' && ref.length) {
              ref.sort((a, b) => a - b);
              expect(last.vars?.returned).toBe(ref.shift());
            }
            const end = t.entries[k]!.end;
            expect(end.roots.length).toBeLessThanOrEqual(1);
            expect(heapOrdered(end)).toBe(true);
          });
          const end = t.endState();
          expect(
            preorder(end.nodes, end.roots)
              .map((u) => end.nodes[u]!.key)
              .sort((a, b) => a - b),
          ).toEqual([...ref].sort((a, b) => a - b));
          for (let i = 0; i < t.length; i++) {
            const st = t.at(i).step;
            // Every node drawn is reachable exactly once, and N counts them.
            expect(st.vars?.N).toBe(count(st.state.nodes, st.state.roots));
            expect(Object.keys(st.state.nodes).length).toBe(count(st.state.nodes, st.state.roots));
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('drawn text size', () => {
  // 19 px on a laptop; 10.5 on a phone, where a flat root with nine children is widest.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(pairingHeap, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(14);
    expect(smallestText(pairingHeap, PHONE_STAGE).px).toBeGreaterThanOrEqual(10);
  });
});
