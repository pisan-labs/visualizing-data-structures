import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { fenwickTree } from '.';
import { linearCost, START, updatesCost, type FenSettings, type FenState } from './model';

const LINEAR: FenSettings = { build: 'linear' };
const UPDATES: FenSettings = { build: 'updates' };
const SIXTEEN = '3 8 1 6 2 9 4 7 5 2 8 3 6 1 7 4';

// ---------------------------------------------------------------------------------------------
// Reference: a plain 1-based array, scanned directly, and the textbook bit walks written again.

const lowbit = (i: number) => i & -i;
/** A[lo] + ... + A[hi] of a 1-based array (a[0] unused). */
const scan = (a: number[], lo: number, hi: number) =>
  a.slice(lo, hi + 1).reduce((x, y) => x + y, 0);
/** The sum T[i] must hold: the lowbit(i) values that end at A[i]. */
const cover = (a: number[], i: number) => scan(a, i - lowbit(i) + 1, i);
function refUp(i: number, n: number): number[] {
  const out = [];
  for (; i <= n; i += lowbit(i)) out.push(i);
  return out;
}
function refDown(i: number): number[] {
  const out = [];
  for (; i > 0; i -= lowbit(i)) out.push(i);
  return out;
}

function checkComplete(s: FenState) {
  expect(s.t).toHaveLength(s.a.length);
  expect(s.a[0]).toBe(0);
  expect(s.t[0]).toBe(0);
  for (let i = 1; i < s.t.length; i++) expect(s.t[i], `T[${i}]`).toBe(cover(s.a, i));
}

const run = (settings: FenSettings, calls: OpCall[]) =>
  new Timeline(fenwickTree, settings, 1, calls);

/** The values of i at the steps that use this pseudocode line. */
const visits = (steps: { lines: string[]; vars?: Record<string, unknown> }[], line: string) =>
  steps.filter((st) => st.lines.includes(line)).map((st) => Number(st.vars?.i));

describe('fenwick tree', () => {
  it('starts built from the starting array', () => {
    const t = run(LINEAR, []);
    expect(t.initial.state.a.slice(1)).toEqual(START);
    checkComplete(t.initial.state);
    expect(t.initial.state.t).toEqual([0, 5, 8, 8, 17, 9, 11, 7, 39]);
    expect(t.initial.vars?.['build cost']).toBe(7);
    expect(run(UPDATES, []).initial.vars?.['build cost']).toBe(updatesCost(8));
  });

  it('reads one entry per 1 bit: prefix(13) is T[13] + T[12] + T[8]', () => {
    const t = run(LINEAR, [
      ['build', SIXTEEN],
      ['prefix', 13],
    ]);
    const steps = t.entries[1]!.steps;
    expect(visits(steps, 'pf.add')).toEqual([13, 12, 8]);
    expect(steps.at(-1)!.vars).toMatchObject({ sum: 64, 'query cost': 3 });
    expect(steps[0]!.say).toContain('13 = 1101₂, whose lowest set bit is 1');
    expect(steps[1]!.say).toContain('T[12] covers 4 values, A[9..12]');
    expect(steps.at(-1)!.extra?.caption).toBe('prefix(13) = 6 + 18 + 40 = 64');
  });

  it('climbs through every range that contains i on an add', () => {
    const t = run(LINEAR, [
      ['build', SIXTEEN],
      ['add', 5, 3],
    ]);
    const steps = t.entries[1]!.steps;
    expect(visits(steps, 'ad.add')).toEqual([5, 6, 8, 16]);
    expect(steps.at(-1)!.vars?.['update cost']).toBe(4);
    checkComplete(t.endState());
    expect(t.endState().a[5]).toBe(5);
  });

  it('answers a range sum as two prefix walks', () => {
    const t = run(LINEAR, [
      ['build', SIXTEEN],
      ['sum', 7, 7],
    ]);
    const last = t.entries[1]!.steps.at(-1)!;
    expect(last.vars).toMatchObject({ sum: 4, 'query cost': 5 });
    expect(last.say).toContain('prefix(7) − prefix(6) = 33 − 29 = 4');
  });

  it('builds the same tree both ways, with different costs', () => {
    const linear = run(LINEAR, [['build', SIXTEEN]]).endState();
    const byAdds = run(UPDATES, [['build', SIXTEEN]]).endState();
    expect(byAdds.t).toEqual(linear.t);
    checkComplete(linear);
    expect(linear.buildCost).toBe(15);
    expect(byAdds.buildCost).toBe(48);
    expect(linearCost(16)).toBe(15);
    expect(linearCost(12)).toBe(10);
  });

  it('refuses what it cannot do, and leaves the state alone', () => {
    const t = run(LINEAR, [
      ['prefix', 9],
      ['prefix', -1],
      ['sum', 5, 2],
      ['sum', 0, 3],
      ['add', 0, 1],
      ['add', 3, 99],
      ['add', 'x', 1],
      ['build', 'cat'],
    ]);
    for (const e of t.entries) {
      expect(
        e.steps.at(-1)!.marks.some((m) => m.role === 'error'),
        String(e.call),
      ).toBe(true);
      expect(e.end).toBe(t.initial.state);
    }
    expect(t.entries[0]!.steps[0]!.say).toContain('There is no A[9]');
    expect(t.entries[5]!.steps[0]!.say).toContain('would become 107');
  });

  it('treats prefix(0) as the empty sum', () => {
    const t = run(LINEAR, [['prefix', 0]]);
    expect(t.entries[0]!.steps.at(-1)!.vars?.sum).toBe(0);
  });
});

