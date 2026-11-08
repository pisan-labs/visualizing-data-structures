import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { fibonacciCalls } from '.';
import type { FibSettings, Memo } from './model';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';

const settings = (memo: Memo): FibSettings => ({ ...fibonacciCalls.defaults, memo }) as FibSettings;

/** A reference that counts calls the way the code does: every call, base cases included. */
function reference(n: number, memoOn: boolean) {
  const counts = new Map<number, number>();
  const memo = new Map<number, number>();
  let calls = 0;
  const fib = (k: number): number => {
    calls++;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (k <= 1) return k;
    if (memoOn && memo.has(k)) return memo.get(k)!;
    const v = fib(k - 1) + fib(k - 2);
    if (memoOn) memo.set(k, v);
    return v;
  };
  const value = fib(n);
  return { value, calls, counts };
}

describe('fibonacci-calls', () => {
  it('makes 15 calls for fib(5) and marks the repeats', () => {
    const t = new Timeline(fibonacciCalls, settings('none'), 1, [['fib', 5]]);
    const end = t.entries[0]!.steps.at(-1)!;
    expect(end.vars).toMatchObject({ result: 5, calls: 15, repeats: 3 });
    expect(end.state.counts).toEqual({ 5: 1, 4: 1, 3: 2, 2: 3, 1: 5, 0: 3 });
    // A repeat is a milestone, so coarse playback stops on it.
    const repeats = t.entries[0]!.steps.filter((s) => s.say.includes('time fib('));
    expect(repeats.map((s) => s.level)).toEqual([1, 1, 1]);
  });

  it('with the memo, makes 2n - 1 calls and cuts off the rest', () => {
    const t = new Timeline(fibonacciCalls, settings('memo'), 1, [['fib', 8]]);
    const end = t.entries[0]!.steps.at(-1)!;
    expect(end.vars).toMatchObject({ result: 21, calls: 15, hits: 5, saved: 52 });
    const cut = Object.values(end.state.status).filter((v) => v === 'cut');
    expect(cut).toHaveLength(67 - 15);
    expect(end.state.memo).toEqual({ 2: 1, 3: 2, 4: 3, 5: 5, 6: 8, 7: 13, 8: 21 });
  });

  it('refuses n outside 0 to 10', () => {
    const t = new Timeline(fibonacciCalls, settings('none'), 1, [
      ['fib', 11],
      ['fib', 'x'],
    ]);
    expect(t.entries.map((e) => e.steps.length)).toEqual([1, 1]);
    expect(t.endState().run).toBeNull();
  });

  it('matches a reference recursion, with a sound stack at every step', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Memo>('none', 'memo'),
        fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 3 }),
        (memo, ns) => {
          const t = new Timeline(
            fibonacciCalls,
            settings(memo),
            1,
            ns.map((n): OpCall => ['fib', n]),
          );
          ns.forEach((n, i) => {
            const want = reference(n, memo === 'memo');
            const steps = t.entries[i]!.steps;
            const end = steps.at(-1)!;
            expect(end.vars?.result).toBe(want.value);
            expect(end.vars?.calls).toBe(want.calls);
            expect(end.state.counts).toEqual(Object.fromEntries(want.counts));
            for (const s of steps) {
              const st = s.state;
              // The stack is one path down the tree, never deeper than n.
              st.stack.forEach((id, j) => {
                expect(st.calls[id - 1]!.parent).toBe(j === 0 ? null : st.stack[j - 1]);
                expect(st.status[id]).toBe('open');
              });
              expect(st.stack.length).toBeLessThanOrEqual(Math.max(1, n));
              expect(s.vars?.depth).toBe(st.stack.length);
              for (const [id, v] of Object.entries(st.result))
                expect(v).toBe(reference(st.calls[Number(id) - 1]!.n, false).value);
              for (const [k, v] of Object.entries(st.memo))
                expect(v).toBe(reference(Number(k), false).value);
              if (memo === 'none')
                expect(Object.values(st.status).every((x) => x !== 'cut')).toBe(true);
            }
          });
        },
      ),
      { numRuns: 120 },
    );
  });

  it('writes driver input that the code tabs can run', () => {
    expect(
      fibonacciCalls.code!.script(
        [
          ['fib', 5],
          ['fib', 42],
        ],
        settings('none'),
      ),
    ).toEqual({
      input: ['fib 5'],
      expected: ['5 15'],
    });
    expect(fibonacciCalls.code!.script([['fib', 8]], settings('memo'))).toEqual({
      input: ['memo 8'],
      expected: ['21 15'],
    });
  });
});

describe('fibonacci-calls practice', () => {
  const kinds = fibonacciCalls.practice!;
  const fibOf = (n: number) => reference(n, false).value;

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual(['count-calls', 'repeats', 'memo-calls', 'order']);
  });

  it('gets every answer right, checked against the reference', () => {
    for (let seed = 1; seed <= 80; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const n = Number(q.watch![0]![1]);
        const a = q.answer;
        if (k.id === 'count-calls') {
          expect(a).toEqual({ kind: 'number', value: 2 * fibOf(n + 1) - 1 });
        } else if (k.id === 'repeats') {
          const sub = Number(/times is `fib\((\d+)\)`/.exec(q.prompt)![1]);
          expect(a).toEqual({ kind: 'number', value: reference(n, false).counts.get(sub) });
          expect(a).toEqual({ kind: 'number', value: fibOf(n - sub + 1) });
        } else if (k.id === 'memo-calls') {
          expect(a).toEqual({ kind: 'number', value: 2 * n - 1 });
        } else {
          // Preorder of the call tree: n, then the subtree of n - 1, then that of n - 2.
          const order: string[] = [];
          const walk = (m: number) => {
            order.push(String(m));
            if (m > 1) {
              walk(m - 1);
              walk(m - 2);
            }
          };
          walk(n);
          if (a.kind !== 'sequence') throw new Error('order is a sequence');
          expect(a.value).toEqual(order.slice(0, a.value.length));
        }
      }
    }
  });
});

describe('drawn text size', () => {
  // fib(8) draws its badges at 3.9 px on a phone growing down; growing right, at 7.3.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(fibonacciCalls, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(fibonacciCalls, PHONE_STAGE).px).toBeGreaterThanOrEqual(7);
  });
});
