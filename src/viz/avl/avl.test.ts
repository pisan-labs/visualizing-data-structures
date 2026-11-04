import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { avl, fibNodes, sparsestOrder, zigzagOrderOf } from '.';
import { shownHeight, type AVLSettings, type AVLState } from './model';
import { inorderKeys, shapeText, treeHeight } from './tree-kit';

// ---------------------------------------------------------------------------------------------
// Reference: the textbook recursive AVL tree (Weiss style), written independently. Delete copies
// the successor's (or predecessor's) key instead of moving the node, so only keys are compared.

interface RNode {
  key: number;
  h: number;
  left: RNode | null;
  right: RNode | null;
}

class RefAVL {
  root: RNode | null = null;
  rotations = 0;
  constructor(readonly succ: boolean) {}

  private h = (x: RNode | null) => (x ? x.h : -1);
  private fix = (x: RNode) => (x.h = 1 + Math.max(this.h(x.left), this.h(x.right)));
  private bal = (x: RNode) => this.h(x.left) - this.h(x.right);

  private rotR(x: RNode): RNode {
    const y = x.left!;
    x.left = y.right;
    y.right = x;
    this.fix(x);
    this.fix(y);
    this.rotations++;
    return y;
  }

  private rotL(x: RNode): RNode {
    const y = x.right!;
    x.right = y.left;
    y.left = x;
    this.fix(x);
    this.fix(y);
    this.rotations++;
    return y;
  }

  private balance(x: RNode): RNode {
    this.fix(x);
    if (this.bal(x) > 1) {
      if (this.bal(x.left!) < 0) x.left = this.rotL(x.left!);
      return this.rotR(x);
    }
    if (this.bal(x) < -1) {
      if (this.bal(x.right!) > 0) x.right = this.rotR(x.right!);
      return this.rotL(x);
    }
    return x;
  }

  insert(k: number): void {
    const ins = (x: RNode | null): RNode => {
      if (!x) return { key: k, h: 0, left: null, right: null };
      if (k < x.key) x.left = ins(x.left);
      else if (k > x.key) x.right = ins(x.right);
      else return x;
      return this.balance(x);
    };
    this.root = ins(this.root);
  }

  delete(k: number): void {
    const del = (x: RNode | null, k: number): RNode | null => {
      if (!x) return null;
      if (k < x.key) x.left = del(x.left, k);
      else if (k > x.key) x.right = del(x.right, k);
      else if (!x.left) return x.right;
      else if (!x.right) return x.left;
      else if (this.succ) {
        let y = x.right;
        while (y.left) y = y.left;
        x.key = y.key;
        x.right = del(x.right, y.key);
      } else {
        let y = x.left;
        while (y.right) y = y.right;
        x.key = y.key;
        x.left = del(x.left, y.key);
      }
      return this.balance(x);
    };
    this.root = del(this.root, k);
  }

  shape(): string {
    const t = (x: RNode | null): string =>
      !x ? '.' : !x.left && !x.right ? String(x.key) : `(${x.key} ${t(x.left)} ${t(x.right)})`;
    return t(this.root);
  }
}

// ---------------------------------------------------------------------------------------------
// Invariants

/** Order, parent pointers, and no stray nodes; returns the true height of every node. */
function checkStructure(st: AVLState, held: number | undefined): Map<number, number> {
  const heights = new Map<number, number>();
  const walk = (u: number | null, parent: number | null, lo: number, hi: number): number => {
    if (u === null) return -1;
    expect(heights.has(u), `node ${u} reached once`).toBe(false);
    heights.set(u, NaN);
    const n = st.nodes[u]!;
    expect(n, `node ${u} exists`).toBeDefined();
    expect(n.uid).toBe(u);
    expect(u).toBeLessThan(st.nextUid);
    expect(n.parent, `parent of ${n.key}`).toBe(parent);
    expect(n.key, 'BST order').toBeGreaterThan(lo);
    expect(n.key, 'BST order').toBeLessThan(hi);
    const h = 1 + Math.max(walk(n.left, u, lo, n.key), walk(n.right, u, n.key, hi));
    heights.set(u, h);
    return h;
  };
  walk(st.root, null, -Infinity, Infinity);
  const outside = Object.keys(st.nodes)
    .map(Number)
    .filter((u) => !heights.has(u));
  expect(outside, 'only a node lifted out during delete is outside the tree').toEqual(
    held === undefined ? [] : [held],
  );
  return heights;
}

