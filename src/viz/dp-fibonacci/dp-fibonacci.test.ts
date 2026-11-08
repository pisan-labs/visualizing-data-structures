import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { PracticeQuestion } from '../../engine/types';
import { dpFibonacci, parseN } from '.';
import { MAX_N, type FibSettings } from './model';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';

const settings = (style: FibSettings['style'] = 'bottomup'): FibSettings => ({ style });

/** The reference: plain recursion with a memo. */
const memo = new Map<number, number>();
function ref(n: number): number {
  if (n <= 1) return n;
  if (!memo.has(n)) memo.set(n, ref(n - 1) + ref(n - 2));
  return memo.get(n)!;
}

/** The calls top-down memoFib makes, in order, and the stack at each fill. */
function referenceCalls(n: number) {
  const filled = new Set<number>();
  const order: number[] = [];
  const stacks = new Map<number, number[]>();
  const stack: number[] = [];
  let calls = 0;
  let hits = 0;
  const go = (k: number) => {
    calls++;
    stack.push(k);
    if (filled.has(k)) hits++;
    else {
      if (k >= 2) {
        go(k - 1);
        go(k - 2);
      }
      filled.add(k);
      order.push(k);
      stacks.set(k, [...stack]);
    }
    stack.pop();
  };
  go(n);
  return { order, stacks, calls, hits };
}

const run = (n: number, style: FibSettings['style']) =>
  new Timeline(dpFibonacci, settings(style), 1, [['fib', n]]).entries[0]!;

describe('Fibonacci table', { timeout: 60_000 }, () => {
  it('fills every cell with the right value, in a valid order, in both styles', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_N }),
        fc.constantFrom('bottomup' as const, 'memo' as const),
        (n, style) => {
          const e = run(n, style);
          const fills: number[] = [];
          let before = new Set<number>();
          for (const step of e.steps) {
            const F = step.state.F;
            expect(F).toHaveLength(n + 1);
            const now = new Set<number>();
            F.forEach((v, i) => {
              if (v === null) return;
              // Each filled cell equals the reference value.
              expect(v, `F[${i}]`).toBe(ref(i));
              now.add(i);
            });
            // Cells never empty out again, and at most one fills per step.
            for (const i of before) expect(now.has(i)).toBe(true);
            const added = [...now].filter((i) => !before.has(i));
            expect(added.length).toBeLessThanOrEqual(1);
            fills.push(...added);
            // A cell is filled only after the cells it reads.
            for (const i of added)
              if (i >= 2) expect(before.has(i - 1) && before.has(i - 2)).toBe(true);
            // The stack holds distinct calls, each smaller than its caller.
            const stack = step.extra?.stack ?? [];
            for (let d = 1; d < stack.length; d++) expect(stack[d]!).toBeLessThan(stack[d - 1]!);
            before = now;
          }
          const last = e.steps.at(-1)!;
          expect(last.vars?.result).toBe(ref(n));
          if (style === 'bottomup') {
            expect(fills).toEqual(Array.from({ length: n + 1 }, (_, i) => i));
            expect(last.vars?.additions).toBe(Math.max(0, n - 1));
          } else {
            const want = referenceCalls(n);
            expect(fills).toEqual(want.order);
            expect(last.vars?.calls).toBe(want.calls);
            expect(last.vars?.hits).toBe(want.hits);
            if (n >= 1) expect(last.vars?.calls).toBe(2 * n - 1);
          }
        },
      ),
      { numRuns: 120 },
    );
  });

  it('fills top-down in the order the calls finish: 1, 0, 2, 3, ..., n', () => {
    const fills = run(6, 'memo')
      .steps.filter((s) => s.level === 1 && s.extra?.at !== undefined)
      .map((s) => s.extra!.at);
    expect(fills).toEqual([1, 0, 2, 3, 4, 5, 6]);
  });

  it('leaves the table alone for an n it cannot draw', () => {
    for (const bad of [-1, 16, 'cat', '3 4', 2.5]) {
      const t = new Timeline(dpFibonacci, settings(), 1, [['fib', bad]]);
      expect(t.endState()).toEqual(t.initial.state);
      expect(t.entries[0]!.steps[0]!.say).toMatch(/^Nothing computed\./);
    }
    expect(parseN('12')).toBe(12);
    expect(parseN('16')).toBeInstanceOf(Error);
    expect(parseN('x')).toBeInstanceOf(Error);
  });

  it('follows the style in its pseudocode', () => {
    const text = (style: FibSettings['style']) =>
      dpFibonacci.pseudocode(settings(style))[0]!.lines.map((l) => l.text);
    expect(text('bottomup')).toContain('F[i] = F[i - 1] + F[i - 2]');
    expect(text('memo')).toContain('if memo[k] != NIL');
  });

  it('states numbers in its examples that the model produces', () => {
    expect(run(9, 'memo').steps.at(-1)!.vars).toMatchObject({ calls: 17, hits: 7 });
    expect(run(15, 'bottomup').steps.at(-1)!.vars).toMatchObject({ result: 610, additions: 14 });
    expect(run(10, 'bottomup').steps.at(-1)!.vars).toMatchObject({ additions: 9 });
  });
});

describe('Fibonacci practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 30 && seed < 500; seed++)
      for (const item of practiceSet(dpFibonacci, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(10);
    return out;
  }
  const arg = (q: PracticeQuestion) => Number(q.watch![0]![1]);

  it('asks for a later value and expects the reference value', () => {
    for (const q of questions('next-value')) {
      const k = arg(q);
      expect(Number(q.setup[0]![1])).toBeLessThan(k);
      expect(q.answer).toEqual({ kind: 'number', value: ref(k) });
    }
  });

  it('expects the order the reference recursion fills the memo', () => {
    for (const q of questions('memo-order')) {
      const want = referenceCalls(arg(q)).order.map(String);
      expect(q.answer).toEqual({ kind: 'sequence', value: want });
    }
  });

  it('expects the stack the reference recursion has at each fill', () => {
    for (const q of questions('stack')) {
      const t = Number(/F\[(\d+)\] was stored/.exec(q.prompt)![1]);
      const want = referenceCalls(arg(q)).stacks.get(t)!.map(String);
      expect(q.answer).toEqual({ kind: 'sequence', value: want });
    }
  });

  it('counts calls and memo hits like the reference', () => {
    for (const q of questions('calls')) {
      const { calls, hits } = referenceCalls(arg(q));
      const want = q.prompt.includes('already in the memo') ? hits : calls;
      expect(q.answer).toEqual({ kind: 'number', value: want });
    }
  });
});

describe('drawn text size', () => {
  // The memo row drew at 8.4 px on a phone; with the narrowest cells, at 11.5.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(dpFibonacci, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(dpFibonacci, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
