import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Step } from '../../engine/types';
import { skewHeap } from '.';
import { heightOf, MAX_KEYS, rightPath, type MeldExtra, type MeldState } from '../_meld/meld';

// ---------------------------------------------------------------------------------------------
// Reference: the plain recursive skew heap, written independently.

interface RNode {
  key: number;
  left: RNode | null;
  right: RNode | null;
}

function merge(a: RNode | null, b: RNode | null): RNode | null {
  if (!a) return b;
  if (!b) return a;
  if (b.key < a.key) [a, b] = [b, a];
  a.right = merge(a.right, b);
  [a.left, a.right] = [a.right, a.left];
  return a;
}

class RefSkew {
  root: RNode | null = null;
  insert(k: number) {
    this.root = merge(this.root, { key: k, left: null, right: null });
  }
  deleteMin(): number | undefined {
    if (!this.root) return undefined;
    const k = this.root.key;
    this.root = merge(this.root.left, this.root.right);
    return k;
  }
  mergeList(keys: number[]) {
    const other = new RefSkew();
    for (const k of keys) other.insert(k);
    this.root = merge(this.root, other.root);
  }
  size(x: RNode | null = this.root): number {
    return x ? 1 + this.size(x.left) + this.size(x.right) : 0;
  }
  shape(x: RNode | null = this.root): string {
    return x ? `(${x.key} ${this.shape(x.left)} ${this.shape(x.right)})` : '.';
  }
}

function modelShape(s: MeldState, u: number | null = s.root): string {
  if (u === null) return '.';
  const n = s.nodes[u]!;
  return `(${n.key} ${modelShape(s, n.left)} ${modelShape(s, n.right)})`;
}

const keysOf = (s: MeldState) =>
  Object.values(s.nodes)
    .map((n) => n.key)
    .sort((a, b) => a - b);

function checkStep(step: Step<MeldState, MeldExtra>) {
  const s = step.state;
  const reached = new Set<number>();
  const walk = (u: number | null, above: number) => {
    if (u === null) return;
    expect(reached.has(u), `node ${u} reached once`).toBe(false);
    reached.add(u);
    const n = s.nodes[u]!;
    expect(n.key, `heap order under ${above}: ${step.say}`).toBeGreaterThanOrEqual(above);
    walk(n.left, n.key);
    walk(n.right, n.key);
  };
  walk(s.root, -Infinity);
  walk(s.other, -Infinity);
  expect(Object.keys(s.nodes).length, 'no node is lost').toBe(reached.size);
  expect(step.vars?.N).toBe(reached.size);
  expect(step.vars?.height).toBe(heightOf(s, s.root));
  expect(step.vars?.['npl(root)'], 'a skew heap shows no npl').toBeUndefined();
}

const keyArb = fc.integer({ min: 1, max: 40 });
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 6, arbitrary: keyArb.map((k) => ['insert', k] as OpCall) },
  { weight: 3, arbitrary: fc.constant(['deletemin'] as OpCall) },
  {
    weight: 2,
    arbitrary: fc
      .array(keyArb, { minLength: 1, maxLength: 6 })
      .map((ks) => ['merge', ks.join(' ')] as OpCall),
  },
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

describe('skew heap', () => {
  it('matches a reference skew heap, shape included, and keeps every invariant', () => {
    fc.assert(
      fc.property(fc.array(callArb, { maxLength: 40 }), (calls) => {
        const t = new Timeline(skewHeap, {}, 1, calls);
        const ref = new RefSkew();
        let before = keysOf(t.initial.state);
        calls.forEach((call, i) => {
          const [op, arg] = call;
          const entry = t.entries[i]!;
          const last = entry.steps.at(-1)!;
          if (!last.marks.some((m) => m.id === 'arg-box')) {
            if (op === 'insert') ref.insert(Number(arg));
            if (op === 'deletemin') expect(last.vars?.returned).toBe(ref.deleteMin());
            if (op === 'merge') ref.mergeList(String(arg).split(' ').map(Number));
            if (op === 'clear') ref.root = null;
          } else {
            const adding = op === 'insert' ? 1 : String(arg).split(' ').length;
            expect(ref.size() + adding).toBeGreaterThan(MAX_KEYS);
          }
          expect(modelShape(entry.end), `shape after ${call.join(' ')}`).toBe(ref.shape());
          expect(entry.end.other).toBeNull();
          const after = keysOf(entry.end);
          for (const step of entry.steps) {
            checkStep(step);
            expect([before, after]).toContainEqual(keysOf(step.state));
          }
          before = after;
        });
      }),
      { numRuns: 300 },
    );
  });

  it('swaps the children of every node on the merge path', () => {
    const t = new Timeline(skewHeap, {}, 1, [
      ['insert', 10],
      ['insert', 20],
      ['insert', 15],
      ['insert', 30],
      ['insert', 25],
    ]);
    const steps = t.entries[4]!.steps;
    const swaps = steps.filter((s) => s.lines.includes('mg.kids'));
    expect(swaps.map((s) => s.say.match(/swap the children of (\d+)/)?.[1])).toEqual(['15', '10']);
    expect(steps.at(-1)!.vars?.swaps).toBe(2);
  });

  it('pays for a long right path once, then is cheap again', () => {
    const keys = [50, 40, 90, 30, 91, 20, 92, 10, 93];
    const t = new Timeline(skewHeap, {}, 1, [
      ...keys.map((k) => ['insert', k] as OpCall),
      ['insert', 60],
      ['insert', 70],
    ]);
    const s = t.entries[8]!.end;
    expect(rightPath(s, s.root)).toEqual([10, 20, 30, 40, 50]);
    expect(t.entries[9]!.steps.at(-1)!.vars?.swaps).toBe(5);
    expect(t.entries[10]!.steps.at(-1)!.vars?.swaps).toBe(2);
  });
});

describe('skew heap practice', () => {
  const kinds = skewHeap.practice!;

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual([
      'merge-path',
      'right-child-after-insert',
      'right-path-after-delete',
      'left-child-after-delete',
    ]);
  });

  it('gets every answer right, checked against the reference heap', () => {
    for (let seed = 1; seed <= 80; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const ref = new RefSkew();
        for (const [, key] of q.setup) ref.insert(Number(key));
        const [, arg] = q.watch![0]!;
        const a = q.answer;
        if (k.id === 'merge-path') {
          // The winners are the keys on the right path that are smaller than the new key,
          // then the new key itself if it beats the rest.
          const path: string[] = [];
          let x = ref.root;
          const key = Number(arg);
          let other: RNode | null = { key, left: null, right: null };
          while (x && other) {
            if (other.key < x.key) [x, other] = [other, x];
            path.push(String(x.key));
            x = x.right;
          }
          expect(a).toEqual({ kind: 'sequence', value: path });
        } else if (k.id === 'right-child-after-insert') {
          ref.insert(Number(arg));
          if (a.kind !== 'choice') throw new Error('a choice');
          const right = ref.root!.right;
          expect(a.options[a.correct]).toBe(right ? String(right.key) : 'It has no right child');
        } else if (k.id === 'right-path-after-delete') {
          ref.deleteMin();
          const path: string[] = [];
          for (let x = ref.root; x; x = x.right) path.push(String(x.key));
          expect(a).toEqual({ kind: 'sequence', value: path });
        } else {
          ref.deleteMin();
          if (a.kind !== 'choice') throw new Error('a choice');
          expect(a.options[a.correct]).toBe(String(ref.root!.left!.key));
        }
      }
    }
  });
});
