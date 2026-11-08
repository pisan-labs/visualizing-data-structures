import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { fisherYates } from '.';
import { exactCounts, type Direction, type FySettings, type Method } from './model';

describe('fisher-yates', () => {
  it('keeps the same items (with their ids), and never touches the shuffled part again', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.constantFrom<Method>('correct', 'naive'),
        fc.constantFrom<Direction>('forward', 'backward'),
        fc.integer({ min: 1, max: 1000 }),
        (n, method, direction, seed) => {
          const settings: FySettings = { method, direction };
          const values = Array.from({ length: n }, (_, k) => `v${k}`).join(' ');
          const t = new Timeline(fisherYates, settings, seed, [['load', values], ['shuffle']]);
          const start = t.entries[0]!.end.items;
          const steps = t.entries[1]!.steps;
          const key = (xs: typeof start) => xs.map((x) => `${x.uid}:${x.v}`).sort();
          for (const s of steps) expect(key(s.state.items)).toEqual(key(start));
          if (method === 'correct') {
            // Once a position is final, its item never changes.
            const finalAt = new Map<number, number>();
            for (const s of steps) {
              s.state.items.forEach((x, pos) => {
                const done = s.state.done;
                const final = done !== null && (direction === 'forward' ? pos < done : pos >= done);
                if (final && !finalAt.has(pos)) finalAt.set(pos, x.uid);
                if (finalAt.has(pos)) expect(x.uid).toBe(finalAt.get(pos));
              });
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('gives every order one run when correct, and the naive shuffle 27 uneven runs', () => {
    expect(exactCounts({ method: 'correct', direction: 'forward' })).toEqual([1, 1, 1, 1, 1, 1]);
    expect(exactCounts({ method: 'correct', direction: 'backward' })).toEqual([1, 1, 1, 1, 1, 1]);
    expect(exactCounts({ method: 'naive', direction: 'forward' })).toEqual([4, 5, 5, 5, 4, 4]);
  });

  it('shows the naive bias over many trials, and no bias for Fisher-Yates', () => {
    const counts = (method: Method) =>
      new Timeline(fisherYates, { method, direction: 'forward' }, 7, [['trials', 6000]]).entries[0]!
        .end.counts!;
    const fair = counts('correct');
    for (const c of fair) expect(Math.abs(c - 1000)).toBeLessThan(120);
    const naive = counts('naive');
    // 1 3 2, 2 1 3 and 2 3 1 (5/27) beat 1 2 3, 3 1 2 and 3 2 1 (4/27).
    expect(Math.min(naive[1]!, naive[2]!, naive[3]!)).toBeGreaterThan(
      Math.max(naive[0]!, naive[4]!, naive[5]!),
    );
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(fisherYates, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(fisherYates, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
