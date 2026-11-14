import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { prefixSumHashmap as def } from '.';
import { allFound, prefixSums, type Goal, type PSSettings, type Span } from './model';

/** The reference: try every pair of ends, from scratch. */
function reference(a: number[], k: number) {
  const hits: Span[] = [];
  for (let i = 0; i < a.length; i++)
    for (let j = i; j < a.length; j++) {
      let s = 0;
      for (let t = i; t <= j; t++) s += a[t]!;
      if (s === k) hits.push({ lo: i, hi: j });
    }
  let best: Span | null = null;
  for (const h of hits) if (!best || h.hi - h.lo > best.hi - best.lo) best = h;
  return { count: hits.length, hits, best };
}

const arrays = fc.array(fc.integer({ min: -6, max: 6 }), { minLength: 1, maxLength: 12 });
const ks = fc.integer({ min: -10, max: 12 });
const goals = fc.constantFrom<Goal>('count', 'longest');
const approaches = fc.constantFrom('pattern' as const, 'naive' as const);

function runFind(a: number[], k: number, settings: PSSettings) {
  const t = new Timeline(def, settings, 1, [
    ['load', a.join(' ')],
    ['find', k],
  ]);
  return t.entries[1]!.steps;
}

describe('prefix-sum-hashmap', () => {
  it('gives the reference answer both ways, and keeps every step consistent', () => {
    fc.assert(
      fc.property(arrays, ks, goals, approaches, (a, k, goal, approach) => {
        const settings: PSSettings = { approach, goal };
        const steps = runFind(a, k, settings);
        const ref = reference(a, k);
        const p = prefixSums(a);
        const n = a.length;
        const last = steps.at(-1)!;
        if (goal === 'count') expect(last.vars?.count).toBe(ref.count);
        else {
          expect(last.vars?.best).toBe(ref.best ? ref.best.hi - ref.best.lo + 1 : 0);
          expect(last.vars?.start).toBe(ref.best ? ref.best.lo : -1);
          expect(last.extra?.best).toEqual(ref.best ?? undefined);
        }
        // The work: n sums and 2n lookups, or n(n + 1)/2 sums.
        expect(last.vars?.['naive total']).toBe((n * (n + 1)) / 2);
        expect(last.vars?.['pattern total']).toBe(3 * n);
        if (approach === 'pattern') {
          expect(last.vars?.sums).toBe(n);
          expect(last.vars?.lookups).toBe(2 * n);
        } else {
          expect(last.vars?.sums).toBe((n * (n + 1)) / 2);
          expect(last.vars?.lookups).toBe(0);
        }
        for (const step of steps) {
          const e = step.extra!;
          expect(e.k).toBe(k);
          // What has been found is a prefix of what the operation will find.
          expect(e.frame.all.slice(0, e.found.length)).toEqual(e.found);
          for (const f of e.found) expect(p[f.hi + 1]! - p[f.lo]!).toBe(k);
          if (approach === 'pattern') {
            // Running sums so far are the prefix sums; the map is built from the recorded ones.
            const known = e.sums!.filter((v) => v !== null);
            expect(known).toEqual(p.slice(0, known.length));
            const recorded =
              step.lines.includes('record') ||
              step.lines.includes('init') ||
              step.lines.includes('ret')
                ? known
                : known.slice(0, -1);
            const want = new Map<number, number>();
            recorded.forEach((v, j) => {
              if (goal === 'count') want.set(v, (want.get(v) ?? 0) + 1);
              else if (!want.has(v)) want.set(v, j);
            });
            expect(e.map).toEqual([...want].map(([key, value]) => ({ key, value })));
          } else {
            for (const [i, row] of e.tri!.entries())
              row.forEach((v, j) => {
                if (v !== null) expect(v).toBe(p[j + 1]! - p[i]!);
              });
          }
        }
        if (goal === 'count') expect(last.extra!.found).toEqual(allFound(a, k, approach));
      }),
      { numRuns: 300 },
    );
  });

  it('counts each subarray once, so the two approaches find the same set', () => {
    fc.assert(
      fc.property(arrays, ks, (a, k) => {
        const key = (s: Span) => `${s.lo}:${s.hi}`;
        const pat = allFound(a, k, 'pattern').map(key).sort();
        const nai = allFound(a, k, 'naive').map(key).sort();
        expect(pat).toEqual(nai);
        expect(pat).toEqual(reference(a, k).hits.map(key).sort());
      }),
    );
  });

  it('looks up before it records, so k = 0 never counts an empty subarray', () => {
    const steps = runFind([3, -3, 2, -2, 1, -1], 0, { approach: 'pattern', goal: 'count' });
    expect(steps.at(-1)!.vars?.count).toBe(6);
  });

  it('refuses a k it cannot read and values out of range', () => {
    const t = new Timeline(def, { approach: 'pattern', goal: 'count' }, 1, [
      ['find', 'cat'],
      ['load', '1 2 300'],
      ['load', Array(13).fill(1).join(' ')],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/Type k as one whole number/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/300 is out of range/);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/at most 12/);
    expect(t.endState().a).toEqual([2, 3, -1, 2, -4, 1, 2, -1]);
  });

  it('reads the input box: one number is k, a list is values', () => {
    const parse = def.controls.input!.parse;
    expect(parse('3')).toBe(3);
    expect(parse('−4')).toBe(-4);
    expect(parse('2, 3, -1')).toBe('2 3 -1');
    expect(parse('1000')).toBeInstanceOf(Error);
    expect(parse('1 2 x')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
