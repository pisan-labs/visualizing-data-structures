import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { backtracking, parseValues } from '.';
import type { BtSettings, Problem } from './model';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';

const settings = (problem: Problem, target = 0): BtSettings =>
  ({ ...backtracking.defaults, problem, target }) as BtSettings;

/** Plain recursive backtracking: the outputs in order, the calls made and the calls pruned. */
function reference(values: number[], problem: Problem, target = 0) {
  const out: number[][] = [];
  let calls = 0;
  let pruned = 0;
  const chosen: number[] = [];
  if (problem === 'subsets') {
    const rest = (i: number) => values.slice(i).reduce((a, b) => a + b, 0);
    const go = (i: number, sum: number) => {
      calls++;
      if (target > 0 && (sum > target || sum + rest(i) < target)) {
        pruned++;
        return;
      }
      if (i === values.length) {
        out.push([...chosen]);
        return;
      }
      chosen.push(values[i]!);
      go(i + 1, sum + values[i]!);
      chosen.pop();
      go(i + 1, sum);
    };
    go(0, 0);
  } else {
    const used = values.map(() => false);
    const go = () => {
      calls++;
      if (chosen.length === values.length) {
        out.push([...chosen]);
        return;
      }
      values.forEach((v, k) => {
        if (used[k]) return;
        used[k] = true;
        chosen.push(v);
        go();
        chosen.pop();
        used[k] = false;
      });
    };
    go();
  }
  return { out, calls, pruned };
}

const run = (values: string, s: BtSettings) =>
  new Timeline(backtracking, s, 1, [['run', values]]).entries[0]!;

describe('backtracking', () => {
  it('lists the subsets, taking before skipping', () => {
    const e = run('1 2 3', settings('subsets'));
    expect(e.end.found).toEqual([[1, 2, 3], [1, 2], [1, 3], [1], [2, 3], [2], [3], []]);
    expect(e.steps.at(-1)!.vars?.calls).toBe(15);
  });

  it('lists the permutations in order, 65 calls for four values', () => {
    expect(run('1 2 3', settings('permutations')).end.found.map((p) => p.join(''))).toEqual([
      '123',
      '132',
      '213',
      '231',
      '312',
      '321',
    ]);
    const four = run('1 2 3 4', settings('permutations'));
    expect(four.end.found).toHaveLength(24);
    expect(four.steps.at(-1)!.vars?.calls).toBe(65);
  });

  it('prunes branches that cannot reach the target, and draws what they cut off', () => {
    const e = run('4 5 6 7', settings('subsets', 9));
    expect(e.end.found).toEqual([[4, 5]]);
    expect(e.steps.at(-1)!.vars).toMatchObject({ calls: 23, pruned: 11, found: 1 });
    expect(Object.values(e.end.status).filter((v) => v === 'cut')).toHaveLength(8);
    const none = run('1 2 3', settings('subsets', 10));
    expect(none.steps.at(-1)!.vars).toMatchObject({ calls: 1, pruned: 1, found: 0 });
  });

  it('refuses values it cannot take', () => {
    const t = new Timeline(backtracking, settings('subsets'), 1, [
      ['run', '1 2 3 4 5'],
      ['run', '0 1'],
      ['load', '7 8'],
    ]);
    expect(t.entries[0]!.steps).toHaveLength(1);
    expect(t.entries[1]!.steps).toHaveLength(1);
    expect(t.endState().values).toEqual([7, 8]);
    expect(parseValues(' 1, 2 ')).toBe('1 2');
    expect(parseValues('10')).toBeInstanceOf(Error);
  });

  it('matches plain recursive backtracking, with a sound partial solution at every step', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 9 }), { minLength: 1, maxLength: 4 }),
        fc.constantFrom<Problem>('subsets', 'permutations'),
        fc.integer({ min: 0, max: 20 }),
        (values, problem, target) => {
          const st = settings(problem, target);
          const e = run(values.join(' '), st);
          const want = reference(values, problem, problem === 'subsets' ? target : 0);
          expect(e.end.found).toEqual(want.out);
          expect(e.steps.at(-1)!.vars?.calls).toBe(want.calls);
          if (problem === 'subsets' && target > 0) {
            expect(e.steps.at(-1)!.vars?.pruned).toBe(want.pruned);
            for (const f of e.end.found) expect(f.reduce((a, b) => a + b, 0)).toBe(target);
          }
          for (const step of e.steps) {
            const s = step.state;
            // The stack is one path down the tree, and chosen is the path's partial solution.
            s.stack.forEach((id, j) => {
              expect(s.nodes[id - 1]!.parent).toBe(j === 0 ? null : s.stack[j - 1]);
            });
            const top = s.stack.at(-1);
            if (top !== undefined) expect(s.chosen).toEqual(s.nodes[top - 1]!.chosen);
            // Outputs come in the reference's order.
            expect(s.found).toEqual(want.out.slice(0, s.found.length));
            // A dashed call is always below a pruned one.
            for (const [id, v] of Object.entries(s.status)) {
              if (v !== 'cut') continue;
              let p = s.nodes[Number(id) - 1]!.parent;
              while (p !== null && s.nodes[p - 1]!.kind !== 'pruned') p = s.nodes[p - 1]!.parent;
              expect(p).not.toBeNull();
            }
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('writes driver input that the code tabs can run', () => {
    expect(
      backtracking.code!.script(
        [
          ['run', '1 2'],
          ['run', 'nope'],
          ['load', '3'],
        ],
        settings('subsets'),
      ),
    ).toEqual({ input: ['subsets 1 2'], expected: ['[1,2] [1] [2] []'] });
    expect(backtracking.code!.script([['run', '1 2 3']], settings('subsets', 10))).toEqual({
      input: ['target 10 1 2 3'],
      expected: [''],
    });
  });
});

describe('backtracking practice', () => {
  const kinds = backtracking.practice!;

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual([
      'nth-permutation',
      'subset-calls',
      'target-count',
      'pruned-count',
    ]);
  });

  it('gets every answer right, checked against the reference', () => {
    for (let seed = 1; seed <= 80; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const values = String(q.watch![0]![1]).split(' ').map(Number);
        const target = Number(q.settings!.target ?? 0);
        const problem = q.settings!.problem as Problem;
        const want = reference(values, problem, target);
        const a = q.answer;
        if (k.id === 'nth-permutation') {
          if (a.kind !== 'choice') throw new Error('nth-permutation is a choice');
          const nth = Number(/output (\d+)/.exec(q.prompt)![1]);
          expect(a.options[a.correct]).toBe(`[${want.out[nth - 1]!.join(', ')}]`);
        } else if (k.id === 'subset-calls') {
          expect(a).toEqual({ kind: 'number', value: 2 ** (values.length + 1) - 1 });
        } else if (k.id === 'target-count') {
          expect(a).toEqual({ kind: 'number', value: want.out.length });
          expect(want.out.length).toBeGreaterThan(0);
        } else {
          expect(a).toEqual({ kind: 'number', value: want.pruned });
        }
      }
    }
  });
});

describe('drawn text size', () => {
  // The 65 calls of four permutations drew at 4 px on a phone growing down, and at 7.3 growing
  // right; with lower rows, the title on two lines and the panel's names above its rows, at 9.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(backtracking, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(backtracking, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
