import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Step } from '../../engine/types';
import { fibonacciHeap } from '.';
import {
  countNodes,
  marked,
  maxDegree,
  MAX_KEYS,
  subtreeSize,
  type FibExtra,
  type FibSettings,
  type FibState,
} from './model';

// ---------------------------------------------------------------------------------------------
// Reference: CLRS's Fibonacci heap with the same list conventions (new roots go left of H.min,
// a link puts the new child first, consolidate rebuilds the root list in order of degree),
// written independently with plain objects.

interface RN {
  key: number;
  mark: boolean;
  parent: RN | null;
  children: RN[];
}

class RefFib {
  roots: RN[] = [];
  min: RN | null = null;
  cuts = 0;

  private addRoot(x: RN): void {
    x.parent = null;
    x.mark = false;
    const at = this.min ? this.roots.indexOf(this.min) : this.roots.length;
    this.roots.splice(at, 0, x);
  }

  insert(k: number): void {
    const x: RN = { key: k, mark: false, parent: null, children: [] };
    this.addRoot(x);
    if (!this.min || k < this.min.key) this.min = x;
  }

  union(keys: number[]): void {
    const other = new RefFib();
    keys.forEach((k) => other.insert(k));
    this.roots.push(...other.roots);
    if (!this.min || other.min!.key < this.min.key) this.min = other.min;
  }

  extractMin(): number | undefined {
    const z = this.min;
    if (!z) return undefined;
    const i = this.roots.indexOf(z);
    for (const c of z.children) {
      c.parent = null;
      c.mark = false;
    }
    this.roots.splice(i, 0, ...z.children);
    const j = this.roots.indexOf(z);
    const right = this.roots.length > 1 ? this.roots[(j + 1) % this.roots.length]! : null;
    this.roots.splice(j, 1);
    this.min = right;
    if (right) this.consolidate();
    return z.key;
  }

  private consolidate(): void {
    const table: (RN | undefined)[] = [];
    for (const w of [...this.roots]) {
      let x = w;
      let d = x.children.length;
      while (table[d]) {
        let y = table[d]!;
        if (x.key > y.key) [x, y] = [y, x];
        this.roots.splice(this.roots.indexOf(y), 1);
        y.parent = x;
        y.mark = false;
        x.children.unshift(y);
        table[d] = undefined;
        d++;
      }
      table[d] = x;
    }
    this.roots = table.filter((t): t is RN => !!t);
    this.min = null;
    for (const r of this.roots) if (!this.min || r.key < this.min.key) this.min = r;
  }

  find(k: number, list: RN[] = this.roots): RN | null {
    for (const x of list) {
      if (x.key === k) return x;
      const below = this.find(k, x.children);
      if (below) return below;
    }
    return null;
  }

  private cut(x: RN, y: RN): void {
    y.children.splice(y.children.indexOf(x), 1);
    this.addRoot(x);
    this.cuts++;
  }

  decrease(x: RN, k: number): void {
    x.key = k;
    let y = x.parent;
    if (y && x.key < y.key) {
      this.cut(x, y);
      for (let z = y.parent; z; y = z, z = z.parent) {
        if (!y.mark) {
          y.mark = true;
          break;
        }
        this.cut(y, z);
      }
    }
    if (x.key < this.min!.key) this.min = x;
  }

  shape(list: RN[] = this.roots): string {
    return list.map((x) => `(${x.key}${x.mark ? '*' : ''} ${this.shape(x.children)})`).join('');
  }

  marked(list: RN[] = this.roots): number {
    return list.reduce((n, x) => n + (x.mark ? 1 : 0) + this.marked(x.children), 0);
  }

  size(list: RN[] = this.roots): number {
    return list.reduce((n, x) => n + 1 + this.size(x.children), 0);
  }
}

function modelShape(s: FibState, list: number[] = s.roots): string {
  return list
    .map((u) => {
      const n = s.nodes[u]!;
      return `(${n.key}${n.mark ? '*' : ''} ${modelShape(s, n.children)})`;
    })
    .join('');
}

const keysOf = (s: FibState) =>
  Object.values(s.nodes)
    .map((n) => n.key)
    .sort((a, b) => a - b);

const fib = (k: number): number => (k < 2 ? k : fib(k - 1) + fib(k - 2));

// ---------------------------------------------------------------------------------------------
// Invariants every step must keep.

