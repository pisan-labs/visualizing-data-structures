import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { PracticeQuestion } from '../../engine/types';
import { valuesOf } from '../_sorting/kit';
import { bucketSort } from '.';
import { MAX_N, type BucketSettings, type BucketStep } from './model';

const fractionArb = fc.array(
  fc.integer({ min: 0, max: 99 }).map((k) => k / 100),
  { minLength: 1, maxLength: MAX_N },
);
const integerArb = fc.array(fc.integer({ min: 0, max: 99 }), { minLength: 1, maxLength: MAX_N });

const run = (values: number[], kind: BucketSettings['values']) =>
  new Timeline(bucketSort, { values: kind, draw: 'cells' } as BucketSettings, 1, [
    ['load', values.join(' ')],
    ['sort'],
  ]);

/** The reference bucket of a value. */
function refBucket(v: number, values: number[], kind: BucketSettings['values']): number {
  const n = values.length;
  const [lo, hi] = kind === 'fraction' ? [0, 1] : [Math.min(...values), Math.max(...values) + 1];
  return Math.min(n - 1, Math.floor((n * (v - lo)) / (hi - lo)));
}

/** Comparisons an insertion sort makes on each reference bucket, in arrival order. */
function refComparisons(values: number[], kind: BucketSettings['values']): number {
  let c = 0;
  for (let b = 0; b < values.length; b++) {
    const list = values.filter((v) => refBucket(v, values, kind) === b);
    for (let i = 1; i < list.length; i++) {
      const key = list[i]!;
      let j = i - 1;
      while (j >= 0) {
        c++;
        if (list[j]! <= key) break;
        list[j + 1] = list[j]!;
        j--;
      }
      list[j + 1] = key;
    }
  }
  return c;
}

describe('bucket sort', { timeout: 60_000 }, () => {
  for (const kind of ['fraction', 'integer'] as const) {
    it(`sorts ${kind}s like the built-in sort, stably, with every value in its own bucket`, () => {
      fc.assert(
        fc.property(kind === 'fraction' ? fractionArb : integerArb, (values) => {
          const t = run(values, kind);
          const steps = t.entries[1]!.steps as BucketStep[];
          const sorted = [...values].sort((a, b) => a - b);
          for (const step of steps) {
            const inA = step.state.a.filter((x) => !x.stale);
            const inBuckets = (step.extra?.buckets ?? []).flat();
            const all = [...inA, ...inBuckets];
            // Nothing lost while values sit in buckets, and no value in two places.
            expect(all.map((x) => x.value).sort((a, b) => a - b)).toEqual(sorted);
            expect(new Set(all.map((x) => x.uid)).size).toBe(all.length);
            (step.extra?.buckets ?? []).forEach((b, i) => {
              for (const x of b) expect(refBucket(x.value, values, kind), `${x.value}`).toBe(i);
              expect(b.length).toBeLessThanOrEqual(step.extra!.depth!);
            });
          }
          const end = t.endState();
          expect(valuesOf(end)).toEqual(sorted);
          // Stable: equal values keep the order load gave their uids, left to right.
          for (let i = 0; i + 1 < end.a.length; i++)
            if (end.a[i]!.value === end.a[i + 1]!.value)
              expect(end.a[i]!.uid).toBeLessThan(end.a[i + 1]!.uid);
          expect(steps.at(-1)!.vars?.comparisons).toBe(refComparisons(values, kind));
        }),
        { numRuns: 150 },
      );
    });
  }

  it('matches the examples: no comparisons when spread out, 28 when all share one bucket', () => {
    const c = (values: number[], kind: BucketSettings['values'] = 'fraction') =>
      run(values, kind).entries[1]!.steps.at(-1)!.vars;
    expect(c([0.55, 0.05, 0.85, 0.35, 0.15, 0.95, 0.65, 0.25, 0.75, 0.45])).toMatchObject({
      comparisons: 0,
      fullest: 1,
    });
    expect(c([0.09, 0.08, 0.07, 0.06, 0.05, 0.03, 0.02, 0.01])).toMatchObject({
      comparisons: 28,
      fullest: 8,
    });
    expect(c([7, 3, 6, 1, 5, 2, 4, 99], 'integer')).toMatchObject({ fullest: 7 });
    expect(c([0.78, 0.17, 0.39, 0.26, 0.72, 0.94, 0.21, 0.12, 0.23, 0.68])).toMatchObject({
      fullest: 3,
    });
  });

  it('reads values for the chosen setting', () => {
    const t = new Timeline(bucketSort, { values: 'fraction', draw: 'cells' }, 1, [
      ['load', '0.5 1.0'],
      ['load', '78'],
      ['load', '0.123'],
    ]);
    for (const e of t.entries) expect(e.end).toBe(t.initial.state);
    const ints = new Timeline(bucketSort, { values: 'integer', draw: 'cells' }, 1, [
      ['load', '0.5'],
      ['load', '100'],
    ]);
    for (const e of ints.entries) expect(e.end).toBe(ints.initial.state);
    const ok = new Timeline(bucketSort, { values: 'fraction', draw: 'cells' }, 1, [
      ['load', '.5 0.25 0'],
    ]);
    expect(valuesOf(ok.endState())).toEqual([0.5, 0.25, 0]);
  });
});

describe('bucket sort practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 30 && seed < 500; seed++)
      for (const item of practiceSet(bucketSort, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(10);
    return out;
  }
  const loaded = (q: PracticeQuestion) => String(q.setup[0]![1]).split(' ').map(Number);
  const j = (q: PracticeQuestion) => Number(/A\[(\d+)\]/.exec(q.prompt)![1]);

  it('expects the reference bucket', () => {
    for (const q of questions('bucket-of')) {
      const vs = loaded(q);
      expect(q.answer).toEqual({ kind: 'number', value: refBucket(vs[j(q)]!, vs, 'fraction') });
    }
    for (const q of questions('integer-bucket')) {
      const vs = loaded(q);
      expect(q.answer).toEqual({ kind: 'number', value: refBucket(vs[j(q)]!, vs, 'integer') });
    }
  });

  it('expects the values of the bucket in the order they arrive', () => {
    for (const q of questions('bucket-contents')) {
      const vs = loaded(q);
      const b = Number(/what does bucket (\d+) hold/.exec(q.prompt)![1]);
      const want = vs.filter((v) => refBucket(v, vs, 'fraction') === b).map(String);
      expect(q.answer).toEqual({ kind: 'sequence', value: want });
    }
  });

  it('expects the reference number of comparisons', () => {
    for (const q of questions('comparisons'))
      expect(q.answer).toEqual({ kind: 'number', value: refComparisons(loaded(q), 'fraction') });
  });
});
