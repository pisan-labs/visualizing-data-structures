import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeQuestion } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { manacher } from '.';
import {
  MAX_N,
  palindromeOf,
  refLongest,
  refRadii,
  transform,
  type ManacherSettings,
} from './model';

const run = (ops: OpCall[], method: ManacherSettings['method'] = 'mirror') =>
  new Timeline(manacher, { method }, 1, ops);

/** Textbook Manacher, counting comparisons the same way. */
function refManacher(s: string) {
  const t = transform(s);
  const n = t.length;
  const p = Array<number>(n).fill(0);
  let c = 0;
  let r = 0;
  let comparisons = 0;
  for (let i = 0; i < n; i++) {
    if (i < r) p[i] = Math.min(r - i, p[2 * c - i]!);
    while (i - p[i]! - 1 >= 0 && i + p[i]! + 1 < n) {
      comparisons++;
      if (t[i - p[i]! - 1] !== t[i + p[i]! + 1]) break;
      p[i]!++;
    }
    if (i + p[i]! > r) {
      c = i;
      r = i + p[i]!;
    }
  }
  return { p, comparisons };
}

const isPal = (w: string) => w === [...w].reverse().join('');

describe('Manacher', { timeout: 60_000 }, () => {
  it('finds every radius and the longest palindrome, with C and R a real palindrome on every step', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom('a', 'b', 'c'), minLength: 1, maxLength: MAX_N }),
        fc.constantFrom('mirror' as const, 'naive' as const),
        (s, method) => {
          const t = run([['load', s], ['build']], method);
          const truth = refRadii(s);
          for (let k = 0; k < t.length; k++) {
            const st = t.at(k).step.state;
            if (st.s !== s || st.i < 0) continue;
            st.p.forEach((v, i) => {
              if (v === null) return;
              if (i < st.i) expect(v, `P[${i}]`).toBe(truth[i]);
              else expect(v).toBeLessThanOrEqual(truth[i]!);
            });
            if (method === 'mirror' && st.r > 0) {
              expect(st.r - st.c).toBe(truth[st.c]);
              expect(isPal(st.t.slice(2 * st.c - st.r, st.r + 1))).toBe(true);
            }
          }
          const end = t.endState();
          expect(end.p).toEqual(truth);
          expect(palindromeOf(s, end.best)).toBe(refLongest(s));
          if (method === 'mirror') {
            expect(end.comparisons).toBe(refManacher(s).comparisons);
            expect(end.comparisons).toBeLessThan(2 * end.t.length);
          } else {
            const N = end.t.length;
            const naive = truth.reduce(
              (a, v, i) => a + v + (i - v - 1 >= 0 && i + v + 1 < N ? 1 : 0),
              0,
            );
            expect(end.comparisons).toBe(naive);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('copies a radius from the mirror', () => {
    const t = run([['load', 'abacabad'], ['build']]);
    const copy = t.entries[1]!.steps.filter((s) => s.lines.includes('copy'));
    expect(copy.length).toBeGreaterThan(3);
    expect(copy[0]!.extra?.copy).toBeDefined();
    expect(t.endState().best).toEqual({ center: 7, radius: 7 });
  });

  it('says the comparison after a radius that fits inside R only confirms it', () => {
    const steps = run([['load', 'abacabad'], ['build']]).entries[1]!.steps;
    let seen = 0;
    steps.forEach((s, n) => {
      if (!s.say.includes('fits inside')) return;
      seen++;
      expect(s.say).toMatch(/the next comparison only confirms it/);
      expect(s.say).not.toMatch(/for sure/);
      expect(steps[n + 1]!.say).toMatch(/they differ/);
    });
    expect(seen).toBeGreaterThan(0);
  });

  it('goes one center at a time and explains input it cannot use', () => {
    const t = run([['load', 'aba'], ['next'], ['next'], ['load', 'a b'], ['load', 'abcdefghijk']]);
    expect(t.entries[1]!.end.p).toEqual([0, null, null, null, null, null, null]);
    expect(t.entries[2]!.end.p.slice(0, 2)).toEqual([0, 1]);
    expect(t.entries[3]!.steps[0]!.say).toMatch(/one word/);
    expect(t.entries[4]!.steps[0]!.say).toMatch(/11 characters/);
  });
});

describe('Manacher practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 30 && seed < 400; seed++)
      for (const item of practiceSet(manacher, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(15);
    return out;
  }
  const s = (q: PracticeQuestion) => String(q.setup[0]![1]);

  it('expects the longest palindrome and true radii', () => {
    for (const q of questions('longest')) {
      const a = q.answer;
      expect(a.kind).toBe('choice');
      if (a.kind === 'choice') expect(a.options[a.correct]).toBe(refLongest(s(q)));
    }
    for (const q of questions('radius')) {
      const k = Number(/What is P\[(\d+)\]/.exec(q.prompt)![1]);
      expect(q.answer).toEqual({ kind: 'number', value: refRadii(s(q))[k] });
    }
  });

  it('counts the comparisons of the textbook code', () => {
    for (const q of questions('comparisons'))
      expect(q.answer).toEqual({ kind: 'number', value: refManacher(s(q)).comparisons });
  });

  it('asks for what the mirror gives', () => {
    for (const q of questions('mirror-start')) {
      const [, i, c, r] = /up to P\[(\d+)\], C = (\d+) and R = (\d+)/.exec(q.prompt)!.map(Number);
      const p = refRadii(s(q));
      const at = i! + 1;
      expect(q.answer).toEqual({ kind: 'number', value: Math.min(r! - at, p[2 * c! - at]!) });
    }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(manacher, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(manacher, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
