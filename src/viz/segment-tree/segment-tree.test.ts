import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { segmentTree } from '.';
import { midOf, nodesOf, START, type SegSettings, type SegState } from './model';

const SUM: SegSettings = { combine: 'sum' };
const MIN: SegSettings = { combine: 'min' };
const SIXTEEN = '5 3 8 1 9 2 7 4 6 2 8 3 1 7 5 2';

// ---------------------------------------------------------------------------------------------
// Reference: the plain array, scanned directly, and the textbook decomposition of a range.

const scan = (a: number[], l: number, r: number, min: boolean) => {
  const xs = a.slice(l, r + 1);
  return min ? Math.min(...xs) : xs.reduce((x, y) => x + y, 0);
};

/** Ranges of the nodes a query takes whole, left to right. */
function decompose(n: number, l: number, r: number): string[] {
  const out: string[] = [];
  const go = (lo: number, hi: number) => {
    if (r < lo || hi < l) return;
    if (l <= lo && hi <= r) {
      out.push(`[${lo}, ${hi}]`);
      return;
    }
    const m = midOf(lo, hi);
    go(lo, m);
    go(m + 1, hi);
  };
  go(0, n - 1);
  return out;
}

/**
 * Every built node's stored value, plus what the tags above it still owe it, matches its range
 * of A. Leaves never hold a tag.
 */
function checkTree(s: SegState, min: boolean) {
  const n = s.a.length;
  const owed = new Map<number, number>();
  for (const nd of nodesOf(n)) {
    const p = Math.floor(nd.v / 2);
    const o = nd.v === 1 ? 0 : owed.get(p)! + s.lazy[p]!;
    owed.set(nd.v, o);
    if (nd.lo === nd.hi) expect(s.lazy[nd.v], `leaf ${nd.lo} has no tag`).toBe(0);
    const stored = s.val[nd.v];
    if (stored === null || stored === undefined) continue;
    const len = nd.hi - nd.lo + 1;
    expect(stored + (min ? o : o * len), `node [${nd.lo}, ${nd.hi}]`).toBe(
      scan(s.a, nd.lo, nd.hi, min),
    );
  }
}

const run = (settings: SegSettings, calls: OpCall[]) =>
  new Timeline(segmentTree, settings, 1, calls);

describe('segment tree', () => {
  it('starts built from the starting array', () => {
    const t = run(SUM, []);
    expect(t.initial.state.a).toEqual(START);
    expect(t.initial.state.val[1]).toBe(39);
    checkTree(t.initial.state, false);
    expect(nodesOf(8)).toHaveLength(15);
    expect(nodesOf(10)).toHaveLength(19);
  });

  it('names the three cases and takes the right nodes whole', () => {
    const t = run(SUM, [
      ['build', SIXTEEN],
      ['query', 2, 9],
    ]);
    const steps = t.entries[1]!.steps;
    const says = steps.map((s) => s.say).join(' ');
    expect(says).toContain('no overlap');
    expect(says).toContain('full overlap');
    expect(says).toContain('partial overlap');
    const last = steps.at(-1)!;
    expect(last.vars).toMatchObject({ sum: 39, 'query cost': 11 });
    expect(last.say).toContain('[2, 3], [4, 7], [8, 9]');
  });

  it('visits at most four nodes per level', () => {
    const t = run(SUM, [
      ['build', SIXTEEN],
      ['query', 1, 14],
    ]);
    expect(t.entries[1]!.steps.at(-1)!.vars?.['query cost']).toBe(15);
  });

  it('tags whole nodes on a range add and pushes the tags down later', () => {
    const t = run(SUM, [
      ['build', '5 3 8 1 9 2 7 4'],
      ['add', 2, 7, 3],
      ['query', 5, 5],
    ]);
    const added = t.entries[1]!.end;
    expect(added.a).toEqual([5, 3, 11, 4, 12, 5, 10, 7]);
    // [2, 3] is node 5 and [4, 7] is node 3.
    expect(added.lazy[5]).toBe(3);
    expect(added.lazy[3]).toBe(3);
    expect(added.val[3]).toBe(34);
    expect(added.val[6]).toBe(11); // [4, 5] is out of date
    checkTree(added, false);
    const queried = t.entries[2]!;
    expect(queried.steps.at(-1)!.vars?.sum).toBe(5);
    expect(queried.end.lazy[3]).toBe(0);
    expect(queried.end.val[6]).toBe(17);
    expect(queried.steps.some((s) => s.say.startsWith('Push the tag +3 down first'))).toBe(true);
  });

  it('keeps minimums, where an add moves a node by x and not by x times its length', () => {
    const t = run(MIN, [
      ['build', '5 3 8 1 9 2 7 4'],
      ['add', 0, 3, 4],
      ['query', 1, 6],
    ]);
    expect(t.entries[1]!.end.val[2]).toBe(5); // [0, 3]: min(9, 7, 12, 5)
    expect(t.entries[2]!.steps.at(-1)!.vars?.min).toBe(2);
  });

  it('refuses what it cannot do, and leaves the state alone', () => {
    const t = run(SUM, [
      ['query', 3, 1],
      ['query', 0, 8],
      ['update', -1, 4],
      ['add', 0, 7, 99],
      ['add', 'x', 2, 1],
      ['build', '1 2 x'],
    ]);
    for (const e of t.entries) {
      expect(
        e.steps.at(-1)!.marks.some((m) => m.role === 'error'),
        String(e.call),
      ).toBe(true);
      expect(e.end).toBe(t.initial.state);
    }
    expect(t.entries[3]!.steps[0]!.say).toContain('A[0] would become 104');
  });
});

