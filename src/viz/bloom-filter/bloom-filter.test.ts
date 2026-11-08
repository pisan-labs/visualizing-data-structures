import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { bloomFilter } from '.';
import { ones, positions, type BloomExtra, type BloomSettings, type BloomState } from './model';

type T = Timeline<BloomState, BloomSettings, BloomExtra>;
const run = (calls: OpCall[], s: Partial<BloomSettings> = {}): T =>
  new Timeline(bloomFilter, { ...bloomFilter.defaults, ...s } as BloomSettings, 1, calls);

/** A Bloom filter written separately from the model, with its own hash arithmetic. */
class Reference {
  bits: boolean[];
  constructor(
    readonly m: number,
    readonly k: number,
  ) {
    this.bits = Array(m).fill(false);
  }
  pos(x: number) {
    const a = [71, 113, 157, 211, 263, 307];
    const b = [5, 17, 29, 43, 61, 83];
    return a.slice(0, this.k).map((ai, i) => ((ai * x + b[i]!) % 1009) % this.m);
  }
  insert(x: number) {
    for (const j of this.pos(x)) this.bits[j] = true;
  }
  query(x: number) {
    return this.pos(x).every((j) => this.bits[j]);
  }
}

describe('Bloom filter', () => {
  it('shows each hash with real numbers', () => {
    const t = run([['insert', 12]]);
    const says = t.entries[0]!.steps.map((s) => s.say);
    expect(says[1]).toContain('h1(12) = (71·12 + 5) mod 1009 mod 16 = 857 mod 16 = 9');
    expect(t.endState().bits.filter((b) => b).length).toBe(3);
  });

  it('names the keys behind a false positive', () => {
    const t = run([12, 25, 31, 47].map((x): OpCall => ['insert', x]).concat([['query', 45]]));
    const last = t.entries.at(-1)!.steps.at(-1)!;
    expect(last.say).toContain('a false positive');
    expect(last.say).toContain('bit 9 by 12 and 47');
    expect(t.endState().fp).toBe(1);
  });

  it('refuses to delete and names the keys that would break', () => {
    const t = run([
      ['insert', 12],
      ['insert', 31],
      ['delete', 31],
    ]);
    const last = t.entries.at(-1)!.steps.at(-1)!;
    expect(last.say).toContain('query(12)');
    expect(t.endState()).toEqual(t.entries[1]!.end);
  });

  it('matches a reference filter and never gives a false negative', () => {
    const key = fc.integer({ min: 0, max: 120 });
    const call: fc.Arbitrary<OpCall> = fc.oneof(
      { weight: 4, arbitrary: key.map((x) => ['insert', x] as OpCall) },
      { weight: 4, arbitrary: key.map((x) => ['query', x] as OpCall) },
      { weight: 1, arbitrary: key.map((x) => ['delete', x] as OpCall) },
      { weight: 1, arbitrary: fc.constantFrom<OpCall>(['clear'], ['measure'], ['insert', 'cat']) },
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 8, max: 32 }),
        fc.integer({ min: 1, max: 6 }),
        fc.array(call, { maxLength: 30 }),
        (m, k, calls) => {
          const t = run(calls, { m, k });
          let ref = new Reference(m, k);
          calls.forEach(([op, x], i) => {
            const last = t.entries[i]!.steps.at(-1)!;
            if (op === 'clear') ref = new Reference(m, k);
            else if (op === 'insert' && typeof x === 'number') ref.insert(x);
            else if (op === 'query' && typeof x === 'number')
              expect(last.vars!.answer).toBe(ref.query(x) ? 'maybe' : 'no');
            const end = t.entries[i]!.end;
            expect(end.bits.map(Boolean)).toEqual(ref.bits);
            // After each operation, the bits are exactly the union of the keys' bits.
            const all = new Set(end.keys.flatMap((x) => positions(x, m, k)));
            end.bits.forEach((b, j) => expect(b === 1).toBe(all.has(j)));
          });
          for (let i = 0; i < t.length; i++) {
            const s = t.at(i).step.state;
            // Every bit set belongs to some key, and every key's bits are set.
            const union = new Set(s.keys.flatMap((x) => positions(x, m, k)));
            // Mid-insert some bits of the new key are still 0; a set bit always has an owner.
            s.bits.forEach((b, j) => {
              if (b === 1) expect(union.has(j)).toBe(true);
            });
            expect(t.at(i).step.vars!['bits set']).toBe(ones(s));
            expect(s.fp).toBeLessThanOrEqual(s.absent);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('keeps its text readable on a laptop and a phone', () => {
    expect(smallestText(bloomFilter, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(bloomFilter, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
