import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { amortizedAnalysis, parseK } from '.';
import {
  BITS,
  MAX_OPS,
  amortized,
  bankOf,
  chargeOf,
  firstBelow,
  firstShort,
  phiOf,
  sum,
  valueOf,
  type AmSettings,
  type AmState,
  type Growth,
  type Structure,
} from './model';

const settings = (s: Partial<AmSettings> = {}): AmSettings =>
  ({ ...amortizedAnalysis.defaults, ...s }) as AmSettings;

const timeline = (st: AmSettings, calls: OpCall[]) => new Timeline(amortizedAnalysis, st, 1, calls);

/** A plain simulation, written separately from the model: costs, bank and Φ per operation. */
function reference(structure: Structure, growth: Growth, charge: number, n: number) {
  const costs: number[] = [];
  const banks: number[] = [];
  const phis: number[] = [];
  let size = 0;
  let capacity = 0;
  let value = 0;
  let bank = 0;
  const ones = (v: number) =>
    v
      .toString(2)
      .split('')
      .filter((b) => b === '1').length;
  for (let j = 0; j < n; j++) {
    let cost: number;
    let phi: number;
    if (structure === 'array') {
      cost = 1;
      if (size === capacity) {
        cost += size;
        if (growth === '4') capacity += 4;
        else if (capacity === 0) capacity = 1;
        else capacity = growth === '2' ? capacity * 2 : Math.ceil(capacity * 1.5);
      }
      size++;
      phi = growth === '1.5' ? 3 * size - 2 * capacity : 2 * size - capacity;
    } else {
      const next = (value + 1) % 2 ** BITS;
      cost = ones(value ^ next);
      value = next;
      phi = ones(value);
    }
    bank += charge - cost;
    costs.push(cost);
    banks.push(bank);
    phis.push(phi);
  }
  return { costs, banks, phis, size, capacity, value };
}

const structures = fc.constantFrom<Structure>('array', 'counter');
const growths = fc.constantFrom<Growth>('2', '1.5', '4');
const methods = fc.constantFrom('aggregate' as const, 'accounting' as const, 'potential' as const);
const charges = fc.constantFrom(
  'auto' as const,
  '1' as const,
  '2' as const,
  '3' as const,
  '4' as const,
);
/** Runs of operations, as the buttons make them: "run k" and "one more". */
const calls = fc.array(
  fc.oneof(
    fc.integer({ min: 1, max: MAX_OPS }).map((k) => ['run', k] as OpCall),
    fc.constant(['once'] as OpCall),
  ),
  { minLength: 1, maxLength: 6 },
);

/** Checks every step of a timeline against the rules the page claims. */
function checkSteps(t: Timeline<AmState, AmSettings, unknown>, st: AmSettings) {
  for (let i = 0; i < t.length; i++) {
    const { step } = t.at(i);
    const s = step.state;
    const coins = s.coins.reduce((a, c) => a + c.length, 0);
    // The bank is either coins or debt, never both.
    expect(coins > 0 && s.debt > 0, `step ${i}: coins and debt`).toBe(false);
    expect(s.debt).toBeGreaterThanOrEqual(0);
    if (st.method !== 'accounting') expect(coins + s.debt).toBe(0);
    if (st.structure === 'array') {
      expect(s.coins.length).toBe(s.capacity);
      expect(s.size).toBeLessThanOrEqual(s.capacity);
      expect(s.room).toBeGreaterThanOrEqual(s.capacity);
    } else {
      expect(s.coins.length).toBe(BITS);
    }
    expect(s.costs.length).toBe(s.banks.length);
    expect(s.costs.length).toBe(s.phis.length);
    if (s.cur) {
      expect(s.cur.cost).toBeGreaterThanOrEqual(0);
      expect(s.cur.cost).toBeLessThanOrEqual(s.cur.final);
    } else if (st.method === 'accounting') {
      // Between operations the coins and debt are exactly the bank's balance.
      expect(bankOf(s)).toBe(s.banks.at(-1) ?? 0);
    }
    expect(step.vars?.total).toBe(sum(s.costs));
    expect(step.vars?.operations).toBe(s.costs.length);
    // The plan covers what has happened so far.
    expect(s.plan.costs.slice(0, s.costs.length)).toEqual(s.costs);
  }
  for (const e of t.entries) {
    expect(e.end.cur).toBeNull();
    expect(e.end.plan).toEqual({ costs: e.end.costs, banks: e.end.banks, phis: e.end.phis });
  }
}

