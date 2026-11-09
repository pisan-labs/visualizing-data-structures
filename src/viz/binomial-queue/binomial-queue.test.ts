import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Step } from '../../engine/types';
import { binomialQueue } from '.';
import {
  childrenOf,
  countFrom,
  listFrom,
  MAX_KEYS,
  type BinExtra,
  type BinSettings,
  type BinState,
} from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';

// ---------------------------------------------------------------------------------------------
// Reference: a sorted multiset. A binomial queue holds the same keys as any priority queue.

class RefQueue {
  keys: number[] = [];
  insert(k: number) {
    this.keys.push(k);
    this.keys.sort((a, b) => a - b);
  }
  min() {
    return this.keys[0];
  }
  deleteMin() {
    return this.keys.shift();
  }
  decrease(k: number, k2: number): 'ok' | 'missing' | 'bigger' {
    const i = this.keys.indexOf(k);
    if (i < 0) return 'missing';
    if (k2 > k) return 'bigger';
    this.keys[i] = k2;
    this.keys.sort((a, b) => a - b);
    return 'ok';
  }
}

const keysOf = (s: BinState) =>
  Object.values(s.nodes)
    .map((n) => n.key)
    .sort((a, b) => a - b);

/** Check that u roots a binomial tree B_k (k = its degree); return its size. */
function checkTree(s: BinState, u: number): number {
  const n = s.nodes[u]!;
  const kids = childrenOf(s.nodes, u);
  expect(kids.length, `degree of ${n.key}`).toBe(n.degree);
  let size = 1;
  kids.forEach((c, i) => {
    expect(s.nodes[c]!.parent, `parent of ${s.nodes[c]!.key}`).toBe(u);
    expect(s.nodes[c]!.degree, 'children in decreasing degree').toBe(n.degree - 1 - i);
    size += checkTree(s, c);
  });
  expect(size, `a B${n.degree} has 2^${n.degree} nodes`).toBe(2 ** n.degree);
  return size;
}

/** Edges where a child's key is smaller than its parent's. */
function violations(s: BinState): number {
  let bad = 0;
  for (const n of Object.values(s.nodes))
    if (n.parent !== null && n.key < s.nodes[n.parent]!.key) bad++;
  return bad;
}

function checkStep(step: Step<BinState, BinExtra>, op: string) {
  const s = step.state;
  let total = 0;
  for (const head of [s.head, s.other]) {
    const roots = listFrom(s.nodes, head);
    roots.forEach((r, i) => {
      expect(s.nodes[r]!.parent, 'roots have no parent').toBeNull();
      total += checkTree(s, r);
      if (i > 0)
        expect(s.nodes[r]!.degree, 'root list in degree order').toBeGreaterThanOrEqual(
          s.nodes[roots[i - 1]!]!.degree,
        );
    });
  }
  expect(Object.keys(s.nodes).length, 'no node is lost').toBe(total);
  // Heap order holds, except at the one key a decreaseKey is moving up.
  expect(violations(s), step.say).toBeLessThanOrEqual(op === 'decrease' ? 1 : 0);
  const vids = Object.values(s.nodes).map((n) => n.vid);
  expect(new Set(vids).size, 'every key has its own identity').toBe(vids.length);
  expect(step.vars?.N).toBe(total);
  expect(step.vars?.binary).toBe(total.toString(2));
}

const keyArb = fc.integer({ min: 1, max: 40 });
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 6, arbitrary: keyArb.map((k) => ['insert', k] as OpCall) },
  { weight: 2, arbitrary: fc.constant(['findmin'] as OpCall) },
  { weight: 3, arbitrary: fc.constant(['deletemin'] as OpCall) },
  {
    weight: 2,
    arbitrary: fc
      .array(keyArb, { minLength: 1, maxLength: 8 })
      .map((ks) => ['merge', ks.join(' ')] as OpCall),
  },
  {
    weight: 2,
    arbitrary: fc.tuple(keyArb, keyArb).map(([a, b]) => ['decrease', a, b] as OpCall),
  },
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

