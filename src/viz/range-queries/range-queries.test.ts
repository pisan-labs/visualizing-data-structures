import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { parseInput } from '../_range/kit';
import { rangeQueries } from '.';
import { levels, sparseCost, START, type RQSettings, type RQState } from './model';

const PREFIX: RQSettings = { structure: 'prefix' };
const SPARSE: RQSettings = { structure: 'sparse' };

// ---------------------------------------------------------------------------------------------
// Reference: the plain array, scanned directly.

const scanSum = (a: number[], i: number, j: number) => a.slice(i, j + 1).reduce((x, y) => x + y, 0);
const scanMin = (a: number[], i: number, j: number) => Math.min(...a.slice(i, j + 1));

/** Every computed entry of the state agrees with a direct scan of its A. */
function checkComputed(s: RQState) {
  s.p.forEach((v, k) => {
    if (v !== null) expect(v, `P[${k}]`).toBe(scanSum(s.a, 0, k - 1));
  });
  s.m.forEach((row, k) =>
    row.forEach((v, i) => {
      if (v !== null) expect(v, `M[${k}][${i}]`).toBe(scanMin(s.a, i, i + 2 ** k - 1));
    }),
  );
}

/** A finished state: every entry is there and right. */
function checkComplete(s: RQState, settings: RQSettings) {
  const n = s.a.length;
  if (settings.structure === 'prefix') {
    expect(s.p).toHaveLength(n + 1);
    expect(s.m).toEqual([]);
  } else {
    expect(s.p).toEqual([]);
    expect(s.m).toHaveLength(levels(n) + 1);
    s.m.forEach((row, k) => expect(row).toHaveLength(n - 2 ** k + 1));
    expect(s.m[0]).toEqual(s.a);
  }
  expect(s.p.every((v) => v !== null)).toBe(true);
  expect(s.m.every((r) => r.every((v) => v !== null))).toBe(true);
  checkComputed(s);
}

const run = (settings: RQSettings, calls: OpCall[]) =>
  new Timeline(rangeQueries, settings, 1, calls);

describe('prefix sums', () => {
  it('starts built, from the starting array', () => {
    const t = run(PREFIX, []);
    expect(t.initial.state.a).toEqual(START);
    checkComplete(t.initial.state, PREFIX);
    expect(t.initial.vars).toMatchObject({ n: 8, 'build cost': 8, 'query cost': 0 });
  });

  it('answers sum(i, j) as P[j + 1] − P[i] and says so', () => {
    const t = run(PREFIX, [
      ['build', '5 3 8 1 9 2 7 4'],
      ['query', 2, 5],
    ]);
    const last = t.entries[1]!.steps.at(-1)!;
    expect(last.vars).toMatchObject({ i: 2, j: 5, sum: 20, 'query cost': 1 });
    expect(last.say).toContain('P[6] − P[2] = 28 − 8 = 20');
    expect(last.extra?.spans?.map((s) => s.to)).toEqual([6, 2]);
  });

  it('builds P one addition per value and narrates the half-open convention', () => {
    const t = run(PREFIX, [['build', '4 -2 7']]);
    const steps = t.entries[0]!.steps;
    expect(steps[0]!.say).toContain('half-open');
    expect(steps[0]!.state.p).toEqual([0, null, null, null]);
    expect(steps.at(-1)!.state.p).toEqual([0, 4, 2, 9]);
    expect(steps.at(-1)!.vars?.['build cost']).toBe(3);
    expect(steps[2]!.say).toContain('P[2] = P[1] + A[1] = 4 − 2 = 2');
  });

  it('fixes every P[k] with k > i on an update', () => {
    const t = run(PREFIX, [
      ['build', '5 3 8 1'],
      ['update', 1, 10],
    ]);
    const last = t.entries[1]!.steps.at(-1)!;
    expect(last.state.p).toEqual([0, 5, 15, 23, 24]);
    expect(last.vars?.['update cost']).toBe(3);
  });

  it('refuses ranges it cannot answer, and leaves the state alone', () => {
    const t = run(PREFIX, [
      ['query', 5, 2],
      ['query', 0, 8],
      ['query', 'x', 1],
      ['update', 9, 1],
      ['build', 'cat'],
      ['build', '1 2 300'],
    ]);
    for (const e of t.entries) {
      const last = e.steps.at(-1)!;
      expect(
        last.marks.some((m) => m.role === 'error'),
        String(e.call),
      ).toBe(true);
      expect(e.end).toBe(t.initial.state);
    }
    expect(t.entries[0]!.steps[0]!.say).toContain('swap them');
    expect(t.entries[1]!.steps[0]!.say).toContain('There is no A[8]');
  });
});

