import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { ringAllreduce } from '.';
import {
  bitCount,
  gradientText,
  parseVectors,
  ringSent,
  scatterSteps,
  loaded,
  type RingSettings,
} from './model';

/** All-reduce the obvious way: everyone sends everything to one place, which adds it up. */
const reference = (g: number[][]) => g[0]!.map((_, c) => g.reduce((t, row) => t + row[c]!, 0));

const gradientsArb = fc.integer({ min: 2, max: 5 }).chain((n) =>
  fc.array(fc.array(fc.integer({ min: -99, max: 99 }), { minLength: n, maxLength: n }), {
    minLength: n,
    maxLength: n,
  }),
);
const callArb: fc.Arbitrary<OpCall> = fc.constantFrom(
  ['scatter'] as OpCall,
  ['gather'] as OpCall,
  ['allreduce'] as OpCall,
  ['fresh'] as OpCall,
);

describe('ring-allreduce', () => {
  it('ends with the plain sum on every worker', () => {
    fc.assert(
      fc.property(gradientsArb, fc.boolean(), (g, inTwo) => {
        const settings: RingSettings = { workers: g.length };
        const ops: OpCall[] = inTwo
          ? [['load', gradientText(g)], ['scatter'], ['gather']]
          : [['load', gradientText(g)], ['allreduce']];
        const end = new Timeline(ringAllreduce, settings, 1, ops).endState();
        const want = reference(g);
        for (const row of end.v) expect(row).toEqual(want);
        expect(end.sent).toBe(2 * (g.length - 1));
        expect(end.phase).toBe('done');
      }),
      { numRuns: 200 },
    );
  });

  it('keeps every cell the sum of the gradients it says it holds, on every step', () => {
    fc.assert(
      fc.property(
        gradientsArb,
        fc.array(callArb, { maxLength: 6 }),
        fc.integer({ min: 1, max: 500 }),
        (g, calls, seed) => {
          const n = g.length;
          const t = new Timeline(ringAllreduce, { workers: n }, seed, [
            ['load', gradientText(g)],
            ...calls,
          ]);
          for (let k = 0; k < t.length; k++) {
            const { step } = t.at(k);
            const s = step.state;
            s.v.forEach((row, i) =>
              row.forEach((x, c) => {
                let total = 0;
                for (let j = 0; j < n; j++) if (s.has[i]![c]! & (1 << j)) total += s.g[j]![c]!;
                expect(x).toBe(total);
                // A worker's own gradient is always in its cells, until all-gather overwrites.
                if (s.phase === 'start' && !step.extra?.stage) expect(s.has[i]![c]).toBe(1 << i);
              }),
            );
            // In flight: one chunk from every worker, each to its right-hand neighbour.
            const packets = step.extra?.packets;
            if (packets) {
              expect(packets).toHaveLength(n);
              packets.forEach((p, i) => {
                expect(p.from).toBe(i);
                expect(p.to).toBe((i + 1) % n);
              });
              expect(new Set(packets.map((p) => p.chunk)).size).toBe(n);
            }
          }
        },
      ),
      { numRuns: 120 },
    );
  });

  it('leaves worker i with the whole sum of chunk i + 1 after reduce-scatter', () => {
    for (let n = 2; n <= 5; n++) {
      const g = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, c) => i * 10 + c),
      );
      const s = scatterSteps(loaded(g), n - 1);
      for (let i = 0; i < n; i++) {
        const full = s.has[i]!.map((bits) => bitCount(bits) === n);
        expect(full.filter(Boolean)).toHaveLength(1);
        expect(full[(i + 1) % n]).toBe(true);
        expect(s.v[i]![(i + 1) % n]).toBe(reference(g)[(i + 1) % n]);
      }
    }
  });

  it('sends 2(N − 1)/N of the vector per worker', () => {
    expect(ringSent(2, 100)).toBe(100);
    expect(ringSent(4, 120)).toBe(180);
    expect(ringSent(5, 600)).toBe(960);
    const end = new Timeline(ringAllreduce, { workers: 5 }, 1, [['allreduce']]);
    expect(end.at(end.length - 1).step.vars?.['vectors sent per worker']).toBe(1.6);
  });

  it('skips what has already run', () => {
    const t = new Timeline(ringAllreduce, { workers: 3 }, 1, [
      ['load', '1 2 3 / 4 5 6 / 7 8 9'],
      ['scatter'],
      ['scatter'],
      ['allreduce'],
      ['allreduce'],
      ['gather'],
    ]);
    expect(t.entries.map((e) => e.steps.length)).toEqual([1, 2 * 2 + 1, 1, 2 * 2 + 1, 1, 1]);
    for (const row of t.endState().v) expect(row).toEqual([12, 15, 18]);
  });

  it('parses gradients and refuses what does not fit', () => {
    expect(parseVectors('1 2 / 3 4')).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(parseVectors('1, −2; 3 4')).toEqual([
      [1, -2],
      [3, 4],
    ]);
    expect(parseVectors('1 2 3 / 4 5 6')).toBeInstanceOf(Error);
    expect(parseVectors('7')).toBeInstanceOf(Error);
    expect(parseVectors('1 2 / 3 x')).toBeInstanceOf(Error);
    expect(parseVectors('1.5 2 / 3 4')).toBeInstanceOf(Error);
    expect(parseVectors('100 2 / 3 4')).toBeInstanceOf(Error);
    const wrong = new Timeline(ringAllreduce, { workers: 4 }, 1, [['load', '1 2 / 3 4']]);
    expect(wrong.at(wrong.length - 1).step.say).toContain('The ring has 4 workers');
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(ringAllreduce, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(ringAllreduce, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
