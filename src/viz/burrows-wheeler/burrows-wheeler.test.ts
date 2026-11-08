import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeQuestion } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { burrowsWheeler } from '.';
import { MAX_N, rotation, type BwtSettings } from './model';

const run = (ops: OpCall[], end: BwtSettings['end'] = 'sentinel') =>
  new Timeline(burrowsWheeler, { end }, 1, ops);

/** The textbook transform: sort the rotations as strings, read the last characters. */
function refBwt(text: string, end: BwtSettings['end']) {
  const s = end === 'sentinel' ? `${text}$` : text;
  const rows = [...s].map((_, k) => rotation(s, k));
  const sorted = [...rows].sort();
  return {
    l: sorted.map((r) => r[r.length - 1]).join(''),
    index: end === 'index' ? sorted.indexOf(s) : null,
  };
}

/** The suffix array of s, by sorting suffixes. */
const refSa = (s: string) =>
  [...s].map((_, k) => k).sort((a, b) => (s.slice(a) < s.slice(b) ? -1 : 1));

describe('Burrows-Wheeler transform', { timeout: 60_000 }, () => {
  it('transforms by the definition and inverts back to the word, in both conventions', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom('a', 'b', 'n'), minLength: 1, maxLength: MAX_N }),
        fc.constantFrom('sentinel' as const, 'index' as const),
        (w, end) => {
          const t = run([['load', w], ['transform'], ['invert']], end);
          const ref = refBwt(w, end);
          const after = t.entries[1]!.end;
          expect(after.l).toBe(ref.l);
          expect(after.index).toBe(ref.index);
          // The rows are rotations, sorted once the sort step has run.
          for (const { step } of t.entries[1]!.steps.map((s) => ({ step: s }))) {
            const st = step.state;
            const rows = st.order.map((k) => rotation(st.s, k));
            if (st.phase === 'sorted') expect(rows).toEqual([...rows].sort());
            expect(st.l).toBe(ref.l.slice(0, st.l.length));
          }
          if (end === 'sentinel') expect(after.order).toEqual(refSa(after.s));
          // The walk recovers the word from its end, one character per step.
          for (const step of t.entries[2]!.steps) {
            const out = step.state.inv!.out;
            expect(w.endsWith(out)).toBe(true);
          }
          expect(t.endState().inv!.out).toBe(w);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('inverts without a transform first, and explains bad input', () => {
    const t = run([['load', 'abc'], ['invert'], ['load', 'a$b'], ['load', 'abcdefghijk']]);
    expect(t.entries[1]!.end.inv!.out).toBe('abc');
    expect(t.entries[2]!.steps[0]!.say).toMatch(/has "\$" in it/);
    expect(t.entries[3]!.steps[0]!.say).toMatch(/11 characters/);
  });

  it('says banana becomes annb$aa', () => {
    const t = run([['transform']]);
    expect(t.endState().l).toBe('annb$aa');
    expect(t.entries[0]!.steps.at(-1)!.say).toMatch(/^Done\. BWT\('banana'\) = 'annb\$aa'/);
  });
});

describe('Burrows-Wheeler practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 30 && seed < 400; seed++)
      for (const item of practiceSet(burrowsWheeler, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(15);
    return out;
  }
  const w = (q: PracticeQuestion) => String(q.setup[0]![1]);
  const picked = (q: PracticeQuestion) =>
    q.answer.kind === 'choice' ? q.answer.options[q.answer.correct] : undefined;

  it('agrees with the definition', () => {
    for (const q of questions('transform')) expect(picked(q)).toBe(refBwt(w(q), 'sentinel').l);
    for (const q of questions('invert')) expect(picked(q)).toBe(w(q));
    for (const q of questions('suffix-array')) {
      const r = Number(/Row (\d+)/.exec(q.prompt)![1]);
      expect(q.answer).toEqual({ kind: 'number', value: refSa(`${w(q)}$`)[r] });
    }
    for (const q of questions('lf-step')) {
      const l = refBwt(w(q), 'sentinel').l;
      const r = Number(/L\[(\d+)\]/.exec(q.prompt)![1]);
      const f = [...l].sort().join('');
      const k = [...l.slice(0, r)].filter((c) => c === l[r]).length;
      expect(q.answer).toEqual({ kind: 'number', value: f.indexOf(l[r]!) + k });
    }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(burrowsWheeler, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(burrowsWheeler, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
