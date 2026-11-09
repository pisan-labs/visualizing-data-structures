import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { practiceSet } from '../../engine/practice';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeQuestion } from '../../engine/types';
import { checkMatchTimeline, inputArb, plantedArb, refMatches } from '../_strings/check';
import { loadCall, MAX_TEXT } from '../_strings/kit';
import { boyerMoore } from '.';
import type { BmPre, Rules } from './model';

const run = (ops: OpCall[], rules: Rules = 'horspool') =>
  new Timeline(boyerMoore, { rules }, 1, ops);

/** Horspool's shift for character c, from its definition. */
function refShift(p: string, c: string): number {
  const m = p.length;
  const j = p.slice(0, m - 1).lastIndexOf(c);
  return j < 0 ? m : m - 1 - j;
}

/** The last index of c in P, or -1. */
const refLast = (p: string, c: string) => p.lastIndexOf(c);

/**
 * The strong good-suffix shift for a mismatch at P[j]: the least k at which P could still match,
 * given that P[j+1..m-1] matched the text and P[j] did not. A mismatch at the last position has
 * no good suffix: 1.
 */
function refGs(p: string, j: number): number {
  const m = p.length;
  if (j === m - 1) return 1;
  const plausible = (k: number) =>
    [...p].every((_, t) => t <= j || t - k < 0 || p[t - k] === p[t]) &&
    (j - k < 0 || p[j - k] !== p[j]);
  let k = 1;
  while (k < m && !plausible(k)) k++;
  return k;
}

/** The least k at which P overlaps itself after a full match. */
function refPeriod(p: string): number {
  let k = 1;
  while (k < p.length && !p.startsWith(p.slice(k))) k++;
  return k;
}

/** Reference searches: the shifts tried, the comparisons, and (full) the rule of each slide. */
function refSearch(text: string, pattern: string, rules: Rules) {
  const n = text.length;
  const m = pattern.length;
  const shifts: number[] = [];
  const slides: { amount: number; rule: string }[] = [];
  let comparisons = 0;
  let s = 0;
  while (s <= n - m) {
    shifts.push(s);
    let j = m - 1;
    while (j >= 0) {
      comparisons++;
      if (text[s + j] !== pattern[j]) break;
      j--;
    }
    let slide: { amount: number; rule: string };
    if (rules === 'horspool') slide = { amount: refShift(pattern, text[s + m - 1]!), rule: '' };
    else if (j < 0) slide = { amount: refPeriod(pattern), rule: 'gs' };
    else {
      const bc = j - refLast(pattern, text[s + j]!);
      const gs = refGs(pattern, j);
      slide = { amount: Math.max(bc, gs), rule: bc === gs ? 'tie' : bc > gs ? 'bc' : 'gs' };
    }
    slides.push(slide);
    s += slide.amount;
  }
  return { shifts, comparisons, slides };
}

