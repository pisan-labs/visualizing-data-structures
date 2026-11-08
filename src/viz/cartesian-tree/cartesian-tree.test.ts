import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { shapeText, treeHeight } from '../_bst/tree-kit';
import { cartesianTree } from '.';
import { MAX_LENGTH, rightSpine, type CartesianSettings, type CartesianState } from './model';

/** Reference: the recursive definition. The first best value is the root; recurse on each side. */
function reference(a: number[], max: boolean): string {
  const better = (x: number, y: number) => (max ? x > y : x < y);
  const build = (lo: number, hi: number): string => {
    if (lo > hi) return '.';
    let m = lo;
    for (let k = lo + 1; k <= hi; k++) if (better(a[k]!, a[m]!)) m = k;
    const l = build(lo, m - 1);
    const r = build(m + 1, hi);
    return l === '.' && r === '.' ? String(a[m]) : `(${a[m]} ${l} ${r})`;
  };
  return build(0, a.length - 1);
}

function check(s: CartesianState, max: boolean, waiting: number | undefined) {
  const seen: number[] = [];
  const walk = (u: number | null, parent: number | null) => {
    if (u === null) return;
    const n = s.nodes[u]!;
    expect(n.parent).toBe(parent);
    if (parent !== null) {
      const pv = s.nodes[parent]!.key;
      if (max) expect(n.key).toBeLessThanOrEqual(pv);
      else expect(n.key).toBeGreaterThanOrEqual(pv);
    }
    walk(n.left, u);
    seen.push(u);
    walk(n.right, u);
  };
  walk(s.root, null);
  // Inorder is array order; a node being appended waits outside the tree.
  expect(seen).toEqual(waiting === undefined ? s.order : s.order.filter((u) => u !== waiting));
  expect(Object.keys(s.nodes).length).toBe(s.order.length);
  expect(s.pops).toBeLessThanOrEqual(s.order.length);
}

const run = (calls: OpCall[], settings: Partial<CartesianSettings> = {}) =>
  new Timeline(
    cartesianTree,
    { ...cartesianTree.defaults, ...settings } as CartesianSettings,
    1,
    calls,
  );

const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: 0, max: 20 }).map((x) => ['append', x] as OpCall) },
  {
    weight: 3,
    arbitrary: fc
      .tuple(fc.integer({ min: 0, max: 13 }), fc.integer({ min: 0, max: 13 }))
      .map(([i, j]) => ['rmq', i, j] as OpCall),
  },
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

describe('cartesian tree', () => {
  it('matches the recursive definition and answers range queries like a scan', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('min' as const, 'max' as const),
        fc.array(callArb, { maxLength: 40 }),
        (heap, calls) => {
          const max = heap === 'max';
          const t = run(calls, { heap });
          let a: number[] = [];
          calls.forEach((call, idx) => {
            const e = t.entries[idx]!;
            const [op, x, y] = call;
            if (op === 'append' && a.length < MAX_LENGTH) a.push(Number(x));
            if (op === 'clear') a = [];
            const end = e.end;
            expect(end.order.map((u) => end.nodes[u]!.key)).toEqual(a);
            expect(shapeText(end)).toBe(a.length ? reference(a, max) : '.');
            for (const step of e.steps) {
              check(step.state, max, step.extra?.waiting);
              expect(step.vars!.N).toBe(step.state.order.length);
              expect(step.vars!.height).toBe(treeHeight(step.state));
            }
            // The stack after an append is the right spine.
            expect(e.steps.at(-1)!.vars!.stack).toBe(rightSpine(end).length);
            if (op === 'rmq') {
              const v = e.steps.at(-1)!.vars!;
              const [i, j] = [Math.min(Number(x), Number(y)), Math.max(Number(x), Number(y))];
              if (j < a.length) {
                const part = a.slice(i, j + 1);
                const best = max ? Math.max(...part) : Math.min(...part);
                expect(v[max ? 'max' : 'min']).toBe(best);
                expect(v.index).toBe(i + part.indexOf(best));
              } else {
                expect(v.index).toBeUndefined();
              }
            }
          });
        },
      ),
      { numRuns: 300 },
    );
  });

  it('pops each value at most once: n appends, fewer than n pops', () => {
    const t = run([3, 5, 7, 9, 11, 1].map((x) => ['append', x] as OpCall));
    expect(t.endState().pops).toBe(5);
    const falling = run([9, 8, 7, 6, 5].map((x) => ['append', x] as OpCall));
    expect(falling.endState().pops).toBe(4);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(cartesianTree, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(cartesianTree, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
