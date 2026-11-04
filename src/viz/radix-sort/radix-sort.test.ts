import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { PracticeQuestion } from '../../engine/types';
import { valuesOf } from '../_sorting/kit';
import { radixSort } from '.';
import { RANGE, type RadixSettings, type RadixStep } from './model';

const valuesArb = fc.array(fc.integer({ min: 0, max: RANGE.hi }), {
  minLength: 1,
  maxLength: RANGE.max,
});

const run = (values: number[], base: number) =>
  new Timeline(radixSort, { base, draw: 'cells' } as RadixSettings, 1, [
    ['load', values.join(' ')],
    ['sort'],
  ]);

/** The reference passes: a stable sort of the previous order by each digit, last digit first. */
function refPasses(values: number[], base: number): number[][] {
  const out: number[][] = [];
  let order = values.map((v, i) => ({ v, i }));
  let place = 1;
  do {
    order = [...order].sort(
      (p, q) => (Math.floor(p.v / place) % base) - (Math.floor(q.v / place) % base) || 0,
    );
    out.push(order.map((x) => x.v));
    place *= base;
  } while (Math.max(...values) >= place);
  return out;
}

describe('radix sort', { timeout: 60_000 }, () => {
  it('makes each pass a stable sort by one digit, and ends sorted and stable', () => {
    fc.assert(
      fc.property(valuesArb, fc.integer({ min: 2, max: 16 }), (values, base) => {
        const t = run(values, base);
        const steps = t.entries[1]!.steps as RadixStep[];
        const want = refPasses(values, base);
        const sorted = [...values].sort((a, b) => a - b);
        for (const step of steps) {
          // Nothing is lost while values sit in buckets, and no value is in two places.
          const inA = step.state.a.filter((x) => !x.stale);
          const inBuckets = (step.extra?.buckets ?? []).flat();
          const all = [...inA, ...inBuckets];
          expect(all.map((x) => x.value).sort((a, b) => a - b)).toEqual(sorted);
          expect(new Set(all.map((x) => x.uid)).size).toBe(all.length);
          // Every value in bucket d has digit d in this pass.
          const place = step.extra?.place ?? 1;
          (step.extra?.buckets ?? []).forEach((b, d) =>
            b.forEach((x) => expect(Math.floor(x.value / place) % base).toBe(d)),
          );
          if (step.extra?.buckets)
            expect(Math.max(...step.extra.buckets.map((b) => b.length))).toBeLessThanOrEqual(
              step.extra.depth!,
            );
        }
        // After each pass, A is the reference order for that pass.
        const ends = steps.filter((s) => s.level === 1 && s.extra?.pass !== undefined);
        expect(ends.map((s) => valuesOf(s.state))).toEqual(want);
        // Stable: equal values keep the order load gave their uids, left to right.
        const end = t.endState();
        expect(valuesOf(end)).toEqual(sorted);
        for (let i = 0; i + 1 < end.a.length; i++)
          if (end.a[i]!.value === end.a[i + 1]!.value)
            expect(end.a[i]!.uid).toBeLessThan(end.a[i + 1]!.uid);
        expect(steps.at(-1)!.vars?.passes).toBe(want.length);
      }),
      { numRuns: 150 },
    );
  });

  it('needs fewer passes in a bigger base', () => {
    const passes = (base: number) =>
      run([200, 13, 77, 150, 34, 255], base).entries[1]!.steps.at(-1)!.vars?.passes;
    expect(passes(16)).toBe(2);
    expect(passes(10)).toBe(3);
    expect(passes(2)).toBe(8);
    expect(run([999], 2).entries[1]!.steps.at(-1)!.vars?.passes).toBe(10);
  });

  it('follows the base in its pseudocode, and refuses values above 999', () => {
    const text = radixSort
      .pseudocode({ base: 16, draw: 'cells' })
      .flatMap((b) => b.lines.map((l) => l.text));
    expect(text).toContain('append A[j] to bucket[(A[j] / place) mod 16]');
    const t = new Timeline(radixSort, { base: 10, draw: 'cells' }, 1, [['load', '5 1000']]);
    expect(t.endState()).toBe(t.initial.state);
  });
});

describe('radix sort practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 30 && seed < 500; seed++)
      for (const item of practiceSet(radixSort, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(10);
    return out;
  }
  const loaded = (q: PracticeQuestion) => String(q.setup[0]![1]).split(' ').map(Number);
  const baseOf = (q: PracticeQuestion) => Number(q.settings?.base);

  it('expects the reference order after a pass', () => {
    for (const q of questions('after-pass')) {
      const p = Number(/after pass (\d)/.exec(q.prompt)![1]);
      const want = refPasses(loaded(q), 10)[p - 1]!.map(String);
      expect(q.answer).toEqual({ kind: 'sequence', value: want });
    }
  });

  it('expects the digit of the value for the pass', () => {
    for (const q of questions('bucket')) {
      const [, p, v] = /In pass (\d+),.*does (\d+) go/.exec(q.prompt)!.map(Number);
      const base = baseOf(q);
      expect(q.answer).toEqual({
        kind: 'number',
        value: Math.floor(v! / base ** (p! - 1)) % base,
      });
    }
  });

  it('expects one pass per digit of the largest value', () => {
    for (const q of questions('passes')) {
      const max = Math.max(...loaded(q));
      expect(q.answer).toEqual({
        kind: 'number',
        value: Math.max(1, max.toString(baseOf(q)).length),
      });
    }
  });

  it('expects the values with that digit, in the order the pass meets them', () => {
    for (const q of questions('bucket-contents')) {
      const [, p, d] = /In pass (\d),.*bucket (\d)/.exec(q.prompt)!.map(Number);
      const vs = loaded(q);
      const before = p === 1 ? vs : refPasses(vs, 10)[p! - 2]!;
      const want = before.filter((v) => Math.floor(v / 10 ** (p! - 1)) % 10 === d).map(String);
      expect(q.answer).toEqual({ kind: 'sequence', value: want });
    }
  });
});