describe('sparse table', () => {
  it('builds rows of windows of 2^k and counts the min() calls', () => {
    const t = run(SPARSE, [['build', '12 7 19 3 25 14 8 21 5 30 17 9 26 2 11 16']]);
    const end = t.endState();
    checkComplete(end, SPARSE);
    expect(end.buildCost).toBe(38);
    expect(sparseCost(16)).toBe(38);
  });

  it('answers min(i, j) with two overlapping windows of the same length', () => {
    const t = run(SPARSE, [
      ['build', '12 7 19 3 25 14 8 21 5 30 17 9 26 2 11 16'],
      ['query', 2, 11],
    ]);
    const steps = t.entries[1]!.steps;
    const windows = steps[1]!.extra?.windows ?? [];
    expect(windows.map((w) => [w.lo, w.hi])).toEqual([
      [2, 9],
      [4, 11],
    ]);
    expect(steps.at(-1)!.vars).toMatchObject({ len: 10, k: 3, min: 3 });
    expect(steps[1]!.say).toContain('overlap on A[4..9]');
  });

  it('recomputes exactly the windows that contain the changed position', () => {
    const t = run(SPARSE, [
      ['build', '12 7 19 3 25 14 8 21 5 30 17 9 26 2 11 16'],
      ['update', 7, 1],
    ]);
    const steps = t.entries[1]!.steps;
    expect(steps.at(-1)!.vars?.['update cost']).toBe(15);
    checkComplete(steps.at(-1)!.state, SPARSE);
  });

  it('handles one value: no rows above A', () => {
    const t = run(SPARSE, [
      ['build', '7'],
      ['query', 0, 0],
      ['update', 0, 3],
    ]);
    expect(t.endState().m).toEqual([[3]]);
    expect(t.entries[1]!.steps.at(-1)!.vars?.min).toBe(7);
  });
});

