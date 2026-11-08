import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { shapeText, treeSize } from '../_bst/tree-kit';
import { aaTree } from '.';
import { type AASettings, type AAState } from './model';

// ---------------------------------------------------------------------------------------------
// Reference: Andersson's recursive AA tree, with the usual value-copying delete.

interface RN {
  key: number;
  level: number;
  left: RN | null;
  right: RN | null;
}

class Ref {
  root: RN | null = null;
  skews = 0;
  splits = 0;
  skew(t: RN | null): RN | null {
    if (t && t.left && t.left.level === t.level) {
      const l = t.left;
      t.left = l.right;
      l.right = t;
      this.skews++;
      return l;
    }
    return t;
  }
  split(t: RN | null): RN | null {
    if (t && t.right && t.right.right && t.right.right.level === t.level) {
      const r = t.right;
      t.right = r.left;
      r.left = t;
      r.level++;
      this.splits++;
      return r;
    }
    return t;
  }
  insert(k: number) {
    const ins = (t: RN | null): RN => {
      if (!t) return { key: k, level: 1, left: null, right: null };
      if (k === t.key) return t;
      if (k < t.key) t.left = ins(t.left);
      else t.right = ins(t.right);
      return this.split(this.skew(t))!;
    };
    this.root = ins(this.root);
  }
  delete(k: number) {
    const lv = (t: RN | null) => (t ? t.level : 0);
    const del = (t: RN | null, k: number): RN | null => {
      if (!t) return null;
      if (k < t.key) t.left = del(t.left, k);
      else if (k > t.key) t.right = del(t.right, k);
      else if (!t.left && !t.right) return null;
      else if (!t.left) {
        t.key = t.right!.key;
        t.right = del(t.right, t.key);
      } else {
        let p = t.left;
        while (p.right) p = p.right;
        t.key = p.key;
        t.left = del(t.left, t.key);
      }
      const should = Math.min(lv(t.left), lv(t.right)) + 1;
      if (should < t.level) {
        t.level = should;
        if (t.right && should < t.right.level) t.right.level = should;
      }
      t = this.skew(t)!;
      t.right = this.skew(t.right);
      if (t.right) t.right.right = this.skew(t.right.right);
      t = this.split(t)!;
      t.right = this.split(t.right);
      return t;
    };
    this.root = del(this.root, k);
  }
  shape(): string {
    const s = (t: RN | null): string =>
      !t
        ? '.'
        : !t.left && !t.right
          ? `${t.key}:${t.level}`
          : `(${t.key}:${t.level} ${s(t.left)} ${s(t.right)})`;
    return s(this.root);
  }
}

const modelShape = (s: AAState) => shapeText(s, (u) => `${s.nodes[u]!.key}:${s.nodes[u]!.level}`);

/** The AA rules, on a finished tree. */
function checkRules(s: AAState) {
  const walk = (u: number | null) => {
    if (u === null) return;
    const n = s.nodes[u]!;
    const l = n.left === null ? null : s.nodes[n.left]!;
    const r = n.right === null ? null : s.nodes[n.right]!;
    if (!l && !r) expect(n.level, 'a leaf is on level 1').toBe(1);
    if (l) expect(l.level, 'left child one level down').toBe(n.level - 1);
    else expect(n.level, 'no left child: level 1').toBe(1);
    if (r) {
      expect([n.level, n.level - 1]).toContain(r.level);
      if (r.right !== null) expect(s.nodes[r.right]!.level).toBeLessThan(n.level);
    }
    if (n.level > 1) expect(l && r, 'two children above level 1').toBeTruthy();
    walk(n.left);
    walk(n.right);
  };
  walk(s.root);
}

function checkTree(s: AAState, held: number | undefined) {
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
    .filter((u) => !reached.has(u));
  expect(outside).toEqual(held === undefined ? [] : [held]);
}

const keyArb = fc.integer({ min: 1, max: 40 });
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 6, arbitrary: keyArb.map((k) => ['insert', k] as OpCall) },
  { weight: 4, arbitrary: keyArb.map((k) => ['delete', k] as OpCall) },
  { weight: 1, arbitrary: keyArb.map((k) => ['search', k] as OpCall) },
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

const run = (calls: OpCall[], settings: Partial<AASettings> = {}) =>
  new Timeline(aaTree, { ...aaTree.defaults, ...settings } as AASettings, 1, calls);

describe('AA tree', () => {
  it('matches the recursive AA tree, skews and splits included, and keeps the rules', () => {
    fc.assert(
      fc.property(fc.array(callArb, { maxLength: 70 }), (calls) => {
        const t = run(calls);
        let ref = new Ref();
        calls.forEach((call, i) => {
          const [op, raw] = call;
          const k = Number(raw);
          if (op === 'insert') ref.insert(k);
          if (op === 'delete') ref.delete(k);
          if (op === 'clear') ref = new Ref();
          const e = t.entries[i]!;
          expect(modelShape(e.end), `after ${op}(${raw ?? ''})`).toBe(ref.shape());
          expect(e.end.skews).toBe(ref.skews);
          expect(e.end.splits).toBe(ref.splits);
          checkRules(e.end);
          for (const step of e.steps) {
            checkTree(step.state, step.extra?.held);
            expect(step.vars!.N).toBe(treeSize(step.state));
          }
        });
      }),
      { numRuns: 300 },
    );
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(aaTree, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(aaTree, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