describe('binomial queue', () => {
  it('matches a reference priority queue and keeps every invariant on every step', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('logical' as const, 'internal' as const),
        fc.array(callArb, { maxLength: 40 }),
        (view, calls) => {
          const settings: BinSettings = { view };
          const t = new Timeline(binomialQueue, settings, 1, calls);
          const ref = new RefQueue();
          let before = keysOf(t.initial.state);
          calls.forEach((call, i) => {
            const [op, a, b] = call;
            const entry = t.entries[i]!;
            const last = entry.steps.at(-1)!;
            const v = last.vars ?? {};
            const capped = last.say.includes('readabl');
            if (op === 'insert' && !capped) ref.insert(Number(a));
            if (op === 'merge' && !capped)
              String(a)
                .split(' ')
                .forEach((k) => ref.insert(Number(k)));
            if (op === 'findmin') expect(v.returned).toBe(ref.min());
            if (op === 'deletemin') expect(v.returned).toBe(ref.deleteMin());
            if (op === 'decrease') {
              const r = ref.decrease(Number(a), Number(b));
              const refused = last.marks.some((m) => m.id === 'arg-box');
              expect(refused, `decrease ${a} ${b}`).toBe(r !== 'ok');
            }
            if (op === 'clear') ref.keys = [];
            if (capped) {
              const adding = op === 'insert' ? 1 : String(a).split(' ').length;
              expect(ref.keys.length + adding).toBeGreaterThan(MAX_KEYS);
            }
            const after = keysOf(entry.end);
            expect(after, `keys after ${call.join(' ')}`).toEqual(ref.keys);
            expect(entry.end.other).toBeNull();
            const roots = listFrom(entry.end.nodes, entry.end.head);
            const degrees = roots.map((r) => entry.end.nodes[r]!.degree);
            expect(new Set(degrees).size, 'at most one tree of each degree').toBe(degrees.length);
            // One tree per 1 bit of n.
            expect(degrees.reduce((sum, d) => sum + 2 ** d, 0)).toBe(after.length);
            expect(violations(entry.end), 'heap order after every operation').toBe(0);
            for (const step of entry.steps) {
              checkStep(step, op);
              expect([before, after]).toContainEqual(keysOf(step.state));
            }
            before = after;
          });
        },
      ),
      { numRuns: 250 },
    );
  });

  it('links like a binary counter: an insert into 2^k − 1 keys makes k links', () => {
    for (const k of [1, 2, 3, 4]) {
      const n = 2 ** k - 1;
      const calls: OpCall[] = Array.from({ length: n + 1 }, (_, i) => ['insert', i + 1]);
      const t = new Timeline(binomialQueue, binomialQueue.defaults, 1, calls);
      expect(t.entries.at(-1)!.steps.at(-1)!.vars?.links).toBe(k);
      expect(listFrom(t.endState().nodes, t.endState().head)).toHaveLength(1);
    }
  });

  it('narrates the binary sum, the carries, and three of a kind', () => {
    const t = new Timeline(binomialQueue, binomialQueue.defaults, 1, [
      ...[12, 31, 8, 27, 45, 19].map((k) => ['insert', k] as OpCall),
      ['merge', '22 6 38 15 50 9 33'],
    ]);
    const says = t.entries
      .at(-1)!
      .steps.map((s) => s.say)
      .join(' ');
    expect(says).toContain('110₂ + 111₂ = 1101₂');
    expect(says).toContain('a carry into the next binary digit');
    expect(says).toContain('Three B₂ trees in a row');
  });

  it('draws pointers in the internal view and trees in the logical view', () => {
    const calls: OpCall[] = [10, 20, 30, 40].map((k) => ['insert', k] as OpCall);
    const scene = (view: BinSettings['view']) => {
      const t = new Timeline(binomialQueue, { view }, 1, calls);
      return binomialQueue.view(t.at(t.length - 1).step, { view });
    };
    const ids = (view: BinSettings['view']) => scene(view).shapes.map((s) => s.id);
    expect(ids('logical').filter((id) => id.startsWith('fedge-'))).toHaveLength(3);
    expect(ids('internal').filter((id) => id.startsWith('fchild-'))).toHaveLength(2);
    expect(ids('internal').filter((id) => id.startsWith('fsib-'))).toHaveLength(1);
    expect(ids('internal')).toContain('head-ptr');
    expect(ids('logical')).toContain('n-binary');
  });

  it('moves a decreased key with its own identity', () => {
    const t = new Timeline(binomialQueue, binomialQueue.defaults, 1, [
      ...[10, 30, 20, 40].map((k) => ['insert', k] as OpCall),
      ['decrease', 40, 5],
    ]);
    const before = t.entries[3]!.end;
    const after = t.endState();
    const vidOf = (s: BinState, k: number) => Object.values(s.nodes).find((n) => n.key === k)!.vid;
    const rootKey = (s: BinState) => s.nodes[s.head!]!.key;
    expect(rootKey(after)).toBe(5);
    expect(vidOf(after, 5)).toBe(vidOf(before, 40));
    expect(countFrom(after.nodes, after.head)).toBe(4);
  });

  it('refuses what it cannot do and leaves the queue alone', () => {
    const full = Array.from({ length: MAX_KEYS }, (_, i) => ['insert', i + 1] as OpCall);
    const t = new Timeline(binomialQueue, binomialQueue.defaults, 1, [
      ...full,
      ['insert', 99],
      ['decrease', 500, 1],
      ['decrease', 3, 9],
      ['insert', 'cat'],
    ]);
    for (const e of t.entries.slice(MAX_KEYS)) {
      expect(e.end).toEqual(t.entries[MAX_KEYS - 1]!.end);
      expect(e.steps.at(-1)!.marks.some((m) => m.role === 'error')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------

describe('binomial queue practice', () => {
  const kinds = binomialQueue.practice!;

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual([
      'insert-links',
      'union-trees',
      'extract-trees',
      'trees-after-insert',
    ]);
  });

  it('gets every answer right, checked against binary arithmetic', () => {
    const ones = (n: number) => n.toString(2).replace(/0/g, '').length;
    const trailingOnes = (n: number) =>
      n.toString(2).length - n.toString(2).replace(/1+$/, '').length;
    const bits = (n: number) =>
      [...n.toString(2)]
        .reverse()
        .map((b, i) => (b === '1' ? String(i) : ''))
        .filter(Boolean);
    for (let seed = 1; seed <= 80; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const n = q.setup.length;
        const a = q.answer;
        const [, arg] = q.watch![0]!;
        if (k.id === 'insert-links') expect(a).toEqual({ kind: 'number', value: trailingOnes(n) });
        else if (k.id === 'union-trees')
          expect(a).toEqual({ kind: 'sequence', value: bits(n + String(arg).split(' ').length) });
        else if (k.id === 'extract-trees')
          expect(a).toEqual({ kind: 'number', value: ones(n - 1) });
        else {
          if (a.kind !== 'choice') throw new Error('a choice');
          const sub = (d: string) => `B${'₀₁₂₃₄₅₆₇₈₉'[Number(d)]}`;
          const want = bits(n + 1)
            .reverse()
            .map(sub);
          const text =
            want.length === 1 ? want[0] : `${want.slice(0, -1).join(', ')} and ${want.at(-1)}`;
          expect(a.options[a.correct]).toBe(text);
        }
      }
    }
  });

  // With an even n the explanation said "carries through the 1 bits at the right end ...: 0".
  it('explains an insert with no link without talking about carries', () => {
    const k = kinds.find((x) => x.id === 'insert-links')!;
    for (let seed = 1; seed <= 80; seed++) {
      const q = k.make(makeRng(seed));
      if (q.answer.kind === 'number' && q.answer.value === 0)
        expect(q.explain).toContain('no carry and no link');
      else expect(q.explain).toContain('carries through');
    }
  });
});

describe('drawn text size', () => {
  // The degree under each node (pointers view) was 11 units: now 13. Two heaps one under the
  // other left 10.2 px on a laptop, and five trees in a row 8.6 on a phone; side by side on a
  // laptop and closer on a phone, 15.1 and 9.6.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(binomialQueue, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(binomialQueue, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
