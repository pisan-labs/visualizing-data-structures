import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeQuestion } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { dpLis, parseSequence } from '.';
import type { LisSettings } from './model';

/** The reference: the longest strictly increasing run ending at each position, by recursion. */
function refL(a: number[]): number[] {
  const memo: number[] = [];
  const L = (i: number): number => {
    if (memo[i] === undefined) {
      let best = 1;
      for (let j = 0; j < i; j++) if (a[j]! < a[i]!) best = Math.max(best, L(j) + 1);
      memo[i] = best;
    }
    return memo[i]!;
  };
  return a.map((_, i) => L(i));
}

const run = (ops: OpCall[], method: LisSettings['method']) =>
  new Timeline(dpLis, { method }, 1, ops);

describe('longest increasing subsequence', { timeout: 60_000 }, () => {
  it('fills L like the reference, keeps tails sorted and reads off a longest run', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 99 }), { minLength: 1, maxLength: 12 }),
        fc.constantFrom<LisSettings['method']>('quadratic', 'tails'),
        (a, method) => {
          const t = run([['values', a.join(' ')], ['fill'], ['trace']], method);
          const ref = refL(a);
          for (let k = 0; k < t.length; k++) {
            const { step } = t.at(k);
            if (step.state.a.join() !== a.join()) continue;
            step.state.L.forEach((v, i) => {
              if (v === null) return;
              const p = step.state.P[i]!;
              // Fully known once an index is done; while filling it only grows towards ref.
              expect(v).toBeLessThanOrEqual(ref[i]!);
              if (p >= 0) {
                expect(a[p]!).toBeLessThan(a[i]!);
                expect(p).toBeLessThan(i);
              }
            });
            const tails = step.state.tails.map((i) => a[i]!);
            for (let q = 1; q < tails.length; q++) expect(tails[q]!).toBeGreaterThan(tails[q - 1]!);
          }
          const filled = t.entries[1]!.end;
          expect(filled.L).toEqual(ref);
          const end = t.entries.at(-1)!.steps.at(-1)!;
          const best = Math.max(...ref);
          expect(end.vars?.length).toBe(best);
          const lis = String(end.vars?.lis).split(' ').map(Number);
          expect(lis).toHaveLength(best);
          for (let q = 1; q < lis.length; q++) expect(lis[q]!).toBeGreaterThan(lis[q - 1]!);
          let at = 0;
          for (const v of lis) {
            while (at < a.length && a[at] !== v) at++;
            expect(at).toBeLessThan(a.length);
            at++;
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('finds 2 3 6 9 with the table and 2 3 6 7 with tails', () => {
    const q = run([['values', '5 2 8 6 3 6 9 7'], ['fill'], ['trace']], 'quadratic');
    expect(q.entries.at(-1)!.steps.at(-1)!.vars).toMatchObject({ lis: '2 3 6 9', length: 4 });
    const p = run([['values', '5 2 8 6 3 6 9 7'], ['fill'], ['trace']], 'tails');
    expect(p.entries.at(-1)!.steps.at(-1)!.vars).toMatchObject({ lis: '2 3 6 7', length: 4 });
  });

  it('counts n(n − 1)/2 comparisons with the table', () => {
    const end = run([['values', '1 2 3 4 5 6 7 8 9 10 11 12'], ['fill']], 'quadratic')
      .entries.at(-1)!
      .steps.at(-1)!;
    expect(end.vars?.comparisons).toBe(66);
  });

  it('reads sequences, and refuses what it cannot use', () => {
    expect(parseSequence('5, 2 8')).toBe('5 2 8');
    expect(parseSequence('5 x')).toBeInstanceOf(Error);
    expect(parseSequence('100')).toBeInstanceOf(Error);
    const t = run([['values', 'cat'], ['values', -1], ['trace']], 'quadratic');
    for (const e of t.entries) expect(e.end).toBe(t.initial.state);
    expect(t.entries.at(-1)!.steps[0]!.say).toMatch(/^Fill the table first/);
  });
});

describe('longest increasing subsequence practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 20 && seed < 400; seed++)
      for (const item of practiceSet(dpLis, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(5);
    return out;
  }
  const seqOf = (q: PracticeQuestion) => String(q.setup[0]![1]).split(' ').map(Number);

  it('expects the reference lengths', () => {
    for (const q of questions('cell')) {
      const i = Number(/What is L\[(\d+)\]/.exec(q.prompt)![1]);
      expect(q.answer).toEqual({ kind: 'number', value: refL(seqOf(q))[i - 1] });
    }
    for (const q of questions('length'))
      expect(q.answer).toEqual({ kind: 'number', value: Math.max(...refL(seqOf(q))) });
  });

  it('expects tails as patience sorting builds it', () => {
    for (const q of questions('tails')) {
      const a = seqOf(q);
      const k = Number(/after the first (\d+) values/.exec(q.prompt)![1]);
      const tails: number[] = [];
      for (const x of a.slice(0, k)) {
        const pos = tails.findIndex((t) => t >= x);
        if (pos < 0) tails.push(x);
        else tails[pos] = x;
      }
      expect(q.answer).toEqual({ kind: 'sequence', value: tails.map(String) });
    }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(dpLis, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(dpLis, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
