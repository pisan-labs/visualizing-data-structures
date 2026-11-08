import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeQuestion } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { dpPalindrome } from '.';
import type { PalSettings } from './model';

/** The reference: LCS of s[i..j] and its reverse, the classic equivalence. */
function lcs(x: string, y: string): number {
  const c = Array.from({ length: x.length + 1 }, () => Array<number>(y.length + 1).fill(0));
  for (let i = 1; i <= x.length; i++)
    for (let j = 1; j <= y.length; j++)
      c[i]![j] =
        x[i - 1] === y[j - 1] ? c[i - 1]![j - 1]! + 1 : Math.max(c[i - 1]![j]!, c[i]![j - 1]!);
  return c[x.length]![y.length]!;
}
const ref = (s: string, i: number, j: number) => {
  const piece = s.slice(i, j + 1);
  return lcs(piece, [...piece].reverse().join(''));
};

const run = (ops: OpCall[], tie: PalSettings['tie'] = 'down') =>
  new Timeline(dpPalindrome, { tie }, 1, ops);

describe('longest palindromic subsequence', { timeout: 60_000 }, () => {
  it('fills every cell like LCS with the reverse and walks back to a palindrome', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[ABC]{1,10}$/),
        fc.constantFrom<PalSettings['tie']>('down', 'left'),
        fc.integer({ min: 0, max: 3 }),
        (w, tie, diags) => {
          const t = run(
            [
              ['load', w],
              ...Array.from({ length: diags }, () => ['diagonal'] as OpCall),
              ['fill'],
              ['trace'],
            ],
            tie,
          );
          for (let k = 0; k < t.length; k++) {
            const { step } = t.at(k);
            if (step.state.s !== w) continue;
            step.state.L.forEach((r, i) =>
              r.forEach((v, j) => {
                if (j < i) expect(v).toBeNull();
                else if (v !== null) {
                  expect(v, `L[${i}][${j}]`).toBe(ref(w, i, j));
                  // Filled by length: everything shorter is there.
                  if (j > i) expect(step.state.L[i + 1]![j]).not.toBeNull();
                }
              }),
            );
          }
          const end = t.entries.at(-1)!.steps.at(-1)!;
          const pal = String(end.vars?.palindrome);
          expect(pal.length).toBe(ref(w, 0, w.length - 1));
          expect([...pal].reverse().join('')).toBe(pal);
          let at = 0;
          for (const ch of pal) {
            while (at < w.length && w[at] !== ch) at++;
            expect(at).toBeLessThan(w.length);
            at++;
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('finds BACBCAB, or BABCBAB going left on ties', () => {
    const d = run([['load', 'BBABCBCAB'], ['fill'], ['trace']])
      .entries.at(-1)!
      .steps.at(-1)!;
    expect(d.vars).toMatchObject({ length: 7, palindrome: 'BACBCAB' });
    const l = run([['load', 'BBABCBCAB'], ['fill'], ['trace']], 'left')
      .entries.at(-1)!
      .steps.at(-1)!;
    expect(l.vars).toMatchObject({ length: 7, palindrome: 'BABCBAB' });
  });

  it('refuses what it cannot use', () => {
    const t = run([['load', 'TOOLONGSTRING'], ['load', 'a-b'], ['trace']]);
    for (const e of t.entries) expect(e.end).toBe(t.initial.state);
    expect(t.entries.at(-1)!.steps[0]!.say).toMatch(/^Fill the table first/);
  });
});

describe('longest palindromic subsequence practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 20 && seed < 400; seed++)
      for (const item of practiceSet(dpPalindrome, seed, 3))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(5);
    return out;
  }
  it('expects the reference lengths', () => {
    for (const q of questions('cell')) {
      const w = String(q.setup[0]![1]);
      const [, i, j] = /L\[(\d+)\]\[(\d+)\]/.exec(q.prompt)!.map(Number);
      expect(q.answer).toEqual({ kind: 'number', value: ref(w, i! - 1, j! - 1) });
    }
    for (const q of questions('length')) {
      const w = String(q.setup[0]![1]);
      expect(q.answer).toEqual({ kind: 'number', value: ref(w, 0, w.length - 1) });
    }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(dpPalindrome, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(dpPalindrome, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
