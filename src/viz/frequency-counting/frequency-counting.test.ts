import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { frequencyCounting as def } from '.';
import {
  groupTotals,
  signature,
  sortLetters,
  uniqueTotals,
  type FSettings,
  type GroupExtra,
  type UniqueExtra,
} from './model';

/** The reference grouping: two words go together when their sorted letters match. */
function referenceGroups(words: string[]): number[][] {
  const out: number[][] = [];
  const sorted = words.map((w) => [...w].sort().join(''));
  words.forEach((_, t) => {
    const g = out.find((grp) => sorted[grp[0]!] === sorted[t]);
    if (g) g.push(t);
    else out.push([t]);
  });
  return out;
}

/** The reference first unique letter: count each letter by scanning. */
function referenceUnique(w: string): number {
  for (let i = 0; i < w.length; i++) if ([...w].filter((c) => c === w[i]).length === 1) return i;
  return -1;
}

const word = (max: number) =>
  fc.string({ unit: fc.constantFrom(...'abcde'), minLength: 1, maxLength: max });
const lists = fc.array(word(6), { minLength: 1, maxLength: 8 });
const approaches = fc.constantFrom('pattern' as const, 'naive' as const);

function steps(calls: [string, ...(string | number)[]][], settings: FSettings) {
  return new Timeline(def, settings, 1, calls).entries.at(-1)!.steps;
}

describe('frequency-counting', () => {
  it('groups anagrams as the reference does, both ways, and keeps every step consistent', () => {
    fc.assert(
      fc.property(lists, approaches, (words, approach) => {
        const ss = steps([['load', words.join(' ')], ['group']], { approach });
        const want = referenceGroups(words);
        const last = ss.at(-1)!;
        const e = last.extra as GroupExtra;
        expect(e.map.map((m) => m.words)).toEqual(want);
        const tot = groupTotals(words);
        expect(last.vars?.['naive total']).toBe(tot.naive);
        expect(last.vars?.['pattern total']).toBe(tot.pattern);
        const total =
          Number(last.vars?.comparisons) + Number(last.vars?.counts) + Number(last.vars?.lookups);
        expect(total).toBe(approach === 'naive' ? tot.naive : tot.pattern);
        for (const step of ss) {
          const x = step.extra as GroupExtra;
          // Keys made so far are right, and every placed word is in its key's group.
          x.keys.forEach((k, t) => {
            if (k === null) return;
            expect(k).toBe(
              approach === 'naive' ? [...words[t]!].sort().join('') : signature(words[t]!),
            );
          });
          x.group.forEach((g, t) => {
            if (g === null) return;
            expect(x.map[g]!.words).toContain(t);
            expect(x.map[g]!.key).toBe(x.keys[t]);
          });
          if (x.counts && x.cur !== undefined) {
            const w = words[x.cur]!.slice(0, x.counted);
            expect(x.counts.join(',')).toBe(
              [...'abcdefghijklmnopqrstuvwxyz']
                .map((c) => [...w].filter((d) => d === c).length)
                .join(','),
            );
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('finds the first unique letter as the reference does, both ways', () => {
    fc.assert(
      fc.property(word(12), approaches, (w, approach) => {
        const ss = steps([['unique', w]], { approach });
        const last = ss.at(-1)!;
        const want = referenceUnique(w);
        expect(last.vars?.answer).toBe(want);
        expect((last.extra as UniqueExtra).answer).toBe(want);
        const tot = uniqueTotals(w);
        expect(last.vars?.comparisons).toBe(approach === 'naive' ? tot.naive : 0);
        expect(last.vars?.counts).toBe(approach === 'naive' ? 0 : tot.pattern);
        for (const step of ss) {
          const x = step.extra as UniqueExtra;
          // Every count shown is the letter's true count.
          x.seen.forEach((c, i) => {
            if (c !== null) expect(c).toBe([...w].filter((d) => d === w[i]).length);
          });
        }
      }),
      { numRuns: 200 },
    );
  });

  it('sorts letters by a merge sort and counts its comparisons', () => {
    expect(sortLetters('night')).toEqual({ sorted: 'ghint', comparisons: 7 });
    expect(signature('banana')).toBe('a3b1n2');
  });

  it('refuses what it cannot read', () => {
    const t = new Timeline(def, { approach: 'pattern' }, 1, [
      ['load', 'one two3'],
      ['load', 'abcdefghijk'],
      ['unique', 'two words'],
      ['unique', 5],
    ]);
    const say = (k: number) => t.entries[k]!.steps[0]!.say;
    expect(say(0)).toMatch(/not a word/);
    expect(say(1)).toMatch(/at most 10/);
    expect(say(2)).toMatch(/Type one word/);
    expect(say(3)).toMatch(/not a word/);
    expect(t.endState().words).toHaveLength(8);
  });

  it('reads the input box: one word, or a list', () => {
    const parse = def.controls.input!.parse;
    expect(parse('Level')).toBe('level');
    expect(parse('tops, spot')).toBe('tops spot');
    expect(parse('a1')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