describe('both structures against a plain array', () => {
  const value = fc.integer({ min: -99, max: 99 });
  const list = fc.array(value, { minLength: 1, maxLength: 16 });
  const call = fc.oneof(
    list.map((vs) => ['build', vs.join(' ')] as OpCall),
    fc.tuple(fc.nat(17), fc.nat(17)).map(([i, j]) => ['query', i, j] as OpCall),
    fc.tuple(fc.nat(17), value).map(([i, x]) => ['update', i, x] as OpCall),
  );

  it('answers every query like a direct scan, and keeps every entry right', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(PREFIX, SPARSE),
        fc.array(call, { maxLength: 20 }),
        (settings, calls) => {
          const t = run(settings, calls);
          let ref = [...START];
          calls.forEach((c, k) => {
            const e = t.entries[k]!;
            const last = e.steps.at(-1)!;
            const refused = last.marks.some((m) => m.role === 'error');
            const [op, x, y] = c;
            const n = ref.length;
            if (op === 'build') {
              ref = String(x).split(' ').map(Number);
              expect(refused).toBe(false);
            } else if (op === 'query') {
              const [i, j] = [Number(x), Number(y)];
              const ok = i <= j && j < n;
              expect(refused).toBe(!ok);
              if (ok) {
                if (settings.structure === 'prefix')
                  expect(last.vars?.sum).toBe(scanSum(ref, i, j));
                else expect(last.vars?.min).toBe(scanMin(ref, i, j));
                expect(last.vars?.['query cost']).toBe(1);
              }
            } else {
              const i = Number(x);
              expect(refused).toBe(i >= n);
              if (i < n) ref[i] = Number(y);
            }
            expect(e.end.a).toEqual(ref);
            checkComplete(e.end, settings);
            if (op === 'build')
              expect(e.end.buildCost).toBe(
                settings.structure === 'prefix' ? ref.length : sparseCost(ref.length),
              );
          });
          // Invariants on every step: what has been computed is right, and during an update
          // the entries not yet fixed are off by exactly d.
          for (let g = 0; g < t.length; g++) {
            const { step } = t.at(g);
            const s = step.state;
            if (s.m.length) expect(s.m[0]).toEqual(s.a);
            if (step.lines.includes('pu.add') || step.lines.includes('pu.d')) {
              const k = Number(step.vars?.k ?? step.vars?.i);
              const d = Number(step.vars?.d);
              s.p.forEach((v, q) => {
                const want = scanSum(s.a, 0, q - 1) - (q > k ? d : 0);
                expect(v, `P[${q}] during an update`).toBe(want);
              });
            } else if (!step.lines.some((l) => l.startsWith('su.'))) {
              checkComputed(s);
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('input', () => {
  it('reads one number or a list', () => {
    expect(parseInput('5')).toBe(5);
    expect(parseInput('-7')).toBe(-7);
    expect(parseInput('5 3, 8')).toBe('5 3 8');
    expect(parseInput('100')).toBeInstanceOf(Error);
    expect(parseInput('1 2 x')).toBeInstanceOf(Error);
    expect(parseInput(Array(17).fill('1').join(' '))).toBeInstanceOf(Error);
  });
});

describe('range-queries practice', () => {
  const kinds = rangeQueries.practice!;

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual([
      'prefix-sum',
      'which-entries',
      'sparse-windows',
      'update-count',
    ]);
  });

  it('gets every answer right, checked against a plain array', () => {
    for (let seed = 1; seed <= 150; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const a = String(q.setup[0]![1]).split(' ').map(Number);
        const n = a.length;
        const [op, x, y] = q.watch![0]!;
        const answer = q.answer;
        if (k.id === 'prefix-sum') {
          expect(op).toBe('query');
          expect(answer).toEqual({ kind: 'number', value: scanSum(a, Number(x), Number(y)) });
        } else if (k.id === 'which-entries') {
          expect(answer.kind).toBe('choice');
          if (answer.kind !== 'choice') continue;
          expect(answer.options[answer.correct]).toBe(`P[${Number(y) + 1}] − P[${Number(x)}]`);
        } else if (k.id === 'sparse-windows') {
          if (answer.kind !== 'choice') throw new Error('choice expected');
          const [i, j] = [Number(x), Number(y)];
          const kk = Math.floor(Math.log2(j - i + 1));
          expect(answer.options[answer.correct]).toBe(
            `M[${kk}][${i}] and M[${kk}][${j - 2 ** kk + 1}]`,
          );
          // Every wrong option really is wrong: it names other entries.
          answer.options.forEach((o, c) => {
            if (c !== answer.correct) expect(o).not.toBe(answer.options[answer.correct]);
          });
        } else {
          const [i, v] = [Number(x), Number(y)];
          expect(v).not.toBe(a[i]);
          const sparse = q.settings?.structure === 'sparse';
          let want = n - i;
          if (sparse) {
            want = 0;
            for (let kk = 1; 2 ** kk <= n; kk++)
              for (let t = 0; t + 2 ** kk <= n; t++) if (t <= i && i < t + 2 ** kk) want += 1;
          }
          expect(answer).toEqual({ kind: 'number', value: want });
        }
      }
    }
  });
});
