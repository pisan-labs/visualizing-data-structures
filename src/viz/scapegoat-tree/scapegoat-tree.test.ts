import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { shapeText, treeHeight, treeSize } from '../_bst/tree-kit';
import { scapegoatTree } from '.';
import { type Alpha, type ScapegoatSettings, type ScapegoatState } from './model';

// ---------------------------------------------------------------------------------------------
// Reference: a scapegoat tree written from the paper's description, with plain numbers for α.

interface RN {
  key: number;
  left: RN | null;
  right: RN | null;
}

const ALPHA: Record<Alpha, number> = { '0.6': 0.6, '2/3': 2 / 3, '0.75': 0.75 };

class Ref {
  root: RN | null = null;
  n = 0;
  q = 0;
  rebuilds = 0;
  constructor(readonly a: number) {}

  size(x: RN | null): number {
    return x ? 1 + this.size(x.left) + this.size(x.right) : 0;
  }

  rebuildAt(x: RN): RN {
    const list: RN[] = [];
    const flat = (y: RN | null) => {
      if (!y) return;
      flat(y.left);
      list.push(y);
      flat(y.right);
    };
    flat(x);
    const build = (lo: number, hi: number): RN | null => {
      if (lo > hi) return null;
      const mid = Math.floor((lo + hi) / 2);
      const y = list[mid]!;
      y.left = build(lo, mid - 1);
      y.right = build(mid + 1, hi);
      return y;
    };
    this.rebuilds++;
    return build(0, list.length - 1)!;
  }

  insert(k: number) {
    const path: RN[] = [];
    let x = this.root;
    while (x) {
      if (x.key === k) return;
      path.push(x);
      x = k < x.key ? x.left : x.right;
    }
    const z: RN = { key: k, left: null, right: null };
    const p = path.at(-1);
    if (!p) this.root = z;
    else if (k < p.key) p.left = z;
    else p.right = z;
    this.n++;
    this.q = Math.max(this.q, this.n);
    const d = path.length;
    // Deep: d > log_{1/a} n. Plain floats; 1/a to a whole power is never a whole number here.
    if (d <= Math.log(this.n) / Math.log(1 / this.a) + 1e-9) return;
    let child: RN = z;
    for (let i = path.length - 1; i >= 0; i--) {
      const w = path[i]!;
      if (this.size(child) > this.a * this.size(w) + 1e-9) {
        const top = this.rebuildAt(w);
        const up = path[i - 1];
        if (!up) this.root = top;
        else if (up.left === w) up.left = top;
        else up.right = top;
        return;
      }
      child = w;
    }
    throw new Error('no scapegoat');
  }

  delete(k: number) {
    const del = (x: RN | null): RN | null => {
      if (!x) return null;
      if (k < x.key) x.left = del(x.left);
      else if (k > x.key) x.right = del(x.right);
      else {
        this.n--;
        if (!x.left) return x.right;
        if (!x.right) return x.left;
        // Successor: unlink the smallest node on the right and put it in x's place.
        let parent = x;
        let y = x.right;
        while (y.left) {
          parent = y;
          y = y.left;
        }
        if (parent !== x) {
          parent.left = y.right;
          y.right = x.right;
        }
        y.left = x.left;
        return y;
      }
      return x;
    };
    const before = this.n;
    this.root = del(this.root);
    if (this.n === before) return;
    if (this.n < this.a * this.q - 1e-9) {
      if (this.root) this.root = this.rebuildAt(this.root);
      this.q = this.n;
    }
  }

  shape(): string {
    const t = (x: RN | null): string =>
      !x ? '.' : !x.left && !x.right ? String(x.key) : `(${x.key} ${t(x.left)} ${t(x.right)})`;
    return t(this.root);
  }
}

function check(s: ScapegoatState, held: number | undefined, flat: number[] | undefined) {
  const reached = new Set<number>();
  const walk = (u: number | null, parent: number | null, lo: number, hi: number) => {
    if (u === null) return;
    reached.add(u);
    const n = s.nodes[u]!;
    expect(n.parent).toBe(parent);
    expect(n.key).toBeGreaterThan(lo);
    expect(n.key).toBeLessThan(hi);
    walk(n.left, u, lo, n.key);
    walk(n.right, u, n.key, hi);
  };
  walk(s.root, null, -Infinity, Infinity);
  const outside = Object.keys(s.nodes)
    .map(Number)
    .filter((u) => !reached.has(u))
    .sort((a, b) => a - b);
  const expected = [...(held === undefined ? [] : [held]), ...(flat ?? [])].sort((a, b) => a - b);
  expect(outside).toEqual(expected);
}

const keyArb = fc.integer({ min: 1, max: 40 });
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 6, arbitrary: keyArb.map((k) => ['insert', k] as OpCall) },
  { weight: 3, arbitrary: keyArb.map((k) => ['delete', k] as OpCall) },
  { weight: 1, arbitrary: keyArb.map((k) => ['search', k] as OpCall) },
  { weight: 1, arbitrary: fc.constant(['inorder'] as OpCall) },
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

const run = (calls: OpCall[], settings: Partial<ScapegoatSettings> = {}) =>
  new Timeline(
    scapegoatTree,
    { ...scapegoatTree.defaults, ...settings } as ScapegoatSettings,
    1,
    calls,
  );

describe('scapegoat tree', () => {
  it('matches a reference scapegoat tree, rebuilds included, and keeps the depth limit', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Alpha>('0.6', '2/3', '0.75'),
        fc.array(callArb, { maxLength: 70 }),
        (alpha, calls) => {
          const t = run(calls, { alpha });
          let ref = new Ref(ALPHA[alpha]);
          calls.forEach((call, i) => {
            const [op, raw] = call;
            const k = Number(raw);
            if (op === 'insert') ref.insert(k);
            if (op === 'delete') ref.delete(k);
            if (op === 'clear') ref = new Ref(ALPHA[alpha]);
            const e = t.entries[i]!;
            expect(shapeText(e.end), `after ${op}(${raw ?? ''})`).toBe(ref.shape());
            expect(e.end.rebuilds).toBe(ref.rebuilds);
            expect(e.end.maxSize).toBe(ref.q);
            for (const step of e.steps) {
              check(step.state, step.extra?.held, step.extra?.flat);
              expect(step.vars!.N).toBe(treeSize(step.state));
              expect(step.vars!.height).toBe(treeHeight(step.state));
            }
            // After an insert, every node is within the limit.
            if (op === 'insert') {
              const n = treeSize(e.end);
              expect(treeHeight(e.end)).toBeLessThanOrEqual(
                Math.floor(Math.log(Math.max(n, 1)) / Math.log(1 / ALPHA[alpha]) + 1e-9) + 1,
              );
            }
          });
        },
      ),
      { numRuns: 300 },
    );
  });

  it('rebuilds a chain of rising keys and stays low', () => {
    const t = run([10, 20, 30, 40, 50, 60, 70].map((k) => ['insert', k] as OpCall));
    expect(t.endState().rebuilds).toBeGreaterThan(0);
    expect(treeHeight(t.endState())).toBeLessThanOrEqual(4);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(scapegoatTree, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(scapegoatTree, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
