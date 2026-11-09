import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeQuestion } from '../../engine/types';
import { dpChange, parseChange } from '.';
import { MAX_AMOUNT, type ChangeSettings } from './model';

const settings = (goal: ChangeSettings['goal'] = 'fewest'): ChangeSettings => ({ goal });

/** The reference for the fewest coins: plain recursion with a memo. */
function refFewest(coins: number[], amount: number): number {
  const memo = new Map<number, number>();
  const f = (a: number): number => {
    if (a === 0) return 0;
    if (memo.has(a)) return memo.get(a)!;
    let best = Infinity;
    for (const c of coins) if (c <= a) best = Math.min(best, f(a - c) + 1);
    memo.set(a, best);
    return best;
  };
  return f(amount);
}

/** The reference for the number of ways: count the multisets of coins one by one. */
function refWays(coins: number[], amount: number): number {
  const go = (left: number, i: number): number => {
    if (left === 0) return 1;
    if (i < 0) return 0;
    let n = 0;
    for (let used = 0; used * coins[i]! <= left; used++) n += go(left - used * coins[i]!, i - 1);
    return n;
  };
  return go(amount, coins.length - 1);
}

function refGreedy(coins: number[], amount: number) {
  const picks: number[] = [];
  let left = amount;
  for (const c of [...coins].sort((a, b) => b - a))
    while (c <= left) {
      picks.push(c);
      left -= c;
    }
  return { picks, stuck: left > 0 };
}

const coinsArb = fc
  .uniqueArray(fc.integer({ min: 1, max: 12 }), { minLength: 1, maxLength: 5 })
  .map((cs) => [...cs].sort((a, b) => a - b));

const run = (goal: ChangeSettings['goal'], coins: number[], amount: number) =>
  new Timeline(dpChange, settings(goal), 1, [
    ['coins', coins.join(' ')],
    ['change', amount],
  ]).entries[1]!;

