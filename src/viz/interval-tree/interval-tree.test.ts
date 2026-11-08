import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { shapeText, treeSize } from '../_bst/tree-kit';
import { intervalTree } from '.';
import { parseInterval, parseIntervalInput, type IntervalState } from './model';

// Reference: a plain list of intervals, and a plain recursive BST for the shape.
interface RN {
  lo: number;
  hi: number;
  left: RN | null;
  right: RN | null;
}
const lt = (a: [number, number], n: RN) => a[0] < n.lo || (a[0] === n.lo && a[1] < n.hi);

class Ref {
  root: RN | null = null;
  list: [number, number][] = [];
  insert(a: [number, number]) {
    if (this.list.some(([x, y]) => x === a[0] && y === a[1])) return;
    this.list.push(a);
    const ins = (t: RN | null): RN => {
      if (!t) return { lo: a[0], hi: a[1], left: null, right: null };
      if (lt(a, t)) t.left = ins(t.left);
      else t.right = ins(t.right);
      return t;
    };
    this.root = ins(this.root);
  }
  delete(a: [number, number]) {
    const i = this.list.findIndex(([x, y]) => x === a[0] && y === a[1]);
    if (i < 0) return;
    this.list.splice(i, 1);
    const del = (t: RN | null): RN | null => {
      if (!t) return null;
      if (t.lo === a[0] && t.hi === a[1]) {
        if (!t.left) return t.right;
        if (!t.right) return t.left;
        let parent = t;
        let y = t.right;
        while (y.left) {
          parent = y;
          y = y.left;
        }
        if (parent !== t) {
          parent.left = y.right;
          y.right = t.right;
        }
        y.left = t.left;
        return y;
      }
      if (lt(a, t)) t.left = del(t.left);
      else t.right = del(t.right);
      return t;
    };
    this.root = del(this.root);
  }
  shape(): string {
    const s = (t: RN | null): string =>
      !t
        ? '.'
        : !t.left && !t.right
          ? `${t.lo}-${t.hi}`
          : `(${t.lo}-${t.hi} ${s(t.left)} ${s(t.right)})`;
    return s(this.root);
  }
}

function checkMax(s: IntervalState) {
  const walk = (u: number | null): number => {
    if (u === null) return -1;
    const n = s.nodes[u]!;
    const m = Math.max(n.hi, walk(n.left), walk(n.right));
    expect(n.max, `max of [${n.lo}, ${n.hi}]`).toBe(m);
    return m;
  };
  walk(s.root);
}

const ivArb = fc
  .tuple(fc.integer({ min: 0, max: 30 }), fc.integer({ min: 0, max: 8 }))
  .map(([a, w]) => `${a}-${a + w}`);
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 6, arbitrary: ivArb.map((v) => ['insert', v] as OpCall) },
  { weight: 3, arbitrary: ivArb.map((v) => ['delete', v] as OpCall) },
  { weight: 2, arbitrary: ivArb.map((v) => ['overlap', v] as OpCall) },
  { weight: 2, arbitrary: ivArb.map((v) => ['all', v] as OpCall) },
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

const run = (calls: OpCall[]) => new Timeline(intervalTree, intervalTree.defaults, 1, calls);

describe('interval tree', () => {
  it('matches a plain BST and a list scan, and keeps every max right', () => {
    fc.assert(
      fc.property(fc.array(callArb, { maxLength: 60 }), (calls) => {
        const t = run(calls);
        let ref = new Ref();
        calls.forEach((call, i) => {
          const [op, raw] = call;
          const e = t.entries[i]!;
          const a = raw === undefined ? null : (parseInterval(raw) as [number, number]);
          if (op === 'insert') ref.insert(a!);
          if (op === 'delete') ref.delete(a!);
          if (op === 'clear') ref = new Ref();
          const s = e.end;
          expect(shapeText(s, (u) => `${s.nodes[u]!.lo}-${s.nodes[u]!.hi}`)).toBe(ref.shape());
          checkMax(s);
          expect(treeSize(s)).toBe(ref.list.length);
          const hits = ref.list.filter(([x, y]) => x <= a![1] && a![0] <= y);
          const ex = e.steps.at(-1)!.extra ?? {};
          if (op === 'overlap') {
            const f = ex.found?.[0];
            if (hits.length === 0) expect(f).toBeUndefined();
            else {
              const n = s.nodes[f!]!;
              expect(n.lo <= a![1] && a![0] <= n.hi).toBe(true);
            }
          }
          if (op === 'all') {
            const got = (ex.found ?? []).map((u) => `${s.nodes[u]!.lo},${s.nodes[u]!.hi}`).sort();
            expect(got).toEqual(hits.map(([x, y]) => `${x},${y}`).sort());
          }
          for (const step of e.steps) expect(step.vars!.N).toBe(treeSize(step.state));
        });
      }),
      { numRuns: 300 },
    );
  });

  it('says a max rises when the successor takes over bigger subtrees', () => {
    const calls: OpCall[] = [
      ['insert', '50-60'],
      ['insert', '30-90'],
      ['insert', '70-75'],
      ['delete', '50-60'],
    ];
    const t = new Timeline(intervalTree, intervalTree.defaults, 1, calls);
    const says = t.entries.at(-1)!.steps.map((st) => st.say);
    const fix = says.find((x) => x.startsWith('[70, 75]: '))!;
    expect(fix).toContain('max rises');
    expect(fix).toContain('= 90 (was 75)');
    expect(fix).not.toContain('lost');
  });

  it('reads intervals in several forms', () => {
    expect(parseIntervalInput('15,23')).toBe('15-23');
    expect(parseIntervalInput('[15, 23]')).toBe('15-23');
    expect(parseIntervalInput('15-23')).toBe('15-23');
    expect(parseIntervalInput('7')).toBe('7-7');
    expect(parseIntervalInput('23-15')).toBeInstanceOf(Error);
    expect(parseIntervalInput('5,100')).toBeInstanceOf(Error);
    expect(parseIntervalInput('cat')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(intervalTree, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(intervalTree, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
