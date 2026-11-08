import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeQuestion } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { dpMatrixChain, parseDims } from '.';

/** The reference: the cheapest cost over every bracketing, by plain recursion. */
function brute(p: number[], i: number, j: number): number {
  if (i === j) return 0;
  let best = Infinity;
  for (let k = i; k < j; k++)
    best = Math.min(best, brute(p, i, k) + brute(p, k + 1, j) + p[i - 1]! * p[k]! * p[j]!);
  return best;
}

/** The cost of multiplying in the order a bracketing such as ((A1A2)A3) gives. */
function costOf(order: string, p: number[]): number {
  let at = 0;
  const parse = (): { rows: number; cols: number; cost: number } => {
    if (order[at] === '(') {
      at++;
      const a = parse();
      const b = parse();
      at++; // ')'
      return { rows: a.rows, cols: b.cols, cost: a.cost + b.cost + a.rows * a.cols * b.cols };
    }
    const m = /^A(\d)/.exec(order.slice(at))!;
    at += m[0].length;
    const i = Number(m[1]);
    return { rows: p[i - 1]!, cols: p[i]!, cost: 0 };
  };
  return parse().cost;
}

const run = (ops: OpCall[]) => new Timeline(dpMatrixChain, {}, 1, ops);

describe('matrix-chain order', { timeout: 60_000 }, () => {
  it('fills m like brute force, by length, and brackets the chain at that cost', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 40 }), { minLength: 2, maxLength: 7 }),
        fc.integer({ min: 0, max: 3 }),
        (p, diags) => {
          const t = run([
            ['dims', p.join(' ')],
            ...Array.from({ length: diags }, () => ['diagonal'] as OpCall),
            ['fill'],
            ['paren'],
          ]);
          for (let k = 0; k < t.length; k++) {
            const { step } = t.at(k);
            if (step.state.p.join() !== p.join()) continue;
            step.state.m.forEach((r, i) =>
              r.forEach((v, j) => {
                if (j < i) expect(v).toBeNull();
                else if (v !== null) {
                  expect(v, `m[${i + 1}][${j + 1}]`).toBe(brute(p, i + 1, j + 1));
                  if (j > i) expect(step.state.m[i + 1]![j]).not.toBeNull();
                }
              }),
            );
          }
          const end = t.entries.at(-1)!.steps.at(-1)!;
          const n = p.length - 1;
          expect(end.vars?.cost).toBe(brute(p, 1, n));
          expect(costOf(String(end.vars?.order), p)).toBe(brute(p, 1, n));
        },
      ),
      { numRuns: 120 },
    );
  });

  it('brackets the six-matrix chain at 15,125', () => {
    const end = run([['dims', '30 35 15 5 10 20 25'], ['fill'], ['paren']])
      .entries.at(-1)!
      .steps.at(-1)!;
    expect(end.vars).toMatchObject({ cost: 15125, order: '((A1(A2A3))((A4A5)A6))' });
    expect(end.say).toBe('((A₁(A₂A₃))((A₄A₅)A₆)): 15125 scalar multiplications.');
  });

  it('reads dimensions, and refuses what it cannot use', () => {
    expect(parseDims('30x35x15')).toBe('30 35 15');
    expect(parseDims('5')).toBeInstanceOf(Error);
    expect(parseDims('0 5')).toBeInstanceOf(Error);
    expect(parseDims('1 2 3 4 5 6 7 8')).toBeInstanceOf(Error);
    const t = run([['dims', 'cat'], ['dims', 41], ['paren']]);
    for (const e of t.entries) expect(e.end).toBe(t.initial.state);
    expect(t.entries.at(-1)!.steps[0]!.say).toMatch(/^Fill the tables first/);
  });
});

describe('matrix-chain order practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 20 && seed < 400; seed++)
      for (const item of practiceSet(dpMatrixChain, seed, 3))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(5);
    return out;
  }
  const dimsOf = (q: PracticeQuestion) => String(q.setup[0]![1]).split(' ').map(Number);

  it('never says "length 1 to 1"', () => {
    const qs = questions('cell');
    for (const q of qs) expect(q.prompt).not.toMatch(/length 1 to 1 /);
    expect(qs.some((q) => q.prompt.includes('Chains of length 1 are filled'))).toBe(true);
  });

  it('expects the brute-force cost and a cheapest order', () => {
    for (const q of questions('cell')) {
      const [, i, j] = /What is m\[(\d+)\]\[(\d+)\]/.exec(q.prompt)!.map(Number);
      expect(q.answer).toEqual({ kind: 'number', value: brute(dimsOf(q), i!, j!) });
    }
    for (const q of questions('order')) {
      const p = dimsOf(q);
      const order = (q.answer as { value: string[] }).value[0]!;
      expect(costOf(order, p)).toBe(brute(p, 1, p.length - 1));
    }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(dpMatrixChain, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(dpMatrixChain, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
