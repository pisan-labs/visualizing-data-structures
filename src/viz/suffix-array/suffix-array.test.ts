import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
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

describe('suffix array narration and practice', () => {
  it('counts in plain grammar', () => {
    const t = new Timeline(suffixArray, settings(), 1, [
      ['load', 'BANANA'],
      ['build'],
      ['search', 'B'],
      ['search', 'ANA'],
    ]);
    const says = t.entries.flatMap((e) => e.steps.map((s) => s.say));
    expect(says.join(' ')).not.toMatch(/\b1 characters|Rows (\d+) to \1 /);
    expect(says).toContain(
      "Position 3: 'ANA' is in row 1; above it is 'A'. The first character is known to match (h = 1), so start comparing after it. They share 'A': LCP[1] = 1. Then h drops by one for the next position.",
    );
    expect(t.entries[2]!.steps.at(-1)!.say).toMatch(/^Row 3 starts with 'B'/);
    expect(t.entries[3]!.steps.at(-1)!.say).toMatch(/^Rows 1 and 2 start with 'ANA'/);
  });

  it('gets every practice answer right, checked against the references', () => {
    for (let seed = 1; seed <= 60; seed++)
      for (const item of practiceSet(suffixArray, seed, 4)) {
        const q = item.question;
        const text = String(q.setup[0]![1]);
        const sa = refSa(text);
        if (item.kind.id === 'sa')
          expect(q.answer).toEqual({ kind: 'sequence', value: sa.map(String) });
        if (item.kind.id === 'lcp') {
          const row = Number(/LCP\[(\d+)\]/.exec(q.prompt)![1]);
          expect(q.answer).toEqual({ kind: 'number', value: refLcp(text, sa)[row] });
          expect(q.explain).not.toMatch(/\b1 characters/);
        }
        if (item.kind.id === 'search') {
          const p = String(q.watch![0]![1]);
          expect(q.answer).toEqual({ kind: 'sequence', value: refFind(text, p).map(String) });
        }
        if (item.kind.id === 'repeat' && q.answer.kind === 'choice') {
          const right = q.answer.options[q.answer.correct]!;
          expect(right.length).toBe(refRepeatLength(text));
          // No other option repeats and is as long: the answer is the only right one.
          for (const o of q.answer.options)
            if (o !== right)
              expect(o.length < right.length || text.indexOf(o) === text.lastIndexOf(o)).toBe(true);
        }
      }
  });
});

describe('drawn text size', () => {
  // Position and row numbers were 12 and 13 units, column heads 13, then 14 (8.5 px on a
  // phone): now 16.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(suffixArray, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(suffixArray, PHONE_STAGE).px).toBeGreaterThanOrEqual(9.5);
  });
});
