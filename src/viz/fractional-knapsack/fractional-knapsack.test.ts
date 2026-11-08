import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { PracticeQuestion } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { fractionalKnapsack, parseFrac } from '.';
import { itemsText, valueOf, type FracSettings, type Item } from './model';

/**
 * The reference: the fractional optimum is a linear program, and its value is the largest of
 * the values of the "take a prefix of items in ratio order, then part of one" packings. Check it
 * against every order instead: try every permutation and fill greedily in that order; the best
 * of those is the optimum (some order is the ratio order).
 */
function refFractional(items: Item[], W: number): number {
  let best = 0;
  const perm = (left: Item[], acc: Item[]) => {
    if (left.length === 0) {
      let room = W;
      let v = 0;
      for (const it of acc) {
        const t = Math.min(it.w, room);
        v += (it.v * t) / it.w;
        room -= t;
      }
      best = Math.max(best, v);
      return;
    }
    left.forEach((it, k) => perm([...left.slice(0, k), ...left.slice(k + 1)], [...acc, it]));
  };
  perm(items, []);
  return best;
}

function refWhole(items: Item[], W: number): number {
  let best = 0;
  for (let mask = 0; mask < 1 << items.length; mask++) {
    let w = 0;
    let v = 0;
    items.forEach((it, k) => {
      if (mask & (1 << k)) {
        w += it.w;
        v += it.v;
      }
    });
    if (w <= W) best = Math.max(best, v);
  }
  return best;
}

const itemsArb = fc
  .array(fc.record({ w: fc.integer({ min: 1, max: 12 }), v: fc.integer({ min: 1, max: 99 }) }), {
    minLength: 1,
    maxLength: 5,
  })
  .map((xs) => xs.map((x, k) => ({ id: k + 1, ...x })));

const run = (items: Item[], W: number, mode: FracSettings['mode']) =>
  new Timeline(fractionalKnapsack, { mode }, 1, [
    ['items', itemsText(items)],
    ['capacity', W],
    ['fill'],
  ]);

describe('fractional knapsack', { timeout: 60_000 }, () => {
  it('matches the optimum when items can be cut, and never beats the 0/1 best with whole items', () => {
    fc.assert(
      fc.property(
        itemsArb,
        fc.integer({ min: 1, max: 15 }),
        fc.constantFrom<FracSettings['mode']>('fractional', 'whole'),
        (items, W, mode) => {
          const t = run(items, W, mode);
          for (let k = 0; k < t.length; k++) {
            const { state } = t.at(k).step;
            const used = state.taken.reduce<number>((s, x) => s + (x ?? 0), 0);
            expect(used).toBeLessThanOrEqual(state.W);
            state.items.forEach((it, i) => expect(state.taken[i] ?? 0).toBeLessThanOrEqual(it.w));
            const cut = state.items.filter((it, i) => (state.taken[i] ?? 0) % it.w !== 0);
            expect(cut.length).toBeLessThanOrEqual(mode === 'whole' ? 0 : 1);
          }
          const end = t.entries.at(-1)!;
          const v = valueOf(end.end);
          const value = v.num / v.den;
          const whole = refWhole(items, W);
          expect(end.steps.at(-1)!.vars?.['0/1 best']).toBe(whole);
          if (mode === 'fractional') {
            expect(value).toBeCloseTo(refFractional(items, W), 9);
            expect(value).toBeGreaterThanOrEqual(whole);
          } else expect(value).toBeLessThanOrEqual(whole);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('takes 2/3 of item 3 for 24, and whole items get 16', () => {
    const items = [
      { id: 1, w: 1, v: 6 },
      { id: 2, w: 2, v: 10 },
      { id: 3, w: 3, v: 12 },
    ];
    const f = run(items, 5, 'fractional').entries.at(-1)!.steps.at(-1)!;
    expect(f.vars?.total).toBe('24');
    const w = run(items, 5, 'whole').entries.at(-1)!.steps.at(-1)!;
    expect(w.say).toBe(
      'Greedy with whole items gets 16, weight 3 of 5. The 0/1 knapsack table finds 22: best ratio first is wrong when items cannot be cut.',
    );
  });

  it('reads items and capacities, and refuses what it cannot use', () => {
    expect(parseFrac('5')).toBe(5);
    expect(parseFrac('1:6, 2:10')).toBe('1:6 2:10');
    expect(parseFrac('16')).toBeInstanceOf(Error);
    expect(parseFrac('0')).toBeInstanceOf(Error);
    expect(parseFrac('13:5')).toBeInstanceOf(Error);
    const t = new Timeline(fractionalKnapsack, { mode: 'fractional' }, 1, [
      ['items', 'cat'],
      ['capacity', 'zebra'],
      ['capacity', 99],
    ]);
    for (const e of t.entries) expect(e.end).toBe(t.initial.state);
  });
});

describe('fractional knapsack practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 20 && seed < 400; seed++)
      for (const item of practiceSet(fractionalKnapsack, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(5);
    return out;
  }
  const problem = (q: PracticeQuestion) => ({
    items: String(q.setup[0]![1])
      .split(' ')
      .map((p, k) => {
        const [w, v] = p.split(':').map(Number);
        return { id: k + 1, w: w!, v: v! };
      }),
    W: Number(q.setup[1]![1]),
  });

  it('never claims whole-item greedy beats the 0/1 best', () => {
    for (const q of questions('whole')) {
      const { items, W } = problem(q);
      expect((q.answer as { value: number }).value).toBeLessThanOrEqual(refWhole(items, W));
    }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(fractionalKnapsack, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(fractionalKnapsack, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
