import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { inorderKeys, shapeText, treeHeight } from '../avl/tree-kit';
import { treap } from '.';
import { above, parseTreapInput, type TreapSettings, type TreapState } from './model';

// ---------------------------------------------------------------------------------------------
// Reference: the textbook recursive treap, written independently.

interface RN {
  key: number;
  pri: number;
  left: RN | null;
  right: RN | null;
}

class RefTreap {
  root: RN | null = null;
  rotations = 0;
  constructor(readonly min: boolean) {}

  private higher = (a: number, b: number) => (this.min ? a < b : a > b);

  private rotR(x: RN): RN {
    const y = x.left!;
    x.left = y.right;
    y.right = x;
    this.rotations++;
    return y;
  }

  private rotL(x: RN): RN {
    const y = x.right!;
    x.right = y.left;
    y.left = x;
    this.rotations++;
    return y;
  }

  insert(k: number, p: number): void {
    const ins = (x: RN | null): RN => {
      if (!x) return { key: k, pri: p, left: null, right: null };
      if (k === x.key) return x;
      if (k < x.key) {
        x.left = ins(x.left);
        if (this.higher(x.left.pri, x.pri)) x = this.rotR(x);
      } else {
        x.right = ins(x.right);
        if (this.higher(x.right.pri, x.pri)) x = this.rotL(x);
      }
      return x;
    };
    this.root = ins(this.root);
  }

  delete(k: number): void {
    const del = (x: RN | null): RN | null => {
      if (!x) return null;
      if (k < x.key) x.left = del(x.left);
      else if (k > x.key) x.right = del(x.right);
      else if (!x.left) return x.right;
      else if (!x.right) return x.left;
      else if (this.higher(x.left.pri, x.right.pri)) {
        x = this.rotR(x);
        x.right = del(x.right);
      } else {
        x = this.rotL(x);
        x.left = del(x.left);
      }
      return x;
    };
    this.root = del(this.root);
  }

  shape(): string {
    const t = (x: RN | null): string => {
      if (!x) return '.';
      const label = `${x.key}:${x.pri}`;
      return !x.left && !x.right ? label : `(${label} ${t(x.left)} ${t(x.right)})`;
    };
    return t(this.root);
  }
}

const modelShape = (s: TreapState) =>
  shapeText(s, (u) => `${s.nodes[u]!.key}:${s.nodes[u]!.priority}`);

// ---------------------------------------------------------------------------------------------
// Invariants

/** Order and parent pointers; returns the keys of nodes on a heap-order violation. */
function check(st: TreapState, settings: TreapSettings, held: number | undefined) {
  const reached = new Set<number>();
  const broken: number[][] = [];
  const walk = (u: number | null, parent: number | null, lo: number, hi: number) => {
    if (u === null) return;
    expect(reached.has(u), `node ${u} reached once`).toBe(false);
    reached.add(u);
    const n = st.nodes[u]!;
    expect(n.parent).toBe(parent);
    expect(n.key, 'BST order').toBeGreaterThan(lo);
    expect(n.key, 'BST order').toBeLessThan(hi);
    expect(n.priority).toBeGreaterThanOrEqual(0);
    expect(n.priority).toBeLessThanOrEqual(99);
    if (parent !== null && above(settings, n.priority, st.nodes[parent]!.priority))
      broken.push([n.key, st.nodes[parent]!.key]);
    walk(n.left, u, lo, n.key);
    walk(n.right, u, n.key, hi);
  };
  walk(st.root, null, -Infinity, Infinity);
  const outside = Object.keys(st.nodes)
    .map(Number)
    .filter((u) => !reached.has(u));
  expect(outside).toEqual(held === undefined ? [] : [held]);
  return { size: reached.size, broken };
}

const settingsArb = fc.record({
  heap: fc.constantFrom('min' as const, 'max' as const),
  priority: fc.constantFrom('random' as const, 'typed' as const),
});

const keyArb = fc.integer({ min: 1, max: 30 });
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 4, arbitrary: keyArb.map((k) => ['insert', k] as OpCall) },
  {
    weight: 4,
    arbitrary: fc
      .tuple(keyArb, fc.integer({ min: 0, max: 20 }))
      .map(([k, p]) => ['insert', `${k}:${p}`] as OpCall),
  },
  { weight: 3, arbitrary: keyArb.map((k) => ['delete', k] as OpCall) },
  { weight: 1, arbitrary: keyArb.map((k) => ['search', k] as OpCall) },
  ...['min', 'max', 'inorder'].map((op) => ({ weight: 1, arbitrary: fc.constant([op] as OpCall) })),
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