describe('segment tree against a plain array', () => {
  const value = fc.integer({ min: -20, max: 20 });
  const index = fc.integer({ min: -1, max: 16 });
  const call = fc.oneof(
    fc.array(value, { minLength: 1, maxLength: 16 }).map((vs) => ['build', vs.join(' ')] as OpCall),
    fc.tuple(index, index).map(([l, r]) => ['query', l, r] as OpCall),
    fc.tuple(index, value).map(([i, x]) => ['update', i, x] as OpCall),
    fc.tuple(index, index, value).map(([l, r, x]) => ['add', l, r, x] as OpCall),
  );

  it('answers like a scan and keeps every node right once tags are counted', () => {
    fc.assert(
      fc.property(fc.constantFrom(SUM, MIN), fc.array(call, { maxLength: 18 }), (st, calls) => {
        const min = st.combine === 'min';
        const t = run(st, calls);
        let a = [...START];
        calls.forEach((c, k) => {
          const e = t.entries[k]!;
          const last = e.steps.at(-1)!;
          const refused = last.marks.some((m) => m.role === 'error');
          const n = a.length;
          const [op, x, y, z] = c;
          const inRange = (i: number) => i >= 0 && i < n;
          if (op === 'build') {
            a = String(x).split(' ').map(Number);
            expect(refused).toBe(false);
          } else if (op === 'query') {
            const [l, r] = [Number(x), Number(y)];
            const ok = inRange(l) && inRange(r) && l <= r;
            expect(refused).toBe(!ok);
            if (ok) {
              expect(last.vars?.[min ? 'min' : 'sum']).toBe(scan(a, l, r, min));
              const depth = Math.max(...nodesOf(n).map((nd) => nd.depth));
              expect(Number(last.vars?.['query cost'])).toBeLessThanOrEqual(4 * (depth + 1));
              const whole = e.steps
                .filter((s) => s.lines.includes('q.full'))
                .map((s) => String(s.vars?.node));
              expect(whole).toEqual(decompose(n, l, r));
            }
          } else if (op === 'update') {
            const i = Number(x);
            expect(refused).toBe(!inRange(i));
            if (inRange(i)) a[i] = Number(y);
          } else {
            const [l, r, d] = [Number(x), Number(y), Number(z)];
            const ok =
              inRange(l) &&
              inRange(r) &&
              l <= r &&
              a.slice(l, r + 1).every((v) => Math.abs(v + d) <= 99);
            expect(refused).toBe(!ok);
            if (ok) for (let i = l; i <= r; i++) a[i]! += d;
          }
          expect(e.end.a).toEqual(a);
          expect(e.end.val.slice(1, 2 * n).filter((v) => v === null).length).toBeLessThan(2 * n);
          checkTree(e.end, min);
        });
        // Invariants on every step where the tree is meant to be whole: queries (pushes keep it),
        // builds (every node built so far), refusals and the end of every operation.
        for (let g = 0; g < t.length; g++) {
          const { step, op: o, index } = t.at(g);
          const call = o >= 0 ? t.entries[o]!.call[0] : 'start';
          const final = o < 0 || index === t.entries[o]!.steps.length - 1;
          if (final || call === 'query' || call === 'build') checkTree(step.state, min);
        }
      }),
      { numRuns: 250 },
    );
  });
});

describe('segment tree practice', () => {
  const kinds = segmentTree.practice!;

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual([
      'query-answer',
      'full-nodes',
      'which-case',
      'lazy-push',
    ]);
  });

  it('gets every answer right, checked against a plain array', () => {
    for (let seed = 1; seed <= 150; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const a = String(q.setup[0]![1]).split(' ').map(Number);
        const n = a.length;
        const [op, x, y] = q.watch![0]!;
        const [l, r] = [Number(x), Number(y)];
        expect(op).toBe('query');
        if (k.id === 'query-answer') {
          const min = q.settings?.combine === 'min';
          expect(q.answer).toEqual({ kind: 'number', value: scan(a, l, r, min) });
        } else if (k.id === 'full-nodes') {
          expect(q.answer).toEqual({ kind: 'number', value: decompose(n, l, r).length });
        } else if (k.id === 'which-case') {
          const [, lo, hi] = /reaches node \[(\d+), (\d+)\]/.exec(q.prompt)!.map(Number);
          const want =
            r < lo! || hi! < l
              ? 'No overlap'
              : l <= lo! && hi! <= r
                ? 'Full overlap'
                : 'Partial overlap';
          if (q.answer.kind !== 'choice') throw new Error('choice expected');
          expect(q.answer.options[q.answer.correct]).toBe(want);
        } else {
          const [, lo, hi] = /node \[(\d+), (\d+)\] holds/.exec(q.prompt)!.map(Number);
          const [, al, ar, ax] = q.setup[1]!.map(Number);
          expect(lo! >= al! && hi! <= ar!, 'the tagged node lies inside the add').toBe(true);
          expect(hi! > lo!, 'a tag is on an inner node').toBe(true);
          const m = midOf(lo!, hi!);
          expect(q.answer).toEqual({
            kind: 'number',
            value: scan(a, lo!, m, false) + ax! * (m - lo! + 1),
          });
        }
      }
    }
  });
});

describe('drawn text size', () => {
  // Range labels were 17 units (8.2 px on a phone): now 20.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(segmentTree, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(segmentTree, PHONE_STAGE).px).toBeGreaterThanOrEqual(9.5);
  });
});
