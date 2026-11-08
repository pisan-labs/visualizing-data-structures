import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { reservoirSampling } from '.';

/** Algorithm R replayed from the model's own draws: the reservoir it must hold. */
function replay(stream: string[], k: number, draws: (number | null)[]): string[] {
  const r: string[] = [];
  stream.forEach((x, idx) => {
    const i = idx + 1;
    if (i <= k) r.push(x);
    else {
      // The newest item may still be waiting for its draw.
      if (draws[idx] === undefined) return;
      const j = draws[idx]!;
      expect(j).toBeGreaterThanOrEqual(1);
      expect(j).toBeLessThanOrEqual(i);
      if (j <= k) r[j - 1] = x;
    }
  });
  return r;
}

describe('reservoir sampling', () => {
  it('holds what Algorithm R holds after every item, from items seen so far', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 16 }),
        fc.integer({ min: 1, max: 10_000 }),
        (k, n, seed) => {
          const t = new Timeline(reservoirSampling, { k }, seed, [['stream', n]]);
          for (const { state: s } of t.entries[0]!.steps) {
            const values = s.stream.map((x) => x.v);
            const kept = s.slots
              .filter((u): u is number => u !== null)
              .map((u) => s.stream.find((x) => x.uid === u)!.v);
            expect(kept).toEqual(replay(values, k, s.draws));
            expect(kept.length).toBe(Math.min(k, s.stream.length));
            expect(new Set(kept).size).toBe(kept.length);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('keeps every item about k/n of the time over many trials', () => {
    for (const k of [1, 2, 4]) {
      const t = new Timeline(reservoirSampling, { k }, 3, [['trials', 4000]]);
      const counts = t.entries[0]!.end.counts!;
      const even = (4000 * k) / 8;
      for (const c of counts) expect(Math.abs(c - even)).toBeLessThan(even * 0.15);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(4000 * k);
    }
  });

  it('does not claim a handful of trials evens out', () => {
    const t = new Timeline(reservoirSampling, { k: 2 }, 3, [['trials', 3]]);
    const say = t.entries[0]!.steps.at(-1)!.say;
    expect(say).not.toMatch(/even out/);
    expect(say).toMatch(/chance still shows/);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(reservoirSampling, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(reservoirSampling, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
