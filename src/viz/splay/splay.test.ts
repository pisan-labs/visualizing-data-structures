import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { inorderKeys, shapeText, treeHeight } from '../avl/tree-kit';
import { splayTree } from '.';
import type { SplaySettings, SplayState } from './model';

// ---------------------------------------------------------------------------------------------
// Reference: a bottom-up splay tree with object pointers, written independently.

interface RN {
  key: number;
  left: RN | null;
  right: RN | null;
  p: RN | null;
}

class RefSplay {
  root: RN | null = null;
  rotations = 0;
  constructor(readonly join: boolean) {}

  private up(x: RN): void {
    const p = x.p!;
    const g = p.p;
    if (p.left === x) {
      p.left = x.right;
      if (x.right) x.right.p = p;
      x.right = p;
    } else {
      p.right = x.left;
      if (x.left) x.left.p = p;
      x.left = p;
    }
    p.p = x;
    x.p = g;
    if (!g) this.root = x;
    else if (g.left === p) g.left = x;
    else g.right = x;
    this.rotations++;
  }

  splay(x: RN, stop: RN | null = null): void {
    while (x.p !== stop) {
      const p = x.p!;
      const g = p.p;
      if (g === stop) this.up(x);
      else if ((g!.left === p) === (p.left === x)) {
        this.up(p);
        this.up(x);
      } else {
        this.up(x);
        this.up(x);
      }
    }
  }

  /** The node with key k, or the last node on the way down. */
  find(k: number): RN | null {
    let x = this.root;
    let last: RN | null = null;
    while (x) {
      last = x;
      if (x.key === k) return x;
      x = k < x.key ? x.left : x.right;
    }
    return last;
  }

  search(k: number): boolean {
    const x = this.find(k);
    if (x) this.splay(x);
    return !!x && x.key === k;
  }

  insert(k: number): void {
    const y = this.find(k);
    if (y && y.key === k) {
      this.splay(y);
      return;
    }
    const z: RN = { key: k, left: null, right: null, p: y };
    if (!y) this.root = z;
    else if (k < y.key) y.left = z;
    else y.right = z;
    this.splay(z);
  }

  extreme(min: boolean): void {
    let x = this.root;
    if (!x) return;
    while (min ? x.left : x.right) x = (min ? x.left : x.right)!;
    this.splay(x);
  }

  delete(k: number): void {
    if (this.join) {
      if (!this.search(k)) return;
      const z = this.root!;
      if (!z.left) {
        this.root = z.right;
        if (z.right) z.right.p = null;
        return;
      }
      let m = z.left;
      while (m.right) m = m.right;
      this.splay(m, z);
      m.right = z.right;
      if (z.right) z.right.p = m;
      m.p = null;
      this.root = m;
      return;
    }
    const z = this.find(k);
    if (!z) return;
    if (z.key !== k) {
      this.splay(z);
      return;
    }
    const replace = (u: RN, v: RN | null) => {
      if (!u.p) this.root = v;
      else if (u.p.left === u) u.p.left = v;
      else u.p.right = v;
      if (v) v.p = u.p;
    };
    let target: RN | null;
    if (!z.left || !z.right) {
      target = z.p;
      replace(z, z.left ?? z.right);
    } else {
      let y = z.right;
      while (y.left) y = y.left;
      target = y === z.right ? y : y.p;
      if (y !== z.right) {
        replace(y, y.right);
        y.right = z.right;
        y.right.p = y;
      }
      replace(z, y);
      y.left = z.left;
      y.left.p = y;
    }
    if (target) this.splay(target);
  }

  shape(): string {
    const t = (x: RN | null): string =>
      !x ? '.' : !x.left && !x.right ? String(x.key) : `(${x.key} ${t(x.left)} ${t(x.right)})`;
    return t(this.root);
  }
}

// ---------------------------------------------------------------------------------------------

function checkStructure(st: SplayState, held: number | undefined): number {
  const reached = new Set<number>();
  const walk = (u: number | null, parent: number | null, lo: number, hi: number) => {
    if (u === null) return;
    expect(reached.has(u), `node ${u} reached once`).toBe(false);
    reached.add(u);
    const n = st.nodes[u]!;
    expect(n.uid).toBe(u);
    expect(n.parent, `parent of ${n.key}`).toBe(parent);
    expect(n.key, 'BST order').toBeGreaterThan(lo);
    expect(n.key, 'BST order').toBeLessThan(hi);
    walk(n.left, u, lo, n.key);
    walk(n.right, u, n.key, hi);
  };
  walk(st.root, null, -Infinity, Infinity);
  const outside = Object.keys(st.nodes)
    .map(Number)
    .filter((u) => !reached.has(u));
  expect(outside).toEqual(held === undefined ? [] : [held]);
  return reached.size;
}