describe('making change', { timeout: 60_000 }, () => {
  it('fills every fewest-coins cell like the reference, and pays with the fewest coins', () => {
    fc.assert(
      fc.property(coinsArb, fc.integer({ min: 0, max: MAX_AMOUNT }), (coins, amount) => {
        const e = run('fewest', coins, amount);
        let filled = 0;
        for (const step of e.steps) {
          const [F = [], C = []] = step.state.table;
          const now = F.filter((v) => v !== null).length;
          // Cells fill left to right, one at a time, and never change.
          expect(F.slice(0, now).every((v) => v !== null)).toBe(true);
          expect(now - filled).toBeLessThanOrEqual(1);
          filled = now;
          F.forEach((v, a) => {
            if (v === null) return;
            expect(v, `F[${a}]`).toBe(refFewest(coins, a));
            const c = C[a]!;
            if (a === 0 || v === Infinity) expect(c).toBe(0);
            else {
              // The coin row holds the first coin (smallest) that reaches the minimum.
              const first = coins.find((x) => x <= a && refFewest(coins, a - x) + 1 === v);
              expect(c, `coin[${a}]`).toBe(first);
            }
          });
        }
        const last = e.steps.at(-1)!;
        const best = refFewest(coins, amount);
        expect(e.end.table[0]![amount]).toBe(best);
        const paid = (last.extra?.taken ?? []).map((t) => t.coin);
        if (best === Infinity || amount === 0) expect(paid).toEqual([]);
        else {
          expect(paid).toHaveLength(best);
          expect(paid.reduce((x, y) => x + y, 0)).toBe(amount);
          for (const c of paid) expect(coins).toContain(c);
        }
        if (amount > 0) expect(last.extra?.greedy).toEqual(refGreedy(coins, amount));
      }),
      { numRuns: 200 },
    );
  });

  it('counts the ways like the reference, row by row', () => {
    fc.assert(
      fc.property(coinsArb, fc.integer({ min: 0, max: MAX_AMOUNT }), (coins, amount) => {
        const e = run('ways', coins, amount);
        for (const step of e.steps) {
          step.state.table.forEach((row, i) =>
            row.forEach((v, a) => {
              if (v !== null) expect(v, `W[${i}][${a}]`).toBe(refWays(coins.slice(0, i), a));
            }),
          );
        }
        expect(e.steps.at(-1)!.vars?.ways).toBe(refWays(coins, amount));
      }),
      { numRuns: 150 },
    );
  });

  it('shows greedy failing on coins 1, 3 and 4 for 6, and getting stuck on 3 and 5 for 11', () => {
    const fails = run('fewest', [1, 3, 4], 6).steps.at(-1)!;
    expect(fails.vars).toMatchObject({ fewest: 2, greedy: 3 });
    expect(fails.say).toBe('change(6) needs 2 coins: 3 + 3. Greedy needs 3.');
    const stuck = run('fewest', [3, 5], 11).steps.at(-1)!;
    expect(stuck.vars).toMatchObject({ fewest: 3, greedy: 'stuck' });
    expect(stuck.extra?.taken?.map((t) => t.coin)).toEqual([3, 3, 5]);
    expect(run('fewest', [3, 5], 11).end.table[0]!.map((v) => v === Infinity)).toEqual([
      false,
      true,
      true,
      false,
      true,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(run('ways', [1, 2, 5], 12).steps.at(-1)!.vars?.ways).toBe(13);
  });

  it('fails greedy on 10 with coins 1, 5 and 6, but not once a 10 is there too', () => {
    expect(run('fewest', [1, 5, 6], 10).steps.at(-1)!.vars).toMatchObject({
      fewest: 2,
      greedy: 5,
    });
    expect(run('fewest', [1, 5, 6, 10], 10).steps.at(-1)!.vars).toMatchObject({
      fewest: 1,
      greedy: 1,
    });
    expect(dpChange.explain).toContain('Swap the 10 for a 6');
  });

  it('words an impossible amount for one or two cells it read', () => {
    const says = run('fewest', [3, 5], 11).steps.map((s) => s.say);
    expect(says).toContain('F[4] = ∞: F[1] is ∞ too, so 4 cannot be made either.');
    expect(says).toContain(
      'F[7] = ∞: neither F[4] nor F[2] can be made, so 7 cannot be made either.',
    );
    expect(says.join(' ')).not.toContain('none of F[1] can');
  });

  it('reads coins and amounts, and refuses what it cannot use', () => {
    expect(parseChange('6')).toBe(6);
    expect(parseChange('4, 1 3')).toBe('4 1 3');
    expect(parseChange('13')).toBeInstanceOf(Error);
    expect(parseChange('1 2 3 4 5 6')).toBeInstanceOf(Error);
    const t = new Timeline(dpChange, settings(), 1, [
      ['coins', '4 1 3'],
      ['coins', '2 2'],
      ['coins', '0 5'],
      ['change', '1 2'],
      ['change', 99],
    ] as OpCall[]);
    expect(t.entries[0]!.end.coins).toEqual([1, 3, 4]);
    for (const e of t.entries.slice(1)) expect(e.end).toBe(t.entries[0]!.end);
    expect(t.entries[1]!.steps[0]!.say).toContain('2 appears twice');
  });

  it('follows the goal in its pseudocode', () => {
    const text = (goal: ChangeSettings['goal']) =>
      dpChange.pseudocode(settings(goal))[0]!.lines.map((l) => l.text);
    expect(text('fewest')).toContain('if F[a - c] + 1 < F[a]');
    expect(text('ways')).toContain('W[i][a] = W[i][a] + W[i][a - c[i]]');
  });
});

describe('making change practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 30 && seed < 500; seed++)
      for (const item of practiceSet(dpChange, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(10);
    return out;
  }
  const coinsOf = (q: PracticeQuestion) => String(q.setup[0]![1]).split(' ').map(Number);
  const amountOf = (q: PracticeQuestion) => Number(q.watch![0]![1]);

  it('asks for the next cell and expects the reference value', () => {
    for (const q of questions('next-cell'))
      expect(q.answer).toEqual({ kind: 'number', value: refFewest(coinsOf(q), amountOf(q)) });
  });

  it('expects coins that pay the amount with the fewest coins', () => {
    for (const q of questions('paid')) {
      if (q.answer.kind !== 'sequence') throw new Error('not a sequence');
      const paid = q.answer.value.map(Number);
      expect(paid.reduce((x, y) => x + y, 0)).toBe(amountOf(q));
      expect(paid).toHaveLength(refFewest(coinsOf(q), amountOf(q)));
    }
  });

  it('judges greedy like the reference', () => {
    for (const q of questions('greedy')) {
      if (q.answer.kind !== 'choice') throw new Error('not a choice');
      const g = refGreedy(coinsOf(q), amountOf(q));
      const best = refFewest(coinsOf(q), amountOf(q));
      const want = g.stuck ? 'gets stuck' : g.picks.length > best ? 'more coins' : 'as few';
      expect(q.answer.options[q.answer.correct]).toContain(want);
    }
  });

  it('counts the ways like the reference', () => {
    for (const q of questions('ways'))
      expect(q.answer).toEqual({ kind: 'number', value: refWays(coinsOf(q), amountOf(q)) });
  });
});

describe('drawn text size', () => {
  // 16 cells at 44 units drew the arc labels at 7.3 px on a phone; narrower cells there: 11.3.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(dpChange, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(dpChange, PHONE_STAGE).px).toBeGreaterThanOrEqual(11);
  });
});