const run = (calls: OpCall[], settings: Partial<TreapSettings> = {}, seed = 1) =>
  new Timeline(treap, { ...treap.defaults, ...settings } as TreapSettings, seed, calls);

describe('treap', () => {
  it('matches a reference treap, rotations included, and keeps the heap order', () => {
    fc.assert(
      fc.property(settingsArb, fc.array(callArb, { maxLength: 60 }), (settings, calls) => {
        const t = run(calls, settings);
        const ref = new RefTreap(settings.heap === 'min');
        calls.forEach((call, i) => {
          const [op, raw] = call;
          const [kText, pText] = String(raw ?? '').split(':');
          const k = Number(kText);
          const entry = t.entries[i]!;
          const before = i === 0 ? t.initial.state : t.entries[i - 1]!.end;
          const end = entry.end;
          const refRotations = ref.rotations;
          if (op === 'insert') {
            const fresh = !inorderKeys(before).includes(k);
            if (pText !== undefined || settings.priority === 'random') {
              // A random priority comes from the seeded generator: read it off the new node.
              const node = Object.values(end.nodes).find((n) => n.key === k);
              if (fresh) expect(node, `insert(${raw}) adds ${k}`).toBeDefined();
              if (pText !== undefined && fresh) expect(node!.priority).toBe(Number(pText));
              if (fresh) ref.insert(k, node!.priority);
            } else {
              expect(end, 'a bare key is refused when priorities are typed').toEqual(before);
            }
          }
          if (op === 'delete') ref.delete(k);
          if (op === 'clear') {
            ref.root = null;
            ref.rotations = 0;
          }
          expect(modelShape(end), `shape after ${op}(${raw ?? ''})`).toBe(ref.shape());
          expect(end.rotations - (op === 'clear' ? 0 : before.rotations), 'rotations').toBe(
            ref.rotations - (op === 'clear' ? 0 : refRotations),
          );
          for (const step of entry.steps) {
            const { size, broken } = check(step.state, settings, step.extra?.held);
            // Mid-operation, only the key being inserted or deleted may be out of heap order.
            for (const pair of broken) expect(pair, 'heap order').toContain(k);
            const v = step.vars ?? {};
            expect(v.N).toBe(size);
            expect(v.height).toBe(treeHeight(step.state));
            expect(v.rotations).toBe(step.state.rotations);
          }
          expect(check(end, settings, undefined).broken, 'heap order at the end').toEqual([]);
          if (!['insert', 'delete', 'clear'].includes(op)) expect(end).toEqual(before);
        });
      }),
      { numRuns: 300 },
    );
  });

  it('draws priorities from the seed, so a replay is identical', () => {
    const calls: OpCall[] = [10, 20, 30, 40, 50].map((k) => ['insert', k]);
    const a = run(calls, {}, 7).endState();
    const b = run(calls, {}, 7).endState();
    expect(modelShape(a)).toBe(modelShape(b));
    const others = [8, 9, 10, 11].map((seed) => modelShape(run(calls, {}, seed).endState()));
    expect(new Set([modelShape(a), ...others]).size).toBeGreaterThan(1);
  });

  it('puts the smallest priority at the root, or the largest with a max-heap', () => {
    const calls: OpCall[] = ['50:40', '30:60', '70:50', '40:10'].map((x) => ['insert', x]);
    const min = run(calls).endState();
    expect(min.nodes[min.root!]!.key).toBe(40);
    const max = run(calls, { heap: 'max' }).endState();
    expect(max.nodes[max.root!]!.key).toBe(30);
  });

  it('refuses bare keys when priorities are typed, and bad input always', () => {
    const t = run(
      [
        ['insert', '5:3'],
        ['insert', 7],
        ['insert', '5:x'],
        ['insert', '6:100'],
        ['delete', 'cat'],
      ],
      { priority: 'typed' },
    );
    for (const e of t.entries.slice(1)) {
      expect(e.end).toEqual(t.entries[0]!.end);
      expect(e.steps.at(-1)!.marks.some((m) => m.role === 'error')).toBe(true);
    }
    expect(parseTreapInput('50:7')).toBe('50:7');
    expect(parseTreapInput('50')).toBe(50);
    expect(parseTreapInput('50:700')).toBeInstanceOf(Error);
    expect(parseTreapInput('a:1')).toBeInstanceOf(Error);
  });
});