const trueBalance = (st: AVLState, heights: Map<number, number>, u: number) => {
  const n = st.nodes[u]!;
  const h = (v: number | null) => (v === null ? -1 : heights.get(v)!);
  return h(n.left) - h(n.right);
};

const settingsArb = fc.record({
  delete: fc.constantFrom('successor' as const, 'predecessor' as const),
  show: fc.constantFrom('both' as const, 'height' as const, 'balance' as const),
  bf: fc.constantFrom('left' as const, 'right' as const),
  leaf: fc.constantFrom('zero' as const, 'one' as const),
});

const keyArb = fc.integer({ min: 1, max: 40 });
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 8, arbitrary: keyArb.map((k) => ['insert', k] as OpCall) },
  { weight: 4, arbitrary: keyArb.map((k) => ['delete', k] as OpCall) },
  { weight: 1, arbitrary: keyArb.map((k) => ['search', k] as OpCall) },
  ...['min', 'max', 'inorder'].map((op) => ({ weight: 1, arbitrary: fc.constant([op] as OpCall) })),
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

const run = (calls: OpCall[], settings: Partial<AVLSettings> = {}) =>
  new Timeline(avl, { ...avl.defaults, ...settings } as AVLSettings, 1, calls);

const insertAll = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k] as OpCall);

