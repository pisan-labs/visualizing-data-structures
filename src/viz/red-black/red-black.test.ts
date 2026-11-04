import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { inorderKeys, shapeText, treeHeight } from '../avl/tree-kit';
import { redBlack } from '.';
import {
  blackHeights,
  treeBlackHeight,
  type ExtraBlack,
  type RBSettings,
  type RBState,
} from './model';

// ---------------------------------------------------------------------------------------------
// Reference: CLRS red-black tree with a sentinel, written independently with object pointers.

interface RN {
  key: number;
  color: 'R' | 'B';
  left: RN;
  right: RN;
  p: RN;
}

class RefRB {
  readonly nil: RN;
  root: RN;
  rotations = 0;

  constructor(readonly succ: boolean) {
    const nil = { key: NaN, color: 'B' } as RN;
    nil.left = nil.right = nil.p = nil;
    this.nil = nil;
    this.root = nil;
  }

  private rotate(x: RN, left: boolean): void {
    const y = left ? x.right : x.left;
    if (left) {
      x.right = y.left;
      if (y.left !== this.nil) y.left.p = x;
    } else {
      x.left = y.right;
      if (y.right !== this.nil) y.right.p = x;
    }
    y.p = x.p;
    if (x.p === this.nil) this.root = y;
    else if (x === x.p.left) x.p.left = y;
    else x.p.right = y;
    if (left) y.left = x;
    else y.right = x;
    x.p = y;
    this.rotations++;
  }

  find(k: number): RN {
    let x = this.root;
    while (x !== this.nil && x.key !== k) x = k < x.key ? x.left : x.right;
    return x;
  }

  insert(k: number): void {
    if (this.find(k) !== this.nil) return;
    let y = this.nil;
    let x = this.root;
    while (x !== this.nil) {
      y = x;
      x = k < x.key ? x.left : x.right;
    }
    const z: RN = { key: k, color: 'R', left: this.nil, right: this.nil, p: y };
    if (y === this.nil) this.root = z;
    else if (k < y.key) y.left = z;
    else y.right = z;
    this.insertFixup(z);
  }

  private insertFixup(z: RN): void {
    while (z.p.color === 'R') {
      const left = z.p === z.p.p.left;
      const y = left ? z.p.p.right : z.p.p.left;
      if (y.color === 'R') {
        z.p.color = 'B';
        y.color = 'B';
        z.p.p.color = 'R';
        z = z.p.p;
      } else {
        if (z === (left ? z.p.right : z.p.left)) {
          z = z.p;
          this.rotate(z, left);
        }
        z.p.color = 'B';
        z.p.p.color = 'R';
        this.rotate(z.p.p, !left);
      }
    }
    this.root.color = 'B';
  }

  private transplant(u: RN, v: RN): void {
    if (u.p === this.nil) this.root = v;
    else if (u === u.p.left) u.p.left = v;
    else u.p.right = v;
    v.p = u.p;
  }

  delete(k: number): void {
    const z = this.find(k);
    if (z === this.nil) return;
    let y = z;
    let lost = y.color;
    let x: RN;
    if (z.left === this.nil) {
      x = z.right;
      this.transplant(z, z.right);
    } else if (z.right === this.nil) {
      x = z.left;
      this.transplant(z, z.left);
    } else if (this.succ) {
      y = z.right;
      while (y.left !== this.nil) y = y.left;
      lost = y.color;
      x = y.right;
      if (y !== z.right) {
        this.transplant(y, y.right);
        y.right = z.right;
        y.right.p = y;
      } else x.p = y;
      this.transplant(z, y);
      y.left = z.left;
      y.left.p = y;
      y.color = z.color;
    } else {
      y = z.left;
      while (y.right !== this.nil) y = y.right;
      lost = y.color;
      x = y.left;
      if (y !== z.left) {
        this.transplant(y, y.left);
        y.left = z.left;
        y.left.p = y;
      } else x.p = y;
      this.transplant(z, y);
      y.right = z.right;
      y.right.p = y;
      y.color = z.color;
    }
    if (lost === 'B') this.deleteFixup(x);
  }

