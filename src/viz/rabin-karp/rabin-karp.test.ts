import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeQuestion } from '../../engine/types';
import { checkMatchTimeline, inputArb, refMatches } from '../_strings/check';
import { loadCall } from '../_strings/kit';
import { rabinKarp } from '.';
import type { Radix, RkSettings } from './model';

const run = (ops: OpCall[], settings: Partial<RkSettings> = {}) =>
  new Timeline(rabinKarp, { ...rabinKarp.defaults, ...settings } as RkSettings, 1, ops);

/** The hash of a string from its definition: its value in radix d, mod q, with big integers. */
function refHash(s: string, d: number, q: number): number {
  let v = 0n;
  for (const c of s) v = v * BigInt(d) + BigInt(d === 10 ? Number(c) : c.charCodeAt(0));
  return Number(v % BigInt(q));
}

const digitsArb = fc.record({
  text: fc.string({ unit: fc.constantFrom(...'0123'), minLength: 1, maxLength: 16 }),
  pattern: fc.string({ unit: fc.constantFrom(...'0123'), minLength: 1, maxLength: 4 }),
});

describe('Rabin-Karp', { timeout: 60_000 }, () => {
  it('hashes every window right, checks only the hits, and finds what indexOf finds', () => {
    fc.assert(
      fc.property(
        fc.oneof(digitsArb, inputArb('AB', 16, 4), inputArb('ABC', 20, 6)),
        fc.constantFrom<Radix>('auto', '256'),
        fc.constantFrom(2, 3, 7, 13, 101, 997),
        ({ text, pattern }, radix, q) => {
          const t = run([loadCall(text, pattern), ['search']], { radix, q });
          checkMatchTimeline(t);
          const end = t.endState();
          const s = end.search!;
          const truth = refMatches(text, pattern);
          expect(s.found).toEqual(truth);
          if (pattern.length > text.length) return;
          const d = radix === 'auto' && /^[0-9]+$/.test(text + pattern) ? 10 : 256;
          const hs = s.hashing!;
          expect(hs.d).toBe(d);
          expect(hs.p).toBe(refHash(pattern, d, q));
          const m = pattern.length;
          let comparisons = 0;
          const spurious: number[] = [];
          s.attempts.forEach((a) => {
            const window = text.slice(a.s, a.s + m);
            const h = refHash(window, d, q);
            expect(hs.values[a.s], `t at shift ${a.s}`).toBe(h);
            expect(a.hash).toBe(h);
            if (h !== hs.p) expect(a.end).toBe('miss');
            else {
              expect(a.end).toBe(window === pattern ? 'match' : 'spurious');
              if (window !== pattern) spurious.push(a.s);
              let j = 0;
              while (j < m && text[a.s + j] === pattern[j]) j++;
              comparisons += Math.min(m, j + 1);
            }
          });
          expect(s.attempts.map((a) => a.s)).toEqual(
            Array.from({ length: text.length - m + 1 }, (_, k) => k),
          );
          expect(hs.spurious).toEqual(spurious);
          expect(s.comparisons).toBe(comparisons);
          // Every step's window hashes are right, and none appears before its window is rolled.
          for (let k = 0; k < t.length; k++) {
            const st = t.at(k).step.state.search;
            st?.hashing?.values.forEach((v, w) => {
              if (v !== null) expect(v).toBe(refHash(text.slice(w, w + m), d, q));
            });
            const cur = st?.live?.s ?? st?.next?.s;
            if (cur !== undefined && st?.hashing)
              expect(st.hashing.values.slice(cur + 1).every((v) => v === null)).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('refuses d = 10 on letters, says why, and changes nothing', () => {
    const t = run([['search']], { radix: '10' });
    const e = t.entries[0]!;
    expect(e.end).toBe(t.initial.state);
    expect(e.steps.at(-1)!.say).toMatch(/^With d = 10, each character is a decimal digit/);
    const digits = run([['load', '31415926535897932384 / 2653'], ['search']], { radix: '10' });
    expect(digits.endState().search!.found).toEqual([6]);
  });

  it('narrates a roll with the real numbers', () => {
    const t = run([['load', '31415926535897932384 / 2653'], ['next']]);
    const say = t.entries[1]!.steps.at(-1)!.say;
    expect(say).toBe(
      't₀ = 8 ≠ p = 1, so P cannot be at shift 0, and no character is compared. Roll the hash to the next window: drop T[0] = 3, bring in T[4] = 5. t₁ = (10 × (8 − 3 × 12) + 5) mod 13 = (10 × −28 + 5) mod 13 = −275 mod 13 = 11.',
    );
  });
});

describe('Rabin-Karp practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 40 && seed < 600; seed++)
      for (const item of practiceSet(rabinKarp, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(20);
    return out;
  }
  const words = (q: PracticeQuestion) => {
    const [text, pattern] = String(q.setup[0]![1]).split(' / ');
    return [text!, pattern!] as const;
  };
  const modOf = (q: PracticeQuestion) => Number(q.settings!.q);

  it('expects p = P mod q', () => {
    for (const q of questions('pattern-hash')) {
      const [, pattern] = words(q);
      expect(q.answer).toEqual({ kind: 'number', value: Number(pattern) % modOf(q) });
    }
  });

  it('expects the next window mod q after a roll', () => {
    for (const q of questions('roll')) {
      const [text, pattern] = words(q);
      const k = q.setup.length - 1;
      const next = text.slice(k + 1, k + 1 + pattern.length);
      expect(q.prompt).toContain(`the next window, ${next}?`);
      expect(q.answer).toEqual({ kind: 'number', value: Number(next) % modOf(q) });
    }
  });

  it('tells real matches from spurious hits like the reference', () => {
    for (const q of questions('spurious')) {
      const [text, pattern] = words(q);
      const k = q.setup.length - 1;
      const window = text.slice(k, k + pattern.length);
      expect(Number(window) % modOf(q)).toBe(Number(pattern) % modOf(q));
      if (q.answer.kind !== 'choice') throw new Error('not a choice');
      expect(q.answer.options[q.answer.correct]).toBe(
        window === pattern ? 'A real match' : 'A spurious hit',
      );
    }
  });

  it('explains in plain grammar, with minus signs', () => {
    for (const q of questions('count')) expect(q.explain).not.toMatch(/shift \d+,/);
    for (const q of questions('roll')) expect(q.explain).not.toMatch(/-\d/);
  });

  it('counts the spurious hits like the reference', () => {
    for (const q of questions('count')) {
      const [text, pattern] = words(q);
      const m = pattern.length;
      let count = 0;
      for (let s = 0; s + m <= text.length; s++) {
        const w = text.slice(s, s + m);
        if (w !== pattern && Number(w) % modOf(q) === Number(pattern) % modOf(q)) count++;
      }
      expect(q.answer).toEqual({ kind: 'number', value: count });
    }
  });
});

describe('drawn text size', () => {
  // Labels were 7.2 px on a phone; narrower cells and two staggered hash lanes: 11.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(rabinKarp, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(rabinKarp, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