function checkStep(step: Step<FibState, FibExtra>, op: string) {
  const s = step.state;
  const seen = new Set<number>();
  let broken = 0;
  const walk = (u: number, parent: number | null) => {
    expect(seen.has(u), `node ${u} reached once`).toBe(false);
    seen.add(u);
    const n = s.nodes[u]!;
    expect(n.parent, `parent of ${n.key}`).toBe(parent);
    if (parent !== null && n.key < s.nodes[parent]!.key) broken++;
    n.children.forEach((c) => walk(c, u));
  };
  for (const r of [...s.roots, ...s.other]) {
    walk(r, null);
    expect(s.nodes[r]!.mark, 'a root is never marked').toBe(false);
  }
  expect(Object.keys(s.nodes).length, 'no node is lost').toBe(seen.size);
  // Heap order holds, except for the moment a decreased key has not been cut yet.
  expect(broken, step.say).toBeLessThanOrEqual(op === 'decrease' || op === 'delete' ? 1 : 0);
  // H.min is the smallest root, unless the step says it is still being worked out.
  if (s.roots.length && !step.extra?.minPending) {
    expect(s.min !== null && s.roots.includes(s.min)).toBe(true);
    const smallest = Math.min(...s.roots.map((r) => s.nodes[r]!.key));
    expect(s.nodes[s.min!]!.key, `H.min: ${step.say}`).toBe(smallest);
  }
  if (s.roots.length === 0) expect(s.min).toBeNull();
  const t = s.roots.length + s.other.length;
  const m = marked(s.nodes);
  expect(step.vars?.N).toBe(countNodes(s.nodes, s.roots) + countNodes(s.nodes, s.other));
  expect(step.vars?.['t(H)']).toBe(t);
  expect(step.vars?.['m(H)']).toBe(m);
  expect(step.vars?.['Φ']).toBe(t + 2 * m);
}

const keyArb = fc.integer({ min: 1, max: 40 });
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 8, arbitrary: keyArb.map((k) => ['insert', k] as OpCall) },
  { weight: 1, arbitrary: fc.constant(['findmin'] as OpCall) },
  { weight: 3, arbitrary: fc.constant(['deletemin'] as OpCall) },
  {
    weight: 1,
    arbitrary: fc
      .array(keyArb, { minLength: 1, maxLength: 6 })
      .map((ks) => ['union', ks.join(' ')] as OpCall),
  },
  {
    weight: 4,
    arbitrary: fc
      .tuple(keyArb, fc.integer({ min: -20, max: 40 }))
      .map(([a, b]) => ['decrease', a, b] as OpCall),
  },
  { weight: 2, arbitrary: keyArb.map((k) => ['delete', k] as OpCall) },
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

