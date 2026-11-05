import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeQuestion } from '../../engine/types';
import { checkMatchTimeline, inputArb, plantedArb, refMatches, shiftsOf } from '../_strings/check';
import { loadCall, MAX_PATTERN, MAX_TEXT, parseLoad } from '../_strings/kit';
import { bruteForce } from '.';

const run = (ops: OpCall[]) => new Timeline(bruteForce, {}, 1, ops);

/** How many characters of P match T from shift s, before the first mismatch. */
function lcp(text: string, pattern: string, s: number): number {
  let j = 0;
  while (j < pattern.length && text[s + j] === pattern[j]) j++;
  return j;
}

/** Comparisons brute force makes at shift s: up to and including the first mismatch. */
const costAt = (text: string, pattern: string, s: number) =>
  Math.min(pattern.length, lcp(text, pattern, s) + 1);

const shifts = (text: string, pattern: string) =>
  Array.from({ length: Math.max(0, text.length - pattern.length + 1) }, (_, s) => s);

describe('brute-force search', { timeout: 60_000 }, () => {
  it('finds what indexOf finds, at every shift, keeping the invariants on every step', () => {
    fc.assert(
      fc.property(
        fc.oneof(inputArb('AB'), plantedArb('AB'), inputArb('ABC', MAX_TEXT, 6)),
        ({ text, pattern }) => {
          const t = run([loadCall(text, pattern), ['search']]);
          checkMatchTimeline(t);
          const end = t.endState();
          const s = end.search!;
          expect(s.found).toEqual(refMatches(text, pattern));
          expect(shiftsOf(end)).toEqual(shifts(text, pattern));
          s.attempts.forEach((a) => {
            const k = lcp(text, pattern, a.s);
            const want = pattern
              .split('')
              .map((_, j) => (j < k ? 'match' : j === k ? 'mismatch' : null));
            expect(a.cells).toEqual(want);
          });
          const total = shifts(text, pattern).reduce((sum, x) => sum + costAt(text, pattern, x), 0);
          expect(s.comparisons).toBe(total);
          // The pointer is always on the character being compared.
          for (let k = 0; k < t.length; k++) {
            const { step } = t.at(k);
            if (step.extra?.pair) expect(step.extra.pointer?.at).toBe(step.extra.pair.i);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('goes one shift at a time with Next alignment, and Search carries on from there', () => {
    fc.assert(
      fc.property(plantedArb('AB', 12, 4), fc.nat(6), ({ text, pattern }, k) => {
        const load = loadCall(text, pattern);
        const steps: OpCall[] = Array.from({ length: k }, () => ['next']);
        const stepped = run([load, ...steps, ['search']]).endState();
        const whole = run([load, ['search']]).endState();
        expect(stepped.search!.attempts).toEqual(whole.search!.attempts);
        expect(stepped.search!.comparisons).toBe(whole.search!.comparisons);
        // Each Next alignment adds one alignment; after the last one, the next starts over.
        const partial = run([load, ...steps]).endState();
        const all = shifts(text, pattern).length;
        if (k > 0 && all > 0) expect(partial.search!.attempts).toHaveLength(((k - 1) % all) + 1);
      }),
      { numRuns: 100 },
    );
  });

  it('reads the text and the pattern, and explains what it cannot read', () => {
    expect(parseLoad('ABRACADABRA / ABRA')).toEqual({ text: 'ABRACADABRA', pattern: 'ABRA' });
    expect(parseLoad('abracadabra/abra')).toEqual({ text: 'abracadabra', pattern: 'abra' });
    expect(parseLoad('ABRACADABRA ABRA')).toEqual({ text: 'ABRACADABRA', pattern: 'ABRA' });
    expect(parseLoad('ABRA')).toEqual({ pattern: 'ABRA' });
    expect(parseLoad(42)).toEqual({ pattern: '42' });
    expect(parseLoad('')).toMatch(/^Type a text and a pattern/);
    expect(parseLoad('AB / ')).toMatch(/^Type the pattern after the slash/);
    expect(parseLoad(' / AB')).toMatch(/^Type the text before the slash/);
    expect(parseLoad('A / B / C')).toMatch(/^Use one slash/);
    expect(parseLoad('THE CAT SAT')).toMatch(/^That is 3 words/);
    expect(parseLoad('AB-C / A')).toMatch(/"-"/);
    expect(parseLoad('A B / C')).toMatch(/has a space/);
    expect(parseLoad(`${'A'.repeat(MAX_TEXT + 1)} / A`)).toMatch(/Keep it to 24/);
    expect(parseLoad(`A / ${'A'.repeat(MAX_PATTERN + 1)}`)).toMatch(/Keep it to 12/);
  });

  it('keeps the text when only a pattern is loaded, and keeps everything on bad input', () => {
    const t = run([
      ['load', 'ABAB / AB'],
      ['load', 'BA'],
      ['load', 'A-B'],
    ]);
    expect(t.entries[1]!.end).toMatchObject({ text: 'ABAB', pattern: 'BA' });
    expect(t.entries[2]!.end).toBe(t.entries[1]!.end);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/^Nothing loaded\./);
  });

  it('finds nothing, without comparing, when the pattern is longer than the text', () => {
    const t = run([['load', 'ABC / ABCD'], ['search']]);
    const s = t.endState().search!;
    expect(s).toMatchObject({ attempts: [], found: [], comparisons: 0, next: null });
    expect(t.entries[1]!.steps.at(-1)!.say).toMatch(/P does not occur in T/);
  });

  it('starts a new search after one has finished', () => {
    const t = run([['search'], ['next'], ['search']]);
    expect(t.entries[1]!.end.search!.attempts).toHaveLength(1);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/^Start a new search\./);
    expect(t.entries[2]!.end.search!.found).toEqual([3, 9]);
  });

  it('gives the drivers one line per finished search', () => {
    const { input, expected } = bruteForce.code!.script(
      [['search'], ['next'], ['load', 'AAAA / AA'], ['next'], ['next'], ['next']],
      {},
    );
    expect(input).toEqual(['search GABABABACABABACG ABABAC', 'search AAAA AA']);
    expect(expected).toEqual(['3 9', '0 1 2']);
  });
});

describe('brute-force search practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 40 && seed < 600; seed++)
      for (const item of practiceSet(bruteForce, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(20);
    return out;
  }
  const words = (q: PracticeQuestion) => {
    const [text, pattern] = String(q.setup[0]![1]).split(' / ');
    return [text!, pattern!] as const;
  };

  it('counts the comparisons at one shift like the reference', () => {
    for (const q of questions('alignment')) {
      const [text, pattern] = words(q);
      const s = Number(/waits at shift (\d+)/.exec(q.prompt)![1]);
      expect(q.setup.length - 1).toBe(s);
      expect(q.answer).toEqual({ kind: 'number', value: costAt(text, pattern, s) });
    }
  });

  it('counts every comparison like the reference', () => {
    for (const q of questions('total')) {
      const [text, pattern] = words(q);
      const total = shifts(text, pattern).reduce((sum, s) => sum + costAt(text, pattern, s), 0);
      expect(q.answer).toEqual({ kind: 'number', value: total });
    }
  });

  it('expects the matches indexOf finds', () => {
    for (const q of questions('found')) {
      const [text, pattern] = words(q);
      expect(q.answer).toEqual({ kind: 'sequence', value: refMatches(text, pattern).map(String) });
    }
  });

  it('counts how often one character is compared like the reference', () => {
    for (const q of questions('again')) {
      const [text, pattern] = words(q);
      const i = Number(/compare T\[(\d+)\]/.exec(q.prompt)![1]);
      const times = shifts(text, pattern).filter(
        (s) => s <= i && i - s <= Math.min(lcp(text, pattern, s), pattern.length - 1),
      ).length;
      expect(q.answer).toEqual({ kind: 'number', value: times });
    }
  });
});