  private deleteFixup(x: RN): void {
    while (x !== this.root && x.color === 'B') {
      const left = x === x.p.left;
      const sib = () => (left ? x.p.right : x.p.left);
      let w = sib();
      if (w.color === 'R') {
        w.color = 'B';
        x.p.color = 'R';
        this.rotate(x.p, left);
        w = sib();
      }
      const near = left ? w.left : w.right;
      const far = left ? w.right : w.left;
      if (near.color === 'B' && far.color === 'B') {
        w.color = 'R';
        x = x.p;
      } else {
        if (far.color === 'B') {
          near.color = 'B';
          w.color = 'R';
          this.rotate(w, !left);
          w = sib();
        }
        w.color = x.p.color;
        x.p.color = 'B';
        (left ? w.right : w.left).color = 'B';
        this.rotate(x.p, left);
        x = this.root;
      }
    }
    x.color = 'B';
  }

  shape(): string {
    const t = (x: RN): string => {
      if (x === this.nil) return '.';
      const label = `${x.key}${x.color}`;
      return x.left === this.nil && x.right === this.nil
        ? label
        : `(${label} ${t(x.left)} ${t(x.right)})`;
    };
    return t(this.root);
  }
}

const modelShape = (s: RBState) =>
  shapeText(s, (u) => `${s.nodes[u]!.key}${s.nodes[u]!.color === 'red' ? 'R' : 'B'}`);

// ---------------------------------------------------------------------------------------------
// Invariants

/** Order, parent pointers, no stray nodes. Returns how many red nodes have a red child. */
function checkStructure(
  st: RBState,
  held: number | undefined,
): { reached: Set<number>; redRed: number } {
  const reached = new Set<number>();
  let redRed = 0;
  const walk = (u: number | null, parent: number | null, lo: number, hi: number) => {
    if (u === null) return;
    expect(reached.has(u), `node ${u} reached once`).toBe(false);
    reached.add(u);
    const n = st.nodes[u]!;
    expect(n.uid).toBe(u);
    expect(['red', 'black']).toContain(n.color);
    expect(n.parent, `parent of ${n.key}`).toBe(parent);
    expect(n.key, 'BST order').toBeGreaterThan(lo);
    expect(n.key, 'BST order').toBeLessThan(hi);
    if (n.color === 'red' && parent !== null && st.nodes[parent]!.color === 'red') redRed++;
    walk(n.left, u, lo, n.key);
    walk(n.right, u, n.key, hi);
  };
  walk(st.root, null, -Infinity, Infinity);
  const outside = Object.keys(st.nodes)
    .map(Number)
    .filter((u) => !reached.has(u));
  expect(outside, 'only a node lifted out during delete is outside the tree').toEqual(
    held === undefined ? [] : [held],
  );
  return { reached, redRed };
}

function checkBlackHeights(st: RBState, extra: ExtraBlack | undefined) {
  for (const [u, bh] of blackHeights(st, extra))
    expect(bh, `every path below ${st.nodes[u]!.key} has as many black nodes`).not.toBeNull();
}

const settingsArb = fc.record({
  delete: fc.constantFrom('successor' as const, 'predecessor' as const),
  nils: fc.boolean(),
  bh: fc.boolean(),
});

const keyArb = fc.integer({ min: 1, max: 40 });
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 8, arbitrary: keyArb.map((k) => ['insert', k] as OpCall) },
  { weight: 5, arbitrary: keyArb.map((k) => ['delete', k] as OpCall) },
  { weight: 1, arbitrary: keyArb.map((k) => ['search', k] as OpCall) },
  ...['min', 'max', 'inorder'].map((op) => ({ weight: 1, arbitrary: fc.constant([op] as OpCall) })),
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

const run = (calls: OpCall[], settings: Partial<RBSettings> = {}) =>
  new Timeline(redBlack, { ...redBlack.defaults, ...settings } as RBSettings, 1, calls);

const insertAll = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k] as OpCall);

