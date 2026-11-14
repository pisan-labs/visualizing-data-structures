import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { dpStateMachine as def } from '.';
import { naiveCalls, solveTable, statesFor, type SMSettings } from './model';

/** The reference: try every action on every day (buy, sell or rest), keeping to the rules. */
function reference(prices: number[], cooldown: boolean, fee: number): number {
  let best = 0;
  const go = (t: number, holding: boolean, resting: boolean, cash: number) => {
    if (t === prices.length) {
      if (!holding) best = Math.max(best, cash);
      return;
    }
    const p = prices[t]!;
    go(t + 1, holding, false, cash); // rest (or keep holding)
    if (holding) go(t + 1, false, cooldown, cash + p - fee);
    else if (!resting) go(t + 1, true, false, cash - p);
  };
  go(0, false, false, 0);
  return best;
}

const pricesArb = fc.array(fc.integer({ min: 1, max: 12 }), { minLength: 1, maxLength: 7 });
const settingsArb = fc.record({
  approach: fc.constantFrom('pattern' as const, 'naive' as const),
  cooldown: fc.boolean(),
  fee: fc.integer({ min: 0, max: 3 }),
});

describe('dp-state-machine', () => {
  it('gives the reference answer both ways, and every step is consistent', () => {
    fc.assert(
      fc.property(pricesArb, settingsArb, (prices, settings: SMSettings) => {
        const cooldown = settings.cooldown;
        const fee = settings.fee;
        const t = new Timeline(def, settings, 1, [['load', prices.join(' ')], ['solve'], ['trace']]);
        const want = reference(prices, cooldown, fee);
        const T = solveTable(prices, cooldown, fee);
        const solve = t.entries[1]!.steps;
        const last = solve.at(-1)!;
        expect(last.vars?.profit).toBe(want);
        expect(last.vars?.['naive total']).toBe(naiveCalls(prices.length, cooldown));
        expect(last.vars?.['pattern total']).toBe(statesFor(settings).length * (prices.length + 1));
        if (settings.approach === 'naive') expect(last.vars?.calls).toBe(last.vars?.['naive total']);
        else expect(last.vars?.cells).toBe(last.vars?.['pattern total']);
        for (const step of solve) {
          // Every value shown is the true one; the table fills column by column.
          step.state.T.forEach((row, r) =>
            row.forEach((v, c) => {
              if (v !== null) expect(v).toBe(T[r]![c]);
            }),
          );
          step.extra?.seen?.forEach((row, r) =>
            row.forEach((v, c) => {
              if (v !== null) expect(v).toBe(T[r]![c]);
            }),
          );
          // The stack goes back one day per call.
          const stack = step.extra?.stack ?? [];
          for (let k = 1; k < stack.length; k++) expect(stack[k]![1]).toBe(stack[k - 1]![1] - 1);
        }
        const end = t.entries[2]!.steps.at(-1)!;
        if (settings.approach === 'naive') {
          expect(end.vars?.plan).toBeUndefined();
          return;
        }
        // The plan keeps to the rules and makes the profit.
        expect(end.vars?.profit).toBe(want);
        const plan = String(end.vars?.plan);
        const trades = plan === 'none' ? [] : plan.match(/(buy|sell) \d+/g)!.map((x) => x.split(' '));
        let cash = 0;
        let holding = false;
        let lastSale = -10;
        for (const [kind, day] of trades) {
          const d = Number(day);
          const p = prices[d - 1]!;
          if (kind === 'buy') {
            expect(holding).toBe(false);
            if (cooldown) expect(d).toBeGreaterThan(lastSale + 1);
            else expect(d).toBeGreaterThan(lastSale);
            cash -= p;
            holding = true;
          } else {
            expect(holding).toBe(true);
            cash += p - fee;
            holding = false;
            lastSale = d;
          }
        }
        expect(holding).toBe(false);
        expect(cash).toBe(want);
      }),
      { numRuns: 200 },
    );
  });

  it('refuses prices it cannot read, and a trace before the table', () => {
    const t = new Timeline(def, def.defaults, 1, [
      ['trace'],
      ['load', '1 2 x'],
      ['load', '1 2 3 4 5 6 7 8 9'],
      ['load', '0 4'],
    ]);
    const says = t.entries.map((e) => e.steps[0]!.say);
    expect(says[0]).toMatch(/Solve first/);
    expect(says[1]).toMatch(/"x" is not a whole number/);
    expect(says[2]).toMatch(/at most 8/);
    expect(says[3]).toMatch(/0 is out of range/);
    expect(t.endState().prices).toEqual([6, 1, 4, 9, 1, 7]);
  });

  it('sells early under the cooldown on the start prices', () => {
    const t = new Timeline(def, def.defaults, 1, [['solve'], ['trace']]);
    expect(t.entries[1]!.steps.at(-1)!.vars?.plan).toBe('buy 2 sell 3 buy 5 sell 6');
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
