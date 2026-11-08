import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeQuestion } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { refMatches } from '../_strings/check';
import { zAlgorithm } from '.';
import { refZ, type ZSettings } from './model';

const run = (ops: OpCall[], method: ZSettings['method'] = 'box') =>
  new Timeline(zAlgorithm, { method }, 1, ops);

/** The textbook Z-algorithm, counting comparisons the same way. */
function refBox(s: string) {
  const n = s.length;
  const z = Array<number>(n).fill(0);
  let l = 0;
  let r = 0;
  let comparisons = 0;
  for (let i = 1; i < n; i++) {
    if (i <= r) z[i] = Math.min(r - i + 1, z[i - l]!);
    while (i + z[i]! < n) {
      comparisons++;
      if (s[z[i]!] !== s[i + z[i]!]) break;
      z[i]!++;
    }
    if (i + z[i]! - 1 > r) {
      l = i;
      r = i + z[i]! - 1;
    }
  }
  return { z, comparisons };
}

const word = (letters: string, max: number) =>
  fc.string({ unit: fc.constantFrom(...letters), minLength: 1, maxLength: max });

describe('Z-algorithm', { timeout: 60_000 }, () => {
  it('fills Z by its definition, with the box never wrong and the comparisons of the textbook code', () => {
    fc.assert(
      fc.property(
        word('AB', 20),
        fc.constantFrom('box' as const, 'naive' as const),
        (s, method) => {
          const t = run([['load', s], ['build']], method);
          const truth = refZ(s);
          for (let k = 0; k < t.length; k++) {
            const st = t.at(k).step.state;
            if (st.s !== s) continue;
            // Every final value so far is right; a value in progress never overshoots.
            st.z.forEach((v, i) => {
              if (v === null || i === 0) return;
              if (i < st.i) expect(v, `Z[${i}]`).toBe(truth[i]);
              else expect(v).toBeLessThanOrEqual(truth[i]!);
            });
            // The box is a real match with the prefix.
            if (method === 'box' && st.r > 0)
              expect(s.slice(st.l, st.r + 1)).toBe(s.slice(0, st.r - st.l + 1));
          }
          const end = t.endState();
          expect(end.z.slice(1)).toEqual(truth.slice(1));
          if (method === 'box') {
            expect(end.comparisons).toBe(refBox(s).comparisons);
            expect(end.comparisons).toBeLessThan(2 * s.length);
          } else {
            const naive = truth
              .slice(1)
              .reduce((a, v, k) => a + v + (k + 1 + v < s.length ? 1 : 0), 0);
            expect(end.comparisons).toBe(naive);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('finds P in T where Z[i] = m on P$T', () => {
    fc.assert(
      fc.property(word('AB', 12), word('AB', 4), (text, pattern) => {
        fc.pre(text.length + pattern.length + 1 <= 20);
        const end = run([['load', `${text} / ${pattern}`], ['build']]).endState();
        expect(end.found).toEqual(refMatches(text, pattern));
      }),
      { numRuns: 300 },
    );
  });

  it('goes one position at a time and starts over after the end', () => {
    const t = run([['load', 'AAB'], ['next'], ['next'], ['next']]);
    expect(t.entries[1]!.end.z).toEqual([null, 1, null]);
    expect(t.entries[2]!.end.i).toBe(3);
    expect(t.entries[2]!.steps.at(-1)!.say).toMatch(/^Done\. Z = \[–, 1, 0\]/);
    expect(t.entries[3]!.end.z).toEqual([null, 1, null]);
    expect(t.entries[3]!.steps[0]!.say).toMatch(/^Start again\./);
  });

  it('copies from the box without comparing', () => {
    const t = run([['load', 'aabcaabxaaz'], ['build']]);
    const copy = t.entries[1]!.steps.find((s) => s.lines.includes('copy'))!;
    expect(copy.say).toMatch(/^i = 5 is inside the box \[4, 6\]/);
    expect(copy.extra?.copy).toEqual({ from: 1, to: 5 });
  });

  it('says the comparison after a value that fits in the box only confirms it', () => {
    const steps = run([['load', 'aabcaabxaaz'], ['build']]).entries[1]!.steps;
    let seen = 0;
    steps.forEach((s, n) => {
      if (!s.say.includes('is less than r − i + 1')) return;
      seen++;
      expect(s.say).toMatch(/the next comparison only confirms it/);
      expect(steps[n + 1]!.say).toMatch(/they differ/);
    });
    expect(seen).toBeGreaterThan(0);
  });

  it('explains input it cannot use', () => {
    const t = run([
      ['load', 'A$B / A'],
      ['load', `${'A'.repeat(15)} / ABCDE`],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/has "\$" in it/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/P\$T would have 21 characters/);
  });

  it('follows the method setting in its pseudocode', () => {
    const text = (m: ZSettings['method']) =>
      zAlgorithm.pseudocode({ method: m })[0]!.lines.map((l) => l.text);
    expect(text('box')).toContain('Z[i] = min(r − i + 1, Z[i − l])');
    expect(text('naive')).not.toContain('Z[i] = min(r − i + 1, Z[i − l])');
  });
});

describe('Z-algorithm practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 30 && seed < 400; seed++)
      for (const item of practiceSet(zAlgorithm, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(15);
    return out;
  }
  const s = (q: PracticeQuestion) => String(q.setup[0]![1]);

  it('asks for Z values that match the definition', () => {
    for (const q of questions('z-value')) {
      const k = Number(/What is Z\[(\d+)\]/.exec(q.prompt)![1]);
      expect(q.answer).toEqual({ kind: 'number', value: refZ(s(q))[k] });
    }
    for (const q of questions('z-array'))
      expect(q.answer).toEqual({ kind: 'sequence', value: refZ(s(q)).slice(1).map(String) });
  });

  it('counts the comparisons of the textbook code', () => {
    for (const q of questions('comparisons'))
      expect(q.answer).toEqual({ kind: 'number', value: refBox(s(q)).comparisons });
  });

  it('asks for the start value the box gives', () => {
    for (const q of questions('box-start')) {
      const [, l, r] = /\[l, r\] = \[(\d+), (\d+)\]/.exec(q.prompt)!.map(Number);
      const i = Number(/does Z\[(\d+)\] start/.exec(q.prompt)![1]);
      const z = refZ(s(q));
      expect(q.answer).toEqual({ kind: 'number', value: Math.min(r! - i + 1, z[i - l!]!) });
    }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(zAlgorithm, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(zAlgorithm, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