describe('AVL tree', () => {
  it('matches a reference AVL tree, rotations included, and keeps every invariant', () => {
    fc.assert(
      fc.property(settingsArb, fc.array(callArb, { maxLength: 60 }), (settings, calls) => {
        const t = run(calls, settings);
        const ref = new RefAVL(settings.delete === 'successor');
        calls.forEach((call, i) => {
          const [op, raw] = call;
          const entry = t.entries[i]!;
          const before = i === 0 ? t.initial.state : t.entries[i - 1]!.end;
          const refRotations = ref.rotations;
          if (op === 'insert') ref.insert(Number(raw));
          if (op === 'delete') ref.delete(Number(raw));
          if (op === 'clear') {
            ref.root = null;
            ref.rotations = 0;
          }
          const end = entry.end;
          expect(shapeText(end), `shape after ${op}(${raw ?? ''})`).toBe(ref.shape());
          expect(end.rotations - (op === 'clear' ? 0 : before.rotations), 'rotations').toBe(
            ref.rotations - (op === 'clear' ? 0 : refRotations),
          );

          for (const step of entry.steps) {
            const heights = checkStructure(step.state, step.extra?.held);
            for (const u of heights.keys()) {
              const b = trueBalance(step.state, heights, u);
              expect(Math.abs(b), 'never more than 2 out of balance, even mid-fix').toBeLessThan(3);
            }
            const v = step.vars ?? {};
            expect(v.N).toBe(heights.size);
            expect(v.height).toBe(shownHeight(treeHeight(step.state), settings));
            expect(v.rotations).toBe(step.state.rotations);
          }

          // When an operation ends, stored heights are right and every node is balanced.
          const heights = checkStructure(end, undefined);
          for (const [u, h] of heights) {
            expect(end.nodes[u]!.height, `stored height of ${end.nodes[u]!.key}`).toBe(h);
            expect(Math.abs(trueBalance(end, heights, u))).toBeLessThan(2);
          }
          if (!['insert', 'delete', 'clear'].includes(op)) {
            expect(end, `${op} does not change the tree`).toEqual(before);
          }
          if (op === 'inorder') {
            expect(entry.steps.at(-1)!.vars?.output).toBe(inorderKeys(end).join(' '));
          }
        });
      }),
      { numRuns: 300 },
    );
  });

  it('names each of the four rotation cases', () => {
    const cases: [string, number[]][] = [
      ['LL', [30, 20, 10]],
      ['RR', [10, 20, 30]],
      ['LR', [30, 10, 20]],
      ['RL', [10, 30, 20]],
    ];
    for (const [name, keys] of cases) {
      const t = run(insertAll(keys));
      const last = t.entries[2]!;
      expect(last.steps.some((s) => s.vars?.case === name)).toBe(true);
      expect(last.steps.some((s) => s.say.includes(`the ${name} case`))).toBe(true);
      expect(last.end.rotations).toBe(name.length === 2 && name[0] === name[1] ? 1 : 2);
      expect(t.endState().nodes[t.endState().root!]!.key).toBe(20);
    }
  });

  it('moves nodes, not keys: a rotation keeps every node and its identity', () => {
    const t = run(insertAll([10, 20, 30]));
    const before = t.entries[1]!.end;
    const after = t.endState();
    const uid = (s: AVLState, key: number) => Object.values(s.nodes).find((n) => n.key === key)!;
    expect(after.root).toBe(uid(before, 20).uid);
    expect(after.nodes[uid(before, 20).uid]!.left).toBe(uid(before, 10).uid);
  });

  it('rebalances all the way up after a delete', () => {
    // The sparsest tree of height 4: deleting from its short side rotates at two levels.
    const keys = sparsestOrder(Array.from({ length: 12 }, (_, i) => (i + 1) * 10));
    const t = run([...insertAll(keys), ['delete', 120]]);
    expect(t.entries.slice(0, -1).every((e) => e.end.rotations === 0)).toBe(true);
    const del = t.entries.at(-1)!;
    expect(del.end.rotations).toBe(2);
    expect(treeHeight(del.end)).toBe(3);
  });

  it('narrates the walk back up', () => {
    const t = run([...insertAll([50, 30, 70, 20]), ['insert', 10]]);
    const says = t.entries.at(-1)!.steps.map((s) => s.say);
    expect(says).toContain(
      'Back at 20: height 0 → 1, balance +1, which is fine. The height changed, so keep going up.',
    );
    expect(says.some((s) => s.startsWith('Back at 30: height 1 → 2, but its balance is +2'))).toBe(
      true,
    );
    expect(says.at(-1)).toContain('This insert made 1 rotation.');
    const right = run([...insertAll([50, 30, 70, 20]), ['insert', 10]], { bf: 'right' });
    expect(right.entries.at(-1)!.steps.some((s) => s.say.includes('its balance is −2'))).toBe(true);
  });

  it('turns bad arguments into a narrated error without changing the tree', () => {
    const t = run([
      ['insert', 5],
      ['insert', 'cat'],
      ['delete', 1234],
      ['search', '5.5'],
      ['insert', 5],
    ]);
    for (const e of t.entries.slice(1)) {
      expect(e.end).toEqual(t.entries[0]!.end);
      expect(e.steps.at(-1)!.marks.some((m) => m.role === 'error')).toBe(true);
    }
  });

  it('builds the preset shapes it promises', () => {
    const presets = avl.controls.presets!;
    const heightOf = (label: string, n: number) => {
      const p = presets.find((x) => x.label.startsWith(label))!;
      return treeHeight(run(p.make(makeRng(n), n)).endState());
    };
    for (const n of avl.controls.sizes!) {
      // Sorted input gives a perfect tree when n = 2^k - 1.
      expect(heightOf('Sorted', n)).toBe(Math.log2(n + 1) - 1);
      expect(heightOf('Reverse', n)).toBe(Math.log2(n + 1) - 1);
      let h = 0;
      while (fibNodes(h + 1) <= n) h++;
      expect(heightOf('Sparsest', n)).toBe(h);
    }
    expect(fibNodes(4)).toBe(12);
    expect(zigzagOrderOf([1, 2, 3, 4, 5])).toEqual([1, 5, 2, 4, 3]);
  });
});
