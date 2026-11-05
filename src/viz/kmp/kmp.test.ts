import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeQuestion } from '../../engine/types';
import { checkMatchTimeline, inputArb, plantedArb, refMatches } from '../_strings/check';
import { loadCall, MAX_TEXT } from '../_strings/kit';
import { kmp } from '.';
import type { KmpSettings } from './model';

const run = (ops: OpCall[], name: KmpSettings['name'] = 'pi') =>
  new Timeline(kmp, { name }, 1, ops);

const pseudocodeText = (settings: KmpSettings) =>
  kmp.pseudocode(settings).flatMap((b) => b.lines.map((l) => l.text));

/** π by its definition: the longest proper prefix of p[0..j] that is also a suffix of it. */
function refPi(p: string): number[] {
  return [...p].map((_, j) => {
    const w = p.slice(0, j + 1);
    for (let k = j; k > 0; k--) if (w.slice(0, k) === w.slice(j + 1 - k)) return k;
    return 0;
  });
}

/** Plain KMP with the reference table: the shifts it tries and the comparisons it makes. */
function refKmp(text: string, pattern: string) {
  const n = text.length;
  const m = pattern.length;
  const pi = refPi(pattern);
  const shifts: number[] = [];
  let comparisons = 0;
  let s = 0;
  let q = 0;
  while (s <= n - m) {
    shifts.push(s);
    while (q < m) {
      comparisons++;
      if (text[s + q] !== pattern[q]) break;
      q++;
    }
    if (q === 0) s++;
    else {
      s += q - pi[q - 1]!;
      q = pi[q - 1]!;
    }
  }
  return { shifts, comparisons };
}

describe('Knuth-Morris-Pratt', { timeout: 60_000 }, () => {
  it('finds what indexOf finds, with a correct table and a text pointer that never goes back', () => {
    fc.assert(
      fc.property(
        fc.oneof(inputArb('AB', 16, 6), plantedArb('AB', 16, 6), inputArb('ABC', MAX_TEXT, 8)),
        fc.constantFrom('pi' as const, 'failure' as const),
        ({ text, pattern }, name) => {
          const t = run([loadCall(text, pattern), ['search']], name);
          checkMatchTimeline(t);
          const pi = refPi(pattern);
          let last = -1;
          for (let k = 0; k < t.length; k++) {
            const { step } = t.at(k);
            // Every value of the table written so far is right.
            step.state.pre?.pi.forEach((v, j) => {
              if (v !== null) expect(v, `π[${j}]`).toBe(pi[j]);
            });
            // Matching reads T from left to right and never goes back.
            const at = step.extra?.pair?.i;
            if (at !== undefined) {
              expect(at, 'the text pointer never moves back').toBeGreaterThanOrEqual(last);
              last = at;
            }
          }
          const end = t.endState();
          const ref = refKmp(text, pattern);
          expect(end.search!.found).toEqual(refMatches(text, pattern));
          expect(end.search!.attempts.map((a) => a.s)).toEqual(ref.shifts);
          expect(end.search!.comparisons).toBe(ref.comparisons);
          expect(end.search!.comparisons).toBeLessThanOrEqual(
            Math.max(0, 2 * text.length - pattern.length + 1),
          );
          expect(end.pre!.comparisons).toBeLessThan(2 * pattern.length);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('builds the table alone, keeps it for a new text, and rebuilds it for a new pattern', () => {
    const t = run([
      ['load', 'ABAB / AABAACAABAA'],
      ['prefix'],
      ['prefix'],
      ['load', 'AABAABAACAABAA / AABAACAABAA'],
      ['load', 'XX / XY'],
    ]);
    expect(t.entries[1]!.end.pre!.pi).toEqual([0, 1, 0, 1, 2, 0, 1, 2, 3, 4, 5]);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/^π is already built/);
    expect(t.entries[3]!.end.pre).toEqual(t.entries[1]!.end.pre);
    expect(t.entries[3]!.steps[0]!.say).toMatch(/so its table .* stays/);
    expect(t.entries[4]!.end.pre).toBeNull();
    // With the table kept, a search goes straight to matching.
    const kept = run([['prefix'], ['load', 'ABABAC'], ['search']]);
    const lines = kept.entries[2]!.steps.flatMap((s) => s.lines);
    expect(lines).not.toContain('p.set');
  });

  it('slides keeping the border and says why', () => {
    const t = run([['next'], ['next']]);
    const second = t.entries[1]!.steps.at(-1)!;
    expect(second.say).toMatch(
      /^Shift 1 matched 'ABABA', then T\[6\] ≠ P\[5\]\. Its longest border is 'ABA': π\[4\] = 3\. Slide P 2 places, to s = 3/,
    );
    expect(t.endState().search!.next).toMatchObject({ s: 3, known: 3 });
  });

  it('follows the name setting in its narration and pseudocode', () => {
    const t = run([['search']], 'failure');
    expect(t.entries[0]!.steps[0]!.say).toMatch(/^First KMP builds f, the failure function/);
    expect(pseudocodeText({ name: 'failure' })).toContain('q = f[q − 1]');
    expect(pseudocodeText({ name: 'pi' })).toContain('q = π[q − 1]');
  });
});

describe('Knuth-Morris-Pratt practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 40 && seed < 600; seed++)
      for (const item of practiceSet(kmp, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(20);
    return out;
  }
  const words = (q: PracticeQuestion) => {
    const [text, pattern] = String(q.setup[0]![1]).split(' / ');
    return [text!, pattern!] as const;
  };

  it('asks for values of π that match its definition', () => {
    for (const q of questions('pi-value')) {
      const [, pattern] = words(q);
      const j = Number(/What is π\[(\d+)\]/.exec(q.prompt)![1]);
      expect(q.answer).toEqual({ kind: 'number', value: refPi(pattern)[j] });
    }
    for (const q of questions('pi-table')) {
      const [, pattern] = words(q);
      expect(q.answer).toEqual({ kind: 'sequence', value: refPi(pattern).map(String) });
    }
  });

  it('expects the shift plain KMP tries next', () => {
    for (const q of questions('next-shift')) {
      const [text, pattern] = words(q);
      const s = Number(/P waits at shift (\d+)/.exec(q.prompt)![1]);
      const { shifts } = refKmp(text, pattern);
      const k = shifts.indexOf(s);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(q.setup.length - 2).toBe(k);
      expect(q.answer).toEqual({ kind: 'number', value: shifts[k + 1] });
    }
  });

  it('counts the comparisons plain KMP makes', () => {
    for (const q of questions('comparisons')) {
      const [text, pattern] = words(q);
      expect(q.answer).toEqual({ kind: 'number', value: refKmp(text, pattern).comparisons });
    }
  });
});
