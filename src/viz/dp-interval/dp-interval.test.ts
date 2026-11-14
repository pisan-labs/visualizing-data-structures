import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { dpInterval as def } from '.';
import { naiveCalls, solveTable, totals, type IVSettings, type Problem } from './model';

/** The reference: try every order of taking the tiles, or every way of merging neighbours. */
function reference(v: number[], p: Problem): number {
  if (p === 'merge') {
    const go = (row: number[]): number => {
      if (row.length <= 1) return 0;
      let best = Infinity;
      for (let i = 0; i + 1 < row.length; i++) {
        const s = row[i]! + row[i + 1]!;
        best = Math.min(best, s + go([...row.slice(0, i), s, ...row.slice(i + 2)]));
      }
      return best;
    };
    return go(v);
  }
  const go = (row: number[]): number => {
    let best = 0;
    for (let i = 0; i < row.length; i++) {
      const s = (row[i - 1] ?? 1) * row[i]! * (row[i + 1] ?? 1);
      best = Math.max(best, s + go([...row.slice(0, i), ...row.slice(i + 1)]));
    }
    return best;
  };
  return go(v);
}

/** Replay an order of taking tiles (positions from 1) and add up its scores. */
function scoreOf(v: number[], order: number[]): number {
  const left = v.map((x, i) => ({ x, i: i + 1 }));
  let total = 0;
  for (const k of order) {
    const at = left.findIndex((t) => t.i === k);
    expect(at).toBeGreaterThanOrEqual(0);
    total += (left[at - 1]?.x ?? 1) * left[at]!.x * (left[at + 1]?.x ?? 1);
    left.splice(at, 1);
  }
  expect(left).toEqual([]);
  return total;
}

/** The cost of a bracketing such as ((8 6) (7 (5 3))), and its leaves in order. */
function bracketCost(text: string): { cost: number; size: number; leaves: number[] } {
  const tokens = text.match(/\(|\)|\d+/g)!;
  let pos = 0;
  const parse = (): { cost: number; size: number; leaves: number[] } => {
    const t = tokens[pos++]!;
    if (t !== '(') return { cost: 0, size: Number(t), leaves: [Number(t)] };
    const l = parse();
    const r = parse();
    pos++; // ')'
    return { cost: l.cost + r.cost + l.size + r.size, size: l.size + r.size, leaves: [...l.leaves, ...r.leaves] };
  };
  return parse();
}

const settingsArb = fc.record({
  approach: fc.constantFrom('pattern' as const, 'naive' as const),
  problem: fc.constantFrom<Problem>('remove', 'merge'),
});
const rowArb = fc.array(fc.integer({ min: 1, max: 9 }), { minLength: 1, maxLength: 5 });

describe('dp-interval', () => {
  it('gives the reference answer both ways, and every step is consistent', () => {
    fc.assert(
      fc.property(rowArb, settingsArb, (v, settings: IVSettings) => {
        const p = settings.problem;
        const n = v.length;
        const t = new Timeline(def, settings, 1, [['load', v.join(' ')], ['solve'], ['trace']]);
        const want = reference(v, p);
        const { best } = solveTable(v, p);
        const solve = t.entries[1]!.steps;
        const last = solve.at(-1)!;
        expect(last.vars?.[p === 'merge' ? 'cost' : 'score']).toBe(want);
        const tot = totals(n, p);
        expect(last.vars?.['naive total']).toBe(tot.naive);
        expect(last.vars?.['pattern total']).toBe(tot.pattern);
        if (settings.approach === 'naive') {
          expect(last.vars?.calls).toBe(naiveCalls(n, p));
          expect(Number(last.vars?.calls) + Number(last.vars?.choices)).toBe(tot.naive);
        } else {
          expect(last.vars?.cells).toBe((n * (n + 1)) / 2);
          expect(Number(last.vars?.cells) + Number(last.vars?.choices)).toBe(tot.pattern);
        }
        let longest = 0;
        for (const step of solve) {
          const shownAll = [step.state.best, step.extra?.seen ?? []];
          for (const table of shownAll)
            table.forEach((row, a) =>
              row.forEach((x, b) => {
                if (x !== null) expect(x).toBe(best[a]![b]);
              }),
            );
          if (settings.approach === 'pattern') {
            // The table fills by length: never a stretch longer than one not yet solved.
            const filled = step.state.best.flatMap((row, a) => row.flatMap((x, b) => (x === null ? [] : [b - a + 1])));
            const top = Math.max(0, ...filled);
            expect(top).toBeGreaterThanOrEqual(longest);
            longest = top;
            for (let a = 0; a + top - 2 < n && top > 1; a++)
              if (a + top - 2 < n) expect(step.state.best[a]![a + top - 2]).not.toBeNull();
          }
          const stack = step.extra?.stack ?? [];
          for (let k = 1; k < stack.length; k++) {
            // Each call is on a shorter stretch inside its caller's.
            expect(stack[k]!.a).toBeGreaterThanOrEqual(stack[k - 1]!.a);
            expect(stack[k]!.b).toBeLessThanOrEqual(stack[k - 1]!.b);
            expect(stack[k]!.b - stack[k]!.a).toBeLessThan(stack[k - 1]!.b - stack[k - 1]!.a);
          }
        }
        const end = t.entries[2]!.steps.at(-1)!;
        if (settings.approach === 'naive') {
          expect(end.vars?.order).toBeUndefined();
          return;
        }
        const order = String(end.vars?.order);
        if (p === 'merge') {
          const b = bracketCost(order);
          expect(b.leaves).toEqual(v);
          expect(b.cost).toBe(want);
        } else expect(scoreOf(v, order.split(' ').map(Number))).toBe(want);
      }),
      { numRuns: 150 },
    );
  });

  it('refuses rows it cannot read', () => {
    const t = new Timeline(def, def.defaults, 1, [
      ['trace'],
      ['load', '1 2 x'],
      ['load', '1 2 3 4 5 6 7'],
      ['load', '12 3'],
    ]);
    const says = t.entries.map((e) => e.steps[0]!.say);
    expect(says[0]).toMatch(/Solve first/);
    expect(says[1]).toMatch(/"x" is not a whole number/);
    expect(says[2]).toMatch(/at most 6/);
    expect(says[3]).toMatch(/12 is out of range/);
    expect(t.endState().v).toEqual([5, 6, 1, 4]);
  });

  it('counts 3^(n − 1) calls for plain recursion', () => {
    for (let n = 1; n <= 6; n++) {
      expect(naiveCalls(n, 'remove')).toBe(3 ** (n - 1));
      expect(naiveCalls(n, 'merge')).toBe(3 ** (n - 1));
    }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