const settingsArb = fc.record({ delete: fc.constantFrom('join' as const, 'bst' as const) });
const keyArb = fc.integer({ min: 1, max: 30 });
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 6, arbitrary: keyArb.map((k) => ['insert', k] as OpCall) },
  { weight: 3, arbitrary: keyArb.map((k) => ['delete', k] as OpCall) },
  { weight: 3, arbitrary: keyArb.map((k) => ['search', k] as OpCall) },
  ...['min', 'max', 'inorder'].map((op) => ({ weight: 1, arbitrary: fc.constant([op] as OpCall) })),
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

const run = (calls: OpCall[], settings: Partial<SplaySettings> = {}) =>
  new Timeline(splayTree, { ...splayTree.defaults, ...settings } as SplaySettings, 1, calls);

describe('splay tree', () => {
  it('matches a reference splay tree, rotations included, and keeps BST order on every step', () => {
    fc.assert(
      fc.property(settingsArb, fc.array(callArb, { maxLength: 60 }), (settings, calls) => {
        const t = run(calls, settings);
        const ref = new RefSplay(settings.delete === 'join');
        calls.forEach((call, i) => {
          const [op, raw] = call;
          const k = Number(raw);
          const entry = t.entries[i]!;
          const before = i === 0 ? t.initial.state : t.entries[i - 1]!.end;
          const refRotations = ref.rotations;
          const had = inorderKeys(before).includes(k);
          if (op === 'insert') ref.insert(k);
          if (op === 'delete') ref.delete(k);
          if (op === 'search') ref.search(k);
          if (op === 'min' || op === 'max') ref.extreme(op === 'min');
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
            const n = checkStructure(step.state, step.extra?.held);
            const v = step.vars ?? {};
            expect(v.N).toBe(n);
            expect(v.height).toBe(treeHeight(step.state));
            expect(v.rotations).toBe(step.state.rotations);
          }
          checkStructure(end, undefined);
          // What was accessed ends up at the root.
          const rootKey = end.root === null ? null : end.nodes[end.root]!.key;
          if ((op === 'search' && had) || op === 'insert') expect(rootKey).toBe(k);
          if (op === 'min' && end.root !== null) expect(rootKey).toBe(inorderKeys(end)[0]);
          if (op === 'max' && end.root !== null) expect(rootKey).toBe(inorderKeys(end).at(-1));
          if (op === 'search') expect(entry.steps.at(-1)!.vars?.found).toBe(had);
          if (op === 'inorder') {
            expect(end).toEqual(before);
            expect(entry.steps.at(-1)!.vars?.output).toBe(inorderKeys(end).join(' '));
          }
        });
      }),
      { numRuns: 300 },
    );
  });

  it('names zig, zig-zig and zig-zag', () => {
    const cases = (calls: OpCall[]) =>
      run(calls)
        .entries.at(-1)!
        .steps.map((s) => s.vars?.case)
        .filter((c) => c !== undefined);
    // Inserting in increasing order makes a left chain: 30 (20 (10 .) .) .
    expect(
      cases([
        ['insert', 10],
        ['insert', 20],
        ['insert', 30],
        ['search', 10],
      ]),
    ).toContain('zig-zig');
    expect(
      cases([
        ['insert', 10],
        ['insert', 20],
      ]),
    ).toContain('zig');
    expect(
      cases([
        ['insert', 10],
        ['insert', 30],
        ['insert', 20],
      ]),
    ).toContain('zig-zag');
  });

  it('makes a chain shallower when its deepest key is accessed', () => {
    const keys = Array.from({ length: 15 }, (_, i) => (i + 1) * 5);
    const t = run([...keys.map((k) => ['insert', k] as OpCall), ['search', 5]]);
    expect(treeHeight(t.entries.at(-2)!.end)).toBe(14);
    expect(treeHeight(t.endState())).toBeLessThanOrEqual(8);
  });

  it('turns bad arguments into a narrated error without changing the tree', () => {
    const t = run([
      ['insert', 5],
      ['insert', 'cat'],
      ['delete', 1234],
      ['search', '5.5'],
    ]);
    for (const e of t.entries.slice(1)) {
      expect(e.end).toEqual(t.entries[0]!.end);
      expect(e.steps.at(-1)!.marks.some((m) => m.role === 'error')).toBe(true);
    }
  });

  it('builds what the presets promise', () => {
    const p = splayTree.controls.presets!.find((x) => x.label.startsWith('Sorted (makes'))!;
    for (const n of splayTree.controls.sizes!) {
      expect(treeHeight(run(p.make(makeRng(n), n)).endState())).toBe(n - 1);
    }
  });
});