describe('fenwick tree against a plain array', () => {
  const value = fc.integer({ min: -30, max: 30 });
  const call = fc.oneof(
    fc.array(value, { minLength: 1, maxLength: 16 }).map((vs) => ['build', vs.join(' ')] as OpCall),
    fc.nat(17).map((i) => ['prefix', i] as OpCall),
    fc.tuple(fc.nat(17), fc.nat(17)).map(([l, r]) => ['sum', l, r] as OpCall),
    fc.tuple(fc.nat(17), value).map(([i, d]) => ['add', i, d] as OpCall),
  );

  it('answers like a scan, follows the bit walks, and keeps every T[i] right', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(LINEAR, UPDATES),
        fc.array(call, { maxLength: 20 }),
        (st, calls) => {
          const t = run(st, calls);
          let a = [0, ...START];
          calls.forEach((c, k) => {
            const e = t.entries[k]!;
            const last = e.steps.at(-1)!;
            const refused = last.marks.some((m) => m.role === 'error');
            const n = a.length - 1;
            const [op, x, y] = c;
            if (op === 'build') {
              a = [0, ...String(x).split(' ').map(Number)];
              expect(refused).toBe(false);
            } else if (op === 'prefix') {
              const i = Number(x);
              expect(refused).toBe(i > n);
              if (i <= n) {
                expect(last.vars?.sum).toBe(scan(a, 1, i));
                expect(visits(e.steps, 'pf.add')).toEqual(refDown(i));
              }
            } else if (op === 'sum') {
              const [l, r] = [Number(x), Number(y)];
              const ok = l >= 1 && l <= r && r <= n;
              expect(refused).toBe(!ok);
              if (ok) {
                expect(last.vars?.sum).toBe(scan(a, l, r));
                expect(visits(e.steps, 'sm.add')).toEqual([...refDown(r), ...refDown(l - 1)]);
              }
            } else {
              const [i, d] = [Number(x), Number(y)];
              const ok = i >= 1 && i <= n && Math.abs(a[i]! + d) <= 99;
              expect(refused).toBe(!ok);
              if (ok) {
                a[i]! += d;
                expect(visits(e.steps, 'ad.add')).toEqual(refUp(i, n));
              }
            }
            expect(e.end.a).toEqual(a);
            checkComplete(e.end);
          });
          // Invariants on every step.
          for (let g = 0; g < t.length; g++) {
            const { step, op: o, index } = t.at(g);
            const s = step.state;
            const n = s.a.length - 1;
            const call = o >= 0 ? t.entries[o]!.call : null;
            const final = o < 0 || index === t.entries[o]!.steps.length - 1;
            if (final) {
              checkComplete(s);
            } else if (call?.[0] === 'add') {
              // T[j] on the path but not reached yet is short by delta; everything else is right.
              const [i0, d] = [Number(call[1]), Number(call[2])];
              const at = step.vars?.i === undefined ? 0 : Number(step.vars.i);
              const behind = refUp(i0, n).filter((j) => j > at);
              for (let j = 1; j <= n; j++)
                expect(s.t[j], `T[${j}] during add`).toBe(
                  cover(s.a, j) - (behind.includes(j) ? d : 0),
                );
            } else if (step.lines.includes('bl.loop')) {
              // Linear build: T[1..i] are complete once the loop reaches i.
              const i = Number(step.vars?.i);
              for (let j = 1; j <= i; j++)
                expect(s.t[j], `T[${j}] during build`).toBe(cover(s.a, j));
            } else if (step.lines.includes('bu.loop')) {
              // Build by adds: after add(k, A[k]), T is the tree of A[1..k].
              const k = Number(step.vars?.k);
              for (let j = 1; j <= n; j++) {
                const [lo, hi] = [j - lowbit(j) + 1, j];
                expect(s.t[j]).toBe(scan(s.a, lo, Math.min(hi, k)));
              }
            } else if (!step.lines.some((l) => l.startsWith('bl.') || l.startsWith('bu.'))) {
              checkComplete(s);
            }
          }
        },
      ),
      { numRuns: 250 },
    );
  });
});

describe('fenwick tree practice', () => {
  const kinds = fenwickTree.practice!;

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual(['low-bit', 'update-path', 'query-path', 'range-sum']);
  });

  it('gets every answer right, checked against a plain array', () => {
    for (let seed = 1; seed <= 150; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const a = [0, ...String(q.setup[0]![1]).split(' ').map(Number)];
        const n = a.length - 1;
        const [op, x, y] = q.watch![0]!;
        const [i, j] = [Number(x), Number(y)];
        if (k.id === 'low-bit') {
          expect(op).toBe('prefix');
          expect(q.answer).toEqual({ kind: 'number', value: lowbit(i) });
        } else if (k.id === 'update-path') {
          expect(op).toBe('add');
          expect(q.answer).toEqual({ kind: 'sequence', value: refUp(i, n).map(String) });
        } else if (k.id === 'query-path') {
          expect(op).toBe('prefix');
          expect(q.answer).toEqual({ kind: 'sequence', value: refDown(i).map(String) });
          expect(refDown(i).length, 'a path worth asking about').toBeGreaterThan(1);
        } else {
          expect(op).toBe('sum');
          expect(q.answer).toEqual({ kind: 'number', value: scan(a, i, j) });
        }
      }
    }
  });
});

describe('drawn text size', () => {
  // The T[i] labels were 17 units (8.2 px on a phone): now 20.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(fenwickTree, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(fenwickTree, PHONE_STAGE).px).toBeGreaterThanOrEqual(9.5);
  });
});
