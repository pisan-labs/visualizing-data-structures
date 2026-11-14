import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { popcountOf } from '../bitmask/model';
import { dpBitmask as def } from '.';
import { solveDP, tableText, totals, type AssignSettings } from './model';

/** The reference: every permutation, from scratch. */
function reference(cost: number[][]) {
  const n = cost.length;
  const perms: number[][] = [];
  const go = (p: number[]) => {
    if (p.length === n) {
      perms.push([...p]);
      return;
    }
    for (let t = 0; t < n; t++) if (!p.includes(t)) go([...p, t]);
  };
  go([]);
  const total = (p: number[]) => p.reduce((s, t, w) => s + cost[w]![t]!, 0);
  const best = Math.min(...perms.map(total));
  return { best, optimal: perms.filter((p) => total(p) === best), perms: perms.length };
}

/** The reference for one mask: the cheapest way to give its tasks to the first workers. */
function maskValue(cost: number[][], mask: number): number {
  const ts = [...Array(cost.length).keys()].filter((t) => (mask >> t) & 1);
  let best = Infinity;
  const go = (w: number, left: number[], total: number) => {
    if (left.length === 0) {
      best = Math.min(best, total);
      return;
    }
    for (const t of left)
      go(
        w + 1,
        left.filter((x) => x !== t),
        total + cost[w]![t]!,
      );
  };
  go(0, ts, 0);
  return best;
}

const tables = fc.integer({ min: 1, max: 4 }).chain((n) =>
  fc.array(fc.array(fc.integer({ min: 0, max: 12 }), { minLength: n, maxLength: n }), {
    minLength: n,
    maxLength: n,
  }),
);
const approaches = fc.constantFrom('pattern' as const, 'naive' as const);

function runSolve(cost: number[][], settings: AssignSettings) {
  const t = new Timeline(def, settings, 1, [['load', tableText(cost)], ['solve']]);
  return t.entries[1]!;
}

describe('dp-bitmask', () => {
  it('finds the reference cheapest total both ways, and counts the tries', () => {
    fc.assert(
      fc.property(tables, approaches, (cost, approach) => {
        const n = cost.length;
        const ref = reference(cost);
        const entry = runSolve(cost, { approach });
        const end = entry.end;
        expect(end.best).toBe(ref.best);
        expect(ref.optimal.map((p) => p.join(' '))).toContain(end.tasks!.join(' '));
        const last = entry.steps.at(-1)!;
        const tot = totals(n);
        expect(last.vars?.['naive total']).toBe(tot.naive);
        expect(last.vars?.['pattern total']).toBe(n * 2 ** (n - 1));
        expect(last.vars?.tries).toBe(approach === 'naive' ? tot.naive : tot.pattern);
        if (approach === 'naive') {
          expect(last.vars?.orders).toBe(ref.perms);
          // A mask of k tasks is reached k! times.
          const fact = (k: number): number => (k <= 1 ? 1 : k * fact(k - 1));
          last.extra!.seen!.forEach((c, m) => expect(c).toBe(fact(popcountOf(m))));
        } else {
          expect(end.tasks).toEqual(solveDP(cost).tasks);
        }
        // Every step: a filled mask holds its true value, and every mask it reads is filled.
        for (const step of entry.steps) {
          step.state.f.forEach((v, m) => {
            if (v === null) return;
            const done = step.extra?.mask !== m || step.lines.includes('t.take') || m === 0;
            if (done) expect(v).toBe(maskValue(cost, m));
            else expect(v).toBeGreaterThanOrEqual(maskValue(cost, m));
            for (let t = 0; t < n; t++)
              if ((m >> t) & 1) expect(step.state.f[m ^ (1 << t)]).not.toBeNull();
          });
        }
      }),
      { numRuns: 200 },
    );
  });

  it('reads tables row by row, or as n² values in one row', () => {
    const parse = def.controls.input!.parse;
    expect(parse('1 2 / 3 4')).toBe('1 2 / 3 4');
    expect(parse('1 2 3 4')).toBe('1 2 / 3 4');
    expect(parse('1; 2')).toBeInstanceOf(Error);
    expect(parse('1 2 3')).toBeInstanceOf(Error);
    expect(parse('1 2 / 3 x')).toBeInstanceOf(Error);
    expect(
      parse('1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25'),
    ).toBeInstanceOf(Error);
    expect(parse('100')).toBeInstanceOf(Error);
  });

  it('keeps the table when a load is refused', () => {
    const t = new Timeline(def, { approach: 'pattern' }, 1, [['load', '1 2 / 3']]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/Row 2 has 1 value/);
    expect(tableText(t.endState().cost)).toBe('3 7 5 8 / 4 9 2 6 / 6 5 8 3 / 2 8 7 9');
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
