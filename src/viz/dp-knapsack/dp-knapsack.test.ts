import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeQuestion } from '../../engine/types';
import { dpKnapsack, parseKnapsack } from '.';
import { itemsText, MAX_CAPACITY, type Item } from './model';

/** The reference: plain recursion with a memo. */
function refBest(items: Item[]) {
  const memo = new Map<string, number>();
  const B = (i: number, c: number): number => {
    if (i === 0) return 0;
    const key = `${i},${c}`;
    if (!memo.has(key)) {
      const { w, v } = items[i - 1]!;
      memo.set(key, Math.max(B(i - 1, c), w <= c ? B(i - 1, c - w) + v : -Infinity));
    }
    return memo.get(key)!;
  };
  return B;
}

/** The best value over every subset, by brute force. */
function bruteForce(items: Item[], W: number): number {
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

/** The walk back: an item is in when its row changed the value. */
function refTaken(items: Item[], W: number): number[] {
  const B = refBest(items);
  const out: number[] = [];
  let c = W;
  for (let i = items.length; i >= 1; i--) {
    if (B(i, c) !== B(i - 1, c)) {
      out.push(i);
      c -= items[i - 1]!.w;
    }
  }
  return out.reverse();
}

function refGreedy(items: Item[], W: number): number {
  const order = [...items.keys()].sort(
    (p, q) => items[q]!.v / items[q]!.w - items[p]!.v / items[p]!.w || p - q,
  );
  let left = W;
  let value = 0;
  for (const k of order)
    if (items[k]!.w <= left) {
      left -= items[k]!.w;
      value += items[k]!.v;
    }
  return value;
}

const itemsArb = fc.array(
  fc.record({ w: fc.integer({ min: 1, max: 12 }), v: fc.integer({ min: 1, max: 99 }) }),
  { minLength: 1, maxLength: 6 },
);

const run = (ops: OpCall[]) => new Timeline(dpKnapsack, {}, 1, ops);

describe('0/1 knapsack', { timeout: 60_000 }, () => {
  it('fills every cell like the reference and takes a best set of items', () => {
    fc.assert(
      fc.property(
        itemsArb,
        fc.integer({ min: 0, max: MAX_CAPACITY }),
        fc.integer({ min: 0, max: 3 }),
        (items, W, rows) => {
          const t = run([
            ['items', itemsText(items)],
            ['capacity', W],
            ...Array.from({ length: rows }, () => ['row'] as OpCall),
            ['fill'],
            ['trace'],
          ]);
          const B = refBest(items);
          for (let s = 0; s < t.length; s++) {
            const { step } = t.at(s);
            if (itemsText(step.state.items) !== itemsText(items) || step.state.W !== W) continue;
            step.state.K.forEach((r, i) =>
              r.forEach((v, c) => {
                if (v === null) return;
                expect(v, `K[${i}][${c}]`).toBe(B(i, c));
                if (i > 0) expect(step.state.K[i - 1]![c]).not.toBeNull();
                if (c > 0) expect(step.state.K[i]![c - 1]).not.toBeNull();
              }),
            );
            // The walk climbs one row per step, never gaining capacity.
            const path = step.extra?.path ?? [];
            for (let k = 0; k + 1 < path.length; k++) {
              expect(path[k + 1]![0]).toBe(path[k]![0] - 1);
              expect(path[k + 1]![1]).toBeLessThanOrEqual(path[k]![1]);
            }
          }
          const end = t.entries.at(-1)!.steps.at(-1)!;
          const best = bruteForce(items, W);
          expect(end.vars?.best).toBe(best);
          const taken = String(end.vars?.items).split(' ').filter(Boolean).map(Number);
          expect(taken).toEqual(refTaken(items, W));
          const weight = taken.reduce((s, k) => s + items[k - 1]!.w, 0);
          const value = taken.reduce((s, k) => s + items[k - 1]!.v, 0);
          expect(weight).toBeLessThanOrEqual(W);
          expect(value).toBe(best);
          expect(end.vars?.greedy).toBe(refGreedy(items, W));
          expect(Number(end.vars?.greedy)).toBeLessThanOrEqual(best);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('shows the best value per weight first losing to the table', () => {
    const end = run([['items', '1:6 2:10 3:12'], ['capacity', 5], ['fill'], ['trace']])
      .entries.at(-1)!
      .steps.at(-1)!;
    expect(end.vars).toMatchObject({ best: 22, items: '2 3', greedy: 16, weight: 5 });
    expect(end.say).toBe(
      'Take items 2 and 3: weight 5 of 5, value 22. Greedy by value per weight gets 16.',
    );
  });

  it('reads items and capacities, and refuses what it cannot use', () => {
    expect(parseKnapsack('5')).toBe(5);
    expect(parseKnapsack('1:6, 2:10')).toBe('1:6 2:10');
    expect(parseKnapsack('13')).toBeInstanceOf(Error);
    expect(parseKnapsack('1:6 x')).toBeInstanceOf(Error);
    expect(parseKnapsack('0:5')).toBeInstanceOf(Error);
    const t = run([
      ['items', '5'],
      ['items', '1:100'],
      ['capacity', '1:6'],
      ['capacity', 13],
      ['trace'],
    ]);
    for (const e of t.entries) expect(e.end).toBe(t.initial.state);
    expect(t.entries.at(-1)!.steps[0]!.say).toMatch(/^Fill the table first/);
  });
});

describe('0/1 knapsack practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 30 && seed < 500; seed++)
      for (const item of practiceSet(dpKnapsack, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(10);
    return out;
  }
  const problemOf = (q: PracticeQuestion) => {
    const items = String(q.setup[0]![1])
      .split(' ')
      .map((p) => {
        const [w, v] = p.split(':').map(Number);
        return { w: w!, v: v! };
      });
    return { items, W: Number(q.setup[1]![1]) };
  };

  it('expects the reference value of the asked cell', () => {
    for (const q of questions('cell')) {
      const { items } = problemOf(q);
      const [, i, c] = /K\[(\d+)\]\[(\d+)\]\?/.exec(q.prompt)!.map(Number);
      expect(q.answer).toEqual({ kind: 'number', value: refBest(items)(i!, c!) });
    }
  });

  it('says an item is in exactly when its row changed the value', () => {
    for (const q of questions('take')) {
      const { items } = problemOf(q);
      const [, i, c] = /reached K\[(\d+)\]\[(\d+)\]/.exec(q.prompt)!.map(Number);
      const B = refBest(items);
      const inside = B(i!, c!) !== B(i! - 1, c!);
      expect(q.answer).toMatchObject({ kind: 'choice', correct: inside ? 0 : 1 });
    }
  });

  it('expects the reference items and the reference greedy value', () => {
    for (const q of questions('chosen')) {
      const { items, W } = problemOf(q);
      expect(q.answer).toEqual({ kind: 'sequence', value: refTaken(items, W).map(String) });
    }
    for (const q of questions('greedy')) {
      const { items, W } = problemOf(q);
      expect(q.answer).toEqual({ kind: 'number', value: refGreedy(items, W) });
    }
  });
});
