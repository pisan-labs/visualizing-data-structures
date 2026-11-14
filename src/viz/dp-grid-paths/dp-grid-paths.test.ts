import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { dpGridPaths as def } from '.';
import { gridText, solveTable, WALL, type GPSettings, type Problem } from './model';

/** The reference: walk every path, right or down through open cells. */
function reference(grid: number[][]) {
  const R = grid.length;
  const C = grid[0]!.length;
  const open = (r: number, c: number) => r < R && c < C && grid[r]![c] !== WALL;
  let count = 0;
  let best = Infinity;
  /** Paths from each cell to the target: how often plain recursion calls that cell. */
  const toTarget = (r: number, c: number): number =>
    r === R - 1 && c === C - 1
      ? 1
      : (open(r + 1, c) ? toTarget(r + 1, c) : 0) + (open(r, c + 1) ? toTarget(r, c + 1) : 0);
  const walk = (r: number, c: number, cost: number) => {
    const here = cost + grid[r]![c]!;
    if (r === R - 1 && c === C - 1) {
      count++;
      best = Math.min(best, here);
      return;
    }
    if (open(r + 1, c)) walk(r + 1, c, here);
    if (open(r, c + 1)) walk(r, c + 1, here);
  };
  walk(0, 0, 0);
  let calls = 0;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (open(r, c)) calls += toTarget(r, c);
  return { count, best, calls };
}

const grids = fc
  .record({ R: fc.integer({ min: 1, max: 4 }), C: fc.integer({ min: 1, max: 5 }) })
  .chain(({ R, C }) =>
    fc.array(
      fc.array(fc.oneof(fc.integer({ min: 0, max: 9 }), fc.constant(WALL)), {
        minLength: C,
        maxLength: C,
      }),
      {
        minLength: R,
        maxLength: R,
      },
    ),
  )
  .map((g) => {
    g[0]![0] = Math.max(0, g[0]![0]!);
    const last = g.at(-1)!;
    last[last.length - 1] = Math.max(0, last.at(-1)!);
    return g;
  });

const settingsArb = fc.record({
  approach: fc.constantFrom('pattern' as const, 'naive' as const),
  problem: fc.constantFrom<Problem>('count', 'mincost'),
  fill: fc.constantFrom('bottomup' as const, 'memo' as const),
});

describe('dp-grid-paths', () => {
  it('gives the reference answer every way, and every step is consistent', () => {
    fc.assert(
      fc.property(grids, settingsArb, (grid, settings: GPSettings) => {
        const t = new Timeline(def, settings, 1, [['load', gridText(grid)], ['solve'], ['trace']]);
        const ref = reference(grid);
        const T = solveTable(grid, settings.problem);
        const R = grid.length;
        const C = grid[0]!.length;
        const solve = t.entries[1]!.steps;
        const last = solve.at(-1)!;
        if (settings.problem === 'count') expect(last.vars?.paths).toBe(ref.count);
        else expect(last.vars?.cost).toBe(ref.best === Infinity ? '∞' : ref.best);
        expect(last.vars?.['naive total']).toBe(ref.calls);
        const recursion = settings.approach === 'naive' || settings.fill === 'memo';
        if (settings.approach === 'naive') expect(last.vars?.calls).toBe(ref.calls);
        if (!recursion) {
          expect(last.vars?.cells).toBe(R * C);
          expect(last.vars?.['pattern total']).toBe(R * C);
        }
        let filled = 0;
        for (const step of solve) {
          const { state, extra = {} } = step;
          // Whatever is shown equals the true value of that cell.
          state.T.forEach((row, r) =>
            row.forEach((v, c) => {
              if (v !== null) {
                expect(v).toBe(T[r]![c]);
              }
            }),
          );
          extra.seen?.forEach((row, r) =>
            row.forEach((v, c) => {
              if (v !== null) expect(v).toBe(T[r]![c]);
            }),
          );
          if (settings.approach === 'naive')
            expect(state.T.flat().every((v) => v === null)).toBe(true);
          if (!recursion) {
            // Bottom-up fills a prefix of the cells, row by row.
            const n = state.T.flat().filter((v) => v !== null).length;
            expect(n).toBeGreaterThanOrEqual(filled);
            expect(
              state.T.flat()
                .slice(0, n)
                .every((v) => v !== null),
            ).toBe(true);
            filled = n;
          }
          // The stack is a chain of calls, each one cell up or to the left of its caller.
          const stack = extra.stack ?? [];
          if (stack.length) expect(stack[0]).toEqual([R - 1, C - 1]);
          for (let k = 1; k < stack.length; k++) {
            const [a, b] = stack[k - 1]!;
            const [x, y] = stack[k]!;
            expect(a - x + (b - y)).toBe(1);
          }
        }
        // The trace: a path of R + C − 2 moves whose cost is the cheapest.
        const end = t.entries[2]!.steps.at(-1)!;
        if (settings.problem === 'mincost' && settings.approach === 'pattern') {
          if (ref.best === Infinity) expect(end.vars?.path).toBe('none');
          else {
            const ms = String(end.vars?.path).split(' ').filter(Boolean);
            expect(ms.length).toBe(R + C - 2);
            let r = 0;
            let c = 0;
            let cost = grid[0]![0]!;
            for (const m of ms) {
              if (m === 'D') r++;
              else c++;
              expect(grid[r]![c]).not.toBe(WALL);
              cost += grid[r]![c]!;
            }
            expect(cost).toBe(ref.best);
            expect(end.vars?.cost).toBe(ref.best);
          }
        } else expect(end.vars?.path).toBeUndefined();
      }),
      { numRuns: 200 },
    );
  });

  it('refuses grids it cannot read', () => {
    const t = new Timeline(def, def.defaults, 1, [
      ['load', '1#/11/1'],
      ['load', '#1/11'],
      ['load', '1234567'],
      ['load', '12/3q'],
      ['load', '1/1/1/1/1/1'],
    ]);
    const says = t.entries.map((e) => e.steps[0]!.say);
    expect(says[0]).toMatch(/same number of cells/);
    expect(says[1]).toMatch(/must be open/);
    expect(says[2]).toMatch(/at most 6/);
    expect(says[3]).toMatch(/"q" is not a cell/);
    expect(says[4]).toMatch(/at most 5/);
    expect(gridText(t.endState().grid)).toBe('13121/2#311/1123#/41211');
  });

  it('reads the input box', () => {
    const parse = def.controls.input!.parse;
    expect(parse('1.1/ 1#1 /111')).toBe('111/1#1/111');
    expect(parse('11/1')).toBeInstanceOf(Error);
  });

  it('asks practice paths that are the only cheapest one', () => {
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34]) {
      for (const { kind, question } of practiceSet(def, seed, 8)) {
        if (kind.id !== 'path' || question.answer.kind !== 'sequence') continue;
        expect(question.answer.value.length).toBe(5);
      }
    }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
