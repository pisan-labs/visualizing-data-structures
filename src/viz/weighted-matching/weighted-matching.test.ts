import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { parseMatrixInput, productMatrix, weightedMatching } from '.';
import { formatMatrix, parseMatrix, reduced, totalOf, type Goal, type HmSettings } from './model';

/** Reference: the best total over every permutation. */
function brute(cost: number[][], goal: Goal): number {
  const n = cost.length;
  let best = goal === 'min' ? Infinity : -Infinity;
  const used = Array(n).fill(false);
  const go = (i: number, sum: number) => {
    if (i === n) {
      best = goal === 'min' ? Math.min(best, sum) : Math.max(best, sum);
      return;
    }
    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      used[j] = true;
      go(i + 1, sum + cost[i]![j]!);
      used[j] = false;
    }
  };
  go(0, 0);
  return best;
}

const settings = (goal: Goal): HmSettings => ({ ...weightedMatching.defaults, goal });

function solve(cost: number[][], goal: Goal) {
  const t = new Timeline(weightedMatching, settings(goal), 1, [
    ['load', formatMatrix(cost)],
    ['run'],
  ]);
  return t;
}

describe('weighted matching (Hungarian)', () => {
  it('finds the cheapest assignment of the starting matrix', () => {
    const t = new Timeline(weightedMatching, settings('min'), 1, [['run']]);
    const last = t.entries[0]!.steps.at(-1)!;
    expect(last.extra!.run!.rowMate).toEqual([1, 3, 2, 0]);
    expect(last.vars!.total).toBe(9);
    expect(last.vars!.updates).toBe(2);
  });

  it('parses square matrices and rejects others', () => {
    expect(parseMatrix('1 2; 3 4')).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(parseMatrix('7')).toEqual([[7]]);
    expect(parseMatrix('1 2; 3')).toBeInstanceOf(Error);
    expect(parseMatrix('1 x; 3 4')).toBeInstanceOf(Error);
    expect(parseMatrix('')).toBeInstanceOf(Error);
    expect(parseMatrixInput('1 2 3 4 5 6 7; 1; 1; 1; 1; 1; 1')).toBeInstanceOf(Error);
  });

  it('names a 1 × 1 matrix plainly, not "rows A to A"', () => {
    const say = solve([[7]], 'min').entries[0]!.steps.at(-1)!.say;
    expect(say).toContain('row A, column 1.');
    expect(say).not.toMatch(/A to A/);
  });

  it('keeps a bad load from changing the matrix', () => {
    const t = new Timeline(weightedMatching, settings('min'), 1, [['load', 'cat']]);
    expect(t.endState()).toEqual(t.initial.state);
    expect(t.entries[0]!.steps[0]!.say).toContain('Nothing loaded');
  });

  it('needs n potential-update rounds on the product matrix, more or less', () => {
    const t = solve(productMatrix(5), 'min');
    const r = t.entries[1]!.steps.at(-1)!.extra!.run!;
    expect(totalOf(productMatrix(5), r.rowMate)).toBe(35);
    expect(r.updates).toBe(8);
  });

  it('matches brute force, with feasible potentials on every step', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }).chain((n) =>
          fc.array(fc.array(fc.integer({ min: -20, max: 40 }), { minLength: n, maxLength: n }), {
            minLength: n,
            maxLength: n,
          }),
        ),
        fc.constantFrom<Goal>('min', 'max'),
        (cost, goal) => {
          const t = solve(cost, goal);
          const steps = t.entries[1]!.steps;
          const n = cost.length;
          for (const s of steps) {
            const r = s.extra!.run!;
            // A matching: rows and columns agree.
            r.rowMate.forEach((j, i) => {
              if (j >= 0) expect(r.colMate[j]).toBe(i);
            });
            if (r.u.some((x) => x === null) || r.v.some((x) => x === null)) continue;
            for (let i = 0; i < n; i++)
              for (let j = 0; j < n; j++) {
                expect(reduced(r, i, j)).toBeGreaterThanOrEqual(0);
                if (r.rowMate[i] === j) expect(reduced(r, i, j)).toBe(0);
              }
          }
          const r = steps.at(-1)!.extra!.run!;
          expect(new Set(r.rowMate).size).toBe(n);
          expect(totalOf(cost, r.rowMate)).toBe(brute(cost, goal));
          const dual = [...r.u, ...r.v].reduce<number>((a, x) => a + x!, 0);
          expect(dual).toBe(totalOf(r.work, r.rowMate));
        },
      ),
      { numRuns: 200 },
    );
  });
});
