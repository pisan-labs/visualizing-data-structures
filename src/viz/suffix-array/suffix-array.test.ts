import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { suffixArray } from '.';
import { parseText, type SuffixSettings } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';

const settings = (method: SuffixSettings['method'] = 'doubling'): SuffixSettings => ({ method });

/** References written separately from the model: sort the suffixes themselves, and so on. */
const refSa = (t: string) =>
  Array.from({ length: t.length }, (_, i) => i).sort((a, b) => (t.slice(a) < t.slice(b) ? -1 : 1));
function refLcp(t: string, sa: number[]): number[] {
  return sa.map((p, i) => {
    if (i === 0) return 0;
    const q = sa[i - 1]!;
    let h = 0;
    while (t[p + h] !== undefined && t[p + h] === t[q + h]) h++;
    return h;
  });
}
function refFind(t: string, p: string): number[] {
  const out: number[] = [];
  for (let i = 0; i + p.length <= t.length; i++) if (t.startsWith(p, i)) out.push(i);
  return out;
}
function refRepeatLength(t: string): number {
  let best = 0;
  for (let i = 0; i < t.length; i++)
    for (let j = i + 1; j <= t.length; j++) {
      const s = t.slice(i, j);
      if (t.indexOf(s, i + 1) >= 0) best = Math.max(best, s.length);
    }
  return best;
}

const textArb = fc
  .tuple(fc.constantFrom('AB', 'ABC', 'A', 'ACGT', 'abN0'), fc.integer({ min: 1, max: 16 }))
  .chain(([letters, n]) =>
    fc
      .array(fc.integer({ min: 0, max: letters.length - 1 }), { minLength: n, maxLength: n })
      .map((xs) => xs.map((x) => letters[x]).join('')),
  );

describe('suffix array', () => {
  it('builds BANANA', () => {
    const t = new Timeline(suffixArray, settings(), 1, [['load', 'BANANA'], ['build']]);
    expect(t.endState().sa).toEqual([5, 3, 1, 0, 4, 2]);
    expect(t.endState().lcp).toEqual([0, 1, 3, 0, 0, 2]);
  });

  it('checks its input', () => {
    expect(parseText('BANANA', 'text')).toBe('BANANA');
    expect(parseText('', 'text')).toBeInstanceOf(Error);
    expect(parseText('A B', 'text')).toBeInstanceOf(Error);
    expect(parseText('A$', 'text')).toBeInstanceOf(Error);
    expect(parseText('A'.repeat(17), 'text')).toBeInstanceOf(Error);
  });

  it('matches references for any text, with either build', () => {
    fc.assert(
      fc.property(
        textArb,
        fc.constantFrom('doubling' as const, 'naive' as const),
        fc.integer({ min: 1, max: 3 }),
        fc.nat(),
        (text, method, m, at) => {
          const from = at % text.length;
          const p = text.slice(from, from + m);
          const t = new Timeline(suffixArray, settings(method), 1, [
            ['load', text],
            ['build'],
            ['search', p],
            ['search', `${p}Z`],
            ['repeat'],
          ]);
          const s = t.endState();
          const sa = refSa(text);
          expect(s.sa).toEqual(sa);
          expect(s.lcp).toEqual(refLcp(text, sa));
          const found = t.entries[2]!.steps.at(-1)!.vars!.found;
          expect(String(found)).toBe(refFind(text, p).join(' '));
          const none = refFind(text, `${p}Z`);
          expect(String(t.entries[3]!.steps.at(-1)!.vars!.found)).toBe(
            none.length ? none.join(' ') : 'none',
          );
          const rep = String(t.entries[4]!.steps.at(-1)!.vars!.repeat);
          const len = refRepeatLength(text);
          if (len === 0) expect(rep).toBe('none');
          else {
            expect(rep.length).toBe(len);
            expect(text.indexOf(rep)).not.toBe(text.lastIndexOf(rep));
          }
          // Every step's rows are a permutation of the suffixes, and LCP values never exceed
          // the shorter of the two suffixes they compare.
          for (let i = 0; i < t.length; i++) {
            const { step } = t.at(i);
            const order = step.extra?.order;
            if (order)
              expect([...order].sort((a, b) => a - b)).toEqual(sa.slice().sort((a, b) => a - b));
            step.extra?.lcp?.forEach((v, r) => {
              if (v !== null && r > 0 && order)
                expect(v).toBeLessThanOrEqual(text.length - Math.max(order[r]!, order[r - 1]!));
            });
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('builds without being asked when a search comes first', () => {
    const t = new Timeline(suffixArray, settings(), 1, [['search', 'NA']]);
    expect(t.endState().sa).toEqual([5, 3, 1, 0, 4, 2]);
    expect(t.entries[0]!.steps.at(-1)!.vars!.found).toBe('2 4');
  });
});

describe('drawn text size', () => {
  // Position and row numbers were 12 and 13 units, column heads 13: now 14.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(suffixArray, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(10.5);
    expect(smallestText(suffixArray, PHONE_STAGE).px).toBeGreaterThanOrEqual(8.4);
  });
});