describe('amortized analysis', () => {
  it('matches a reference simulation for any runs, rule, method and charge', () => {
    fc.assert(
      fc.property(
        structures,
        growths,
        methods,
        charges,
        calls,
        (structure, growth, method, charge, cs) => {
          const st = settings({ structure, growth, method, charge });
          const t = timeline(st, cs);
          const end = t.endState();
          const n = end.costs.length;
          const asked = cs.reduce((a, c) => a + (c[0] === 'run' ? (c[1] as number) : 1), 0);
          expect(n).toBe(Math.min(asked, MAX_OPS));
          const ref = reference(structure, growth, chargeOf(st), n);
          expect(end.costs).toEqual(ref.costs);
          expect(end.banks).toEqual(ref.banks);
          expect(end.phis).toEqual(ref.phis);
          expect(sum(end.costs)).toBe(sum(ref.costs));
          if (structure === 'array') {
            expect(end.size).toBe(ref.size);
            expect(end.capacity).toBe(ref.capacity);
          } else {
            expect(valueOf(end.bits)).toBe(ref.value);
          }
          expect(phiOf(end, st)).toBe(ref.phis.at(-1) ?? 0);
          checkSteps(t, st);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('never lets the bank go negative or Φ below its start when doubling with charge 3', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_OPS }), (n) => {
        for (const method of ['accounting', 'potential'] as const) {
          const t = timeline(settings({ method, charge: '3', growth: '2' }), [['run', n]]);
          for (let i = 0; i < t.length; i++) {
            const s = t.at(i).step.state;
            expect(s.debt).toBe(0);
            expect(s.banks.every((b) => b >= 0)).toBe(true);
            expect(s.phis.every((p) => p >= 0)).toBe(true);
            if (!s.cur) expect(phiOf(s, settings())).toBeGreaterThanOrEqual(0);
          }
          const end = t.endState();
          expect(firstShort(end)).toBeNull();
          expect(firstBelow(end)).toBeNull();
          // Every append after the first costs exactly 3, amortized.
          expect(
            amortized(end)
              .slice(1)
              .every((a) => a === 3),
          ).toBe(true);
          expect(sum(end.costs)).toBeLessThan(3 * n);
        }
      }),
    );
  });

  it('flips fewer than 2k bits over k increments, and every increment is 2 amortized', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_OPS }), (k) => {
        const t = timeline(settings({ structure: 'counter', method: 'potential' }), [['run', k]]);
        const end = t.endState();
        expect(sum(end.costs)).toBeLessThan(2 * k);
        expect(amortized(end).every((a) => a === 2)).toBe(true);
        expect(valueOf(end.bits)).toBe(k);
        const bank = timeline(settings({ structure: 'counter' }), [['run', k]]).endState();
        // With a charge of 2, the bank is exactly one coin per 1 bit.
        expect(bankOf(bank)).toBe(end.bits.filter((b) => b === 1).length);
        bank.coins.forEach((pile, i) => expect(pile.length).toBe(bank.bits[i]));
      }),
    );
  });

  it('marks the moment the bank would go negative where the reference says', () => {
    fc.assert(
      fc.property(
        structures,
        growths,
        charges,
        fc.integer({ min: 1, max: MAX_OPS }),
        (structure, growth, charge, n) => {
          const st = settings({ structure, growth, charge, method: 'accounting' });
          const t = timeline(st, [['run', n]]);
          const ref = reference(structure, growth, chargeOf(st), n);
          const j = ref.banks.findIndex((b) => b < 0);
          const expected = j < 0 ? null : j + 1;
          expect(firstShort(t.endState())).toBe(expected);
          // The first step that borrows belongs to that operation, and its last step says so.
          let shortOp: number | null = null;
          for (let i = 0; i < t.length && shortOp === null; i++) {
            const s = t.at(i).step.state;
            if (s.debt > 0) shortOp = s.costs.length + (s.cur ? 1 : 0);
          }
          expect(shortOp).toBe(expected);
          if (expected !== null) {
            const last = [...Array(t.length).keys()]
              .map((i) => t.at(i).step)
              .find((s) => s.level === 1 && !s.state.cur && s.state.costs.length === expected)!;
            expect(last.say).toContain('is too small');
            expect(last.marks).toContainEqual({ id: 'rd-method', role: 'error' });
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('knows the textbook moments', () => {
    const short = (s: Partial<AmSettings>, n: number) =>
      firstShort(timeline(settings({ method: 'accounting', ...s }), [['run', n]]).endState());
    expect(short({ charge: '2' }, 8)).toBe(5);
    expect(short({ charge: '3', growth: '1.5' }, 12)).toBe(9);
    expect(short({ charge: 'auto', growth: '1.5' }, 32)).toBeNull();
    expect(short({ charge: '3', growth: '4' }, 32)).toBe(17);
    expect(short({ charge: '4', growth: '4' }, 32)).toBe(25);
    expect(short({ structure: 'counter', charge: '1' }, 4)).toBe(2);
    expect(short({ structure: 'counter', charge: 'auto' }, 32)).toBeNull();
    const dip = timeline(settings({ method: 'potential', growth: '4' }), [['run', 13]]).endState();
    expect(firstBelow(dip)).toBe(1);
    expect(amortized(dip).filter((_, j) => [4, 8, 12].includes(j))).toEqual([3, 7, 11]);
  });

  it('stops at the page limit and explains bad input', () => {
    const t = timeline(settings(), [['run', 30], ['run', 5], ['once']]);
    expect(t.entries[1]!.end.costs.length).toBe(MAX_OPS);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/^Only 2 more fit/);
    expect(t.entries[2]!.steps).toHaveLength(1);
    expect(t.entries[2]!.steps[0]!.say).toContain('stops at 32 operations');
    const bad = timeline(settings(), [
      ['run', 0],
      ['run', 'x'],
    ]);
    expect(bad.endState().costs).toEqual([]);
    expect(parseK('5')).toBe(5);
    expect(parseK('33')).toBeInstanceOf(Error);
    expect(parseK('two')).toBeInstanceOf(Error);
  });

  it('puts the coins where the textbook story says', () => {
    // Doubling with 3 coins: after a grow, only the newest old item keeps a coin.
    const t = timeline(settings(), [['run', 9]]);
    expect(t.endState().coins.map((c) => c.length)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 0, 0, 0,
    ]);
    // The pseudocode follows the method and the growth rule.
    const lines = (st: AmSettings) =>
      amortizedAnalysis
        .pseudocode(st)[1]!
        .lines.map((l) => l.text)
        .join('\n');
    expect(lines(settings({ method: 'potential', growth: '1.5' }))).toContain(
      '3·size − 2·capacity',
    );
    expect(lines(settings({ method: 'accounting' }))).toContain('bank = bank − 1');
    expect(lines(settings({ structure: 'counter', method: 'aggregate' }))).toContain(
      'cost = cost + 1',
    );
  });
});