describe('Fibonacci heap', () => {
  it('matches a reference Fibonacci heap, marks included, and keeps every invariant', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('logical' as const, 'internal' as const),
        fc.array(callArb, { maxLength: 45 }),
        (view, calls) => {
          const settings: FibSettings = { view };
          const t = new Timeline(fibonacciHeap, settings, 1, calls);
          const ref = new RefFib();
          let before = keysOf(t.initial.state);
          calls.forEach((call, i) => {
            const [op, a, b] = call;
            const entry = t.entries[i]!;
            const last = entry.steps.at(-1)!;
            const v = last.vars ?? {};
            const refused = last.marks.some((m) => m.id === 'arg-box');
            if (op === 'insert' && !refused) ref.insert(Number(a));
            if (op === 'union' && !refused) ref.union(String(a).split(' ').map(Number));
            if (op === 'findmin') expect(v.returned).toBe(ref.min?.key);
            if (op === 'deletemin') expect(v.returned).toBe(ref.extractMin());
            if (op === 'decrease') {
              const x = ref.find(Number(a));
              const ok = x !== null && Number(b) <= x.key;
              expect(refused, `decrease ${a} ${b}`).toBe(!ok);
              if (ok) ref.decrease(x, Number(b));
            }
            if (op === 'delete') {
              const x = ref.find(Number(a));
              expect(refused).toBe(x === null);
              if (x) {
                ref.decrease(x, -Infinity);
                ref.extractMin();
              }
            }
            if (op === 'clear') {
              ref.roots = [];
              ref.min = null;
            }
            if (refused && (op === 'insert' || op === 'union')) {
              const adding = op === 'insert' ? 1 : String(a).split(' ').length;
              expect(ref.size() + adding).toBeGreaterThan(MAX_KEYS);
            }
            const end = entry.end;
            expect(modelShape(end), `shape after ${call.join(' ')}`).toBe(ref.shape());
            expect(end.min === null ? null : end.nodes[end.min]!.key).toBe(ref.min?.key ?? null);
            expect(end.other).toEqual([]);
            const after = keysOf(end);
            // Degrees stay within D(n), and a node of degree k has at least F(k + 2) nodes.
            for (const n of Object.values(end.nodes)) {
              expect(n.children.length).toBeLessThanOrEqual(maxDegree(after.length));
              expect(subtreeSize(end.nodes, n.uid)).toBeGreaterThanOrEqual(
                fib(n.children.length + 2),
              );
            }
            if (op === 'deletemin' && end.roots.length) {
              const ds = end.roots.map((r) => end.nodes[r]!.children.length);
              expect(new Set(ds).size, 'consolidate leaves one tree per degree').toBe(ds.length);
            }
            for (const step of entry.steps) {
              checkStep(step, op);
              const keys = keysOf(step.state).filter((k) => k !== -Infinity);
              const allowed = [
                before,
                after,
                before.filter((k, j) => j !== before.indexOf(Number(a))),
              ];
              if (op === 'decrease' || op === 'delete')
                expect(keys.length).toBeLessThanOrEqual(before.length);
              else expect(allowed).toContainEqual(keys);
            }
            before = after;
          });
        },
      ),
      { numRuns: 250 },
    );
  });

  it('is lazy: inserts and union link nothing; extractMin does the deferred work', () => {
    const keys = [27, 14, 9, 33, 21, 45, 6, 38, 17, 50, 12, 29, 41];
    const t = new Timeline(fibonacciHeap, fibonacciHeap.defaults, 1, [
      ...keys.map((k) => ['insert', k] as OpCall),
      ['union', '5 60'],
      ['deletemin'],
    ]);
    for (const e of t.entries.slice(0, -1)) expect(e.steps.at(-1)!.vars?.links).toBe(0);
    expect(t.entries[13]!.steps.at(-1)!.vars?.['t(H)']).toBe(15);
    const last = t.entries.at(-1)!.steps.at(-1)!.vars!;
    // 14 keys left: 1110 in binary, so three trees.
    expect(last['t(H)']).toBe(3);
    expect(last.links).toBe(11);
    expect(t.entries.at(-1)!.steps.some((s) => s.extra?.table)).toBe(true);
  });

  it('cuts in a cascade and names every step', () => {
    const ex = fibonacciHeap.examples.find((e) => e.id === 'cascading-cut')!;
    const t = new Timeline(fibonacciHeap, fibonacciHeap.defaults, 1, ex.ops);
    const steps = t.entries.at(-1)!.steps;
    const says = steps.map((s) => s.say).join(' ');
    expect(says).toContain('cascadingCut(19): 19 was marked');
    expect(says).toContain('cascadingCut(17): 17 was marked');
    expect(steps.at(-1)!.vars?.cuts).toBe(3);
    expect(steps.at(-1)!.vars?.['m(H)']).toBe(0);
    // Marked nodes wear a dashed ring.
    const marks = t.entries.at(-2)!.steps.at(-1)!;
    const rings = fibonacciHeap
      .view(marks, fibonacciHeap.defaults)
      .shapes.filter((s) => s.id.startsWith('ring-'));
    expect(rings).toHaveLength(2);
    expect(rings.every((r) => r.cls === 'ghost')).toBe(true);
  });

  it('deletes by decreasing to −∞ and extracting', () => {
    const t = new Timeline(fibonacciHeap, fibonacciHeap.defaults, 1, [
      ...[30, 10, 20, 40].map((k) => ['insert', k] as OpCall),
      ['delete', 30],
    ]);
    const says = t.entries
      .at(-1)!
      .steps.map((s) => s.say)
      .join(' ');
    expect(says).toContain('−∞');
    expect(says).not.toContain('Infinity');
    expect(keysOf(t.endState())).toEqual([10, 20, 40]);
  });
});

// ---------------------------------------------------------------------------------------------

describe('Fibonacci heap practice', () => {
  const kinds = fibonacciHeap.practice!;

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual([
      'trees-after-extract',
      'decrease-cuts',
      'potential-after',
      'marked-after',
    ]);
  });

  it('gets every answer right, checked against the reference heap', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const ref = new RefFib();
        for (const [op, a, b] of q.setup) {
          if (op === 'insert') ref.insert(Number(a));
          if (op === 'deletemin') ref.extractMin();
          if (op === 'decrease') ref.decrease(ref.find(Number(a))!, Number(b));
        }
        const [op, a, b] = q.watch![0]!;
        const ans = q.answer;
        if (k.id === 'trees-after-extract') {
          expect(op).toBe('deletemin');
          ref.extractMin();
          expect(ans).toEqual({ kind: 'number', value: ref.roots.length });
          const n = ref.size();
          expect(ref.roots.length).toBe(n.toString(2).replace(/0/g, '').length);
          continue;
        }
        expect(op).toBe('decrease');
        ref.cuts = 0;
        ref.decrease(ref.find(Number(a))!, Number(b));
        if (k.id === 'decrease-cuts') expect(ans).toEqual({ kind: 'number', value: ref.cuts });
        else if (k.id === 'potential-after')
          expect(ans).toEqual({ kind: 'number', value: ref.roots.length + 2 * ref.marked() });
        else {
          const keys: number[] = [];
          const walk = (xs: RN[]) =>
            xs.forEach((x) => {
              if (x.mark) keys.push(x.key);
              walk(x.children);
            });
          walk(ref.roots);
          expect(ans).toEqual({
            kind: 'sequence',
            value: keys.sort((p, q2) => p - q2).map(String),
          });
        }
      }
    }
  });
});