describe('red-black tree', () => {
  it('matches a CLRS reference, colors and rotations included, and keeps the rules on every step', () => {
    fc.assert(
      fc.property(settingsArb, fc.array(callArb, { maxLength: 60 }), (settings, calls) => {
        const t = run(calls, settings);
        const ref = new RefRB(settings.delete === 'successor');
        calls.forEach((call, i) => {
          const [op, raw] = call;
          const entry = t.entries[i]!;
          const before = i === 0 ? t.initial.state : t.entries[i - 1]!.end;
          const refRotations = ref.rotations;
          if (op === 'insert') ref.insert(Number(raw));
          if (op === 'delete') ref.delete(Number(raw));
          if (op === 'clear') {
            ref.root = ref.nil;
            ref.rotations = 0;
          }
          const end = entry.end;
          expect(modelShape(end), `shape after ${op}(${raw ?? ''})`).toBe(ref.shape());
          expect(end.rotations - (op === 'clear' ? 0 : before.rotations), 'rotations').toBe(
            ref.rotations - (op === 'clear' ? 0 : refRotations),
          );

          for (const step of entry.steps) {
            const { reached, redRed } = checkStructure(step.state, step.extra?.held);
            // Mid-fixup one red node may have a red child; insert and delete fix it by the end.
            expect(redRed, 'red-red pairs').toBeLessThanOrEqual(
              op === 'insert' || op === 'delete' ? 1 : 0,
            );
            checkBlackHeights(step.state, step.extra?.extraBlack);
            const v = step.vars ?? {};
            expect(v.N).toBe(reached.size);
            expect(v.height).toBe(treeHeight(step.state));
            expect(v['black-height']).toBe(treeBlackHeight(step.state, step.extra?.extraBlack));
            expect(v.rotations).toBe(step.state.rotations);
          }

          // When an operation ends, every rule holds without any extra black.
          const last = entry.steps.at(-1)!;
          expect(last.extra?.extraBlack, 'no extra black left over').toBeUndefined();
          expect(checkStructure(end, undefined).redRed).toBe(0);
          checkBlackHeights(end, undefined);
          if (end.root !== null) expect(end.nodes[end.root]!.color).toBe('black');
          if (!['insert', 'delete', 'clear'].includes(op)) {
            expect(end, `${op} does not change the tree`).toEqual(before);
          }
          if (op === 'inorder') expect(last.vars?.output).toBe(inorderKeys(end).join(' '));
        });
      }),
      { numRuns: 300 },
    );
  });

  it('names the insert cases', () => {
    const casesOf = (calls: OpCall[]) =>
      run(calls)
        .entries.at(-1)!
        .steps.map((s) => s.vars?.case)
        .filter((c) => c !== undefined);
    expect(casesOf(insertAll([50, 30, 70, 20]))).toContain(1);
    expect(casesOf(insertAll([50, 30, 40]))).toEqual(expect.arrayContaining([2, 3]));
    expect(casesOf(insertAll([50, 30, 20]))).toContain(3);
    const say = run(insertAll([50, 30, 70, 20]))
      .entries.at(-1)!
      .steps.map((s) => s.say);
    expect(say.some((s) => s.includes('The uncle 70 is red too: case 1, recolor.'))).toBe(true);
  });

  it('reaches every delete case, and the extra black never gets lost', () => {
    const seen = new Set<number>();
    const rng = makeRng(5);
    for (let trial = 0; trial < 200 && seen.size < 4; trial++) {
      const keys = Array.from({ length: rng.int(4, 14) }, () => rng.int(1, 60));
      const t = run([...insertAll(keys), ['delete', keys[rng.int(0, keys.length - 1)]!]]);
      for (const s of t.entries.at(-1)!.steps) {
        if (typeof s.vars?.case === 'number') seen.add(s.vars.case);
      }
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
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

  it('stays shallow on sorted input', () => {
    for (const n of redBlack.controls.sizes!) {
      const p = redBlack.controls.presets!.find((x) => x.label.startsWith('Sorted'))!;
      const end = run(p.make(makeRng(n), n)).endState();
      expect(treeHeight(end)).toBeLessThanOrEqual(2 * Math.log2(n + 1));
    }
  });
});