describe('Boyer-Moore', { timeout: 60_000 }, () => {
  it('finds what indexOf finds, comparing right to left and sliding by the right tables', () => {
    fc.assert(
      fc.property(
        fc.oneof(inputArb('AB', 16, 5), plantedArb('ABC', 16, 5), inputArb('ABCD', MAX_TEXT, 8)),
        fc.constantFrom('horspool' as const, 'full' as const),
        ({ text, pattern }, rules) => {
          const t = run([loadCall(text, pattern), ['search']], rules);
          checkMatchTimeline(t);
          const end = t.endState();
          const pre = end.pre as BmPre;
          const s = end.search!;
          const ref = refSearch(text, pattern, rules);
          expect(s.found).toEqual(refMatches(text, pattern));
          expect(s.attempts.map((a) => a.s)).toEqual(ref.shifts);
          expect(s.comparisons).toBe(ref.comparisons);
          // The tables, entry by entry.
          for (const c of 'ABCD')
            expect(
              pre.keys.includes(c) ? pre.bad[pre.keys.indexOf(c)] : pre.other,
              `table entry for ${c}`,
            ).toBe(rules === 'horspool' ? refShift(pattern, c) : refLast(pattern, c));
          if (rules === 'full') {
            expect(pre.gs).toEqual([...pattern].map((_, j) => refGs(pattern, j)));
            expect(pre.gsMatch).toBe(refPeriod(pattern));
            // Each slide names the rule that chose it.
            s.attempts.slice(1).forEach((a, k) => {
              expect(a.by!.amount).toBe(ref.slides[k]!.amount);
              expect(a.by!.rule).toBe(ref.slides[k]!.rule);
            });
          }
          // Comparisons run from the right: a suffix of P, ending at the first mismatch.
          for (const a of s.attempts) {
            const first = a.cells.findIndex((c) => c !== null);
            if (first < 0) continue;
            expect(a.cells.slice(first).every((c) => c !== null)).toBe(true);
            expect(a.cells.slice(first + 1).every((c) => c === 'match')).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('builds the tables alone and keeps them for a new text', () => {
    const t = run([['tables'], ['tables'], ['load', 'GABABACABABACG / ABABAC'], ['search']]);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/^The table is already built/);
    expect(t.entries[2]!.end.pre).toEqual(t.entries[0]!.end.pre);
    expect(t.entries[3]!.steps.flatMap((s) => s.lines)).not.toContain('t.set');
  });

  it('says which rule chose a shift', () => {
    const t = run([['load', 'AAAAAAAAAAAAAAAA / BAAA'], ['next'], ['next']], 'full');
    const say = t.entries[1]!.steps.at(-1)!.say;
    expect(say).toMatch(
      /The good-suffix rule says gs\[0\] = 4\. The good-suffix rule wins: 4, so s = 4\./,
    );
    expect(t.endState().search!.attempts[1]!.by).toEqual({ amount: 4, rule: 'gs' });
  });

  it('slides Horspool by the character under the end of P', () => {
    const t = run([['load', 'ABRACADABRA / ABRAX'], ['search']]);
    const steps = t.entries[1]!.steps;
    expect(
      steps.some((s) => s.say.includes("T[4] = 'C'. 'C' is not in P[0..3], so shift['C'] = 5")),
    ).toBe(true);
    expect(t.endState().search!.comparisons).toBe(2);
  });
});

describe('Boyer-Moore practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 40 && seed < 600; seed++)
      for (const item of practiceSet(boyerMoore, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(20);
    return out;
  }
  const words = (q: PracticeQuestion) => {
    const [text, pattern] = String(q.setup[0]![1]).split(' / ');
    return [text!, pattern!] as const;
  };
  const shiftIn = (q: PracticeQuestion) => Number(/P waits at shift (\d+)/.exec(q.prompt)![1]);

  it("asks for entries of Horspool's table", () => {
    for (const q of questions('table-value')) {
      const [, pattern] = words(q);
      const c = /shift\['(.)'\]\?/.exec(q.prompt)![1]!;
      expect(q.answer).toEqual({ kind: 'number', value: refShift(pattern, c) });
    }
  });

  it('expects the shifts a plain Horspool search tries', () => {
    for (const q of questions('next-shift')) {
      const [text, pattern] = words(q);
      const { shifts } = refSearch(text, pattern, 'horspool');
      const k = shifts.indexOf(shiftIn(q));
      expect(q.setup.length - 2).toBe(k);
      expect(q.answer).toEqual({ kind: 'number', value: shifts[k + 1] });
    }
    for (const q of questions('shifts')) {
      const [text, pattern] = words(q);
      const { shifts } = refSearch(text, pattern, 'horspool');
      expect(q.answer).toEqual({ kind: 'sequence', value: shifts.map(String) });
    }
  });

  it('writes −1 with a minus sign, as the narration does', () => {
    for (const q of questions('rule')) expect(q.explain).not.toMatch(/-\d/);
  });

  it('names the rule the reference search uses', () => {
    for (const q of questions('rule')) {
      const [text, pattern] = words(q);
      const ref = refSearch(text, pattern, 'full');
      const k = ref.shifts.indexOf(shiftIn(q));
      const rule = ref.slides[k]!.rule;
      if (q.answer.kind !== 'choice') throw new Error('not a choice');
      const picked = q.answer.options[q.answer.correct]!;
      expect(picked).toBe(
        rule === 'bc'
          ? 'The bad-character rule'
          : rule === 'gs'
            ? 'The good-suffix rule'
            : 'Both give the same shift',
      );
    }
  });
});

describe('Boyer-Moore practice answers', () => {
  // A learner should not be able to guess. Over 300 seeds each rule (and the tie) is the answer
  // in at least a quarter of the questions and none in more than half; each answer is the rule
  // the reference search uses, and appears once among the options.
  it('makes both rules common answers to "Which rule decides?"', () => {
    const kind = boyerMoore.practice!.find((k) => k.id === 'rule')!;
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 300; seed++) {
      const q = kind.make(makeRng(seed));
      if (q.answer.kind !== 'choice') throw new Error('not a choice');
      const [text, pattern] = String(q.setup[0]![1]).split(' / ');
      const ref = refSearch(text!, pattern!, 'full');
      const s = Number(/P waits at shift (\d+)/.exec(q.prompt)![1]);
      const rule = ref.slides[ref.shifts.indexOf(s)]!.rule;
      const picked = q.answer.options[q.answer.correct]!;
      expect(new Set(q.answer.options).size).toBe(3);
      expect(picked).toBe(
        rule === 'bc'
          ? 'The bad-character rule'
          : rule === 'gs'
            ? 'The good-suffix rule'
            : 'Both give the same shift',
      );
      counts.set(picked, (counts.get(picked) ?? 0) + 1);
    }
    for (const n of counts.values()) {
      expect(n).toBeGreaterThanOrEqual(75);
      expect(n).toBeLessThanOrEqual(150);
    }
    expect(counts.size).toBe(3);
  });
});

describe('drawn text size', () => {
  // 16 text cells at 45 units drew labels at 7.2 px on a phone; narrower cells on a phone: 9.7.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(boyerMoore, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(boyerMoore, PHONE_STAGE).px).toBeGreaterThanOrEqual(9.5);
  });
});
