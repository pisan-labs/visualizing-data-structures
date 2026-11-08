import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { bitmask, parseBits } from '.';
import { bin, type BitSettings } from './model';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';

const settings = (s: Partial<BitSettings> = {}): BitSettings =>
  ({ ...bitmask.defaults, ...s }) as BitSettings;

/** A reference set: a plain array of booleans, no bit tricks. */
class RefSet {
  bits: boolean[];
  constructor(width: number) {
    this.bits = Array(width).fill(false);
  }
  get value() {
    return this.bits.reduce((v, b, i) => v + (b ? 2 ** i : 0), 0);
  }
  load(v: number) {
    this.bits = this.bits.map((_, i) => Math.floor(v / 2 ** i) % 2 === 1);
  }
}

describe('bitmask', () => {
  it('sets, clears, toggles and tests bits', () => {
    const t = new Timeline(bitmask, settings(), 1, [
      ['load', 37],
      ['set', 1],
      ['clear', 0],
      ['toggle', 7],
      ['test', 2],
    ]);
    expect(t.entries.map((e) => e.end.x)).toEqual([37, 39, 38, 166, 166]);
    expect(t.entries[4]!.steps.at(-1)!.vars?.returned).toBe(1);
  });

  it('finds the lowest set bit and counts bits', () => {
    const t = new Timeline(bitmask, settings(), 1, [['load', 40], ['lowbit'], ['popcount']]);
    expect(t.entries[1]!.steps.at(-1)!.vars?.returned).toBe(8);
    expect(t.entries[2]!.steps.at(-1)!.vars?.returned).toBe(2);
  });

  it('runs the popcount loop once per set bit, and the scan once per bit', () => {
    const loops = (method: BitSettings['popcount'], x: number) =>
      new Timeline(bitmask, settings({ popcount: method }), 1, [
        ['load', x],
        ['popcount'],
      ]).entries[1]!.steps.filter((s) => s.level === 3).length;
    expect(loops('kernighan', 128)).toBe(1);
    expect(loops('kernighan', 255)).toBe(8);
    expect(loops('scan', 128)).toBe(8);
  });

  it('lists submasks from largest to smallest', () => {
    const t = new Timeline(bitmask, settings(), 1, [['load', 11], ['submasks']]);
    expect(t.endState().list).toEqual([11, 10, 9, 8, 3, 2, 1, 0]);
  });

  it('turns down bits outside x and too many submasks', () => {
    const t = new Timeline(bitmask, settings({ width: 4 }), 1, [
      ['set', 4],
      ['load', 16],
      ['subsets', 6],
    ]);
    for (const e of t.entries) expect(e.steps.at(-1)!.lines).toEqual([]);
    const big = new Timeline(bitmask, settings(), 1, [['load', 63], ['submasks']]);
    expect(big.entries[1]!.steps.at(-1)!.lines).toEqual([]);
  });

  it('matches a reference set for any sequence of operations', () => {
    const bitOp = fc.constantFrom('set', 'clear', 'toggle', 'test');
    const call = fc.oneof(
      fc.integer({ min: 0, max: 1100 }).map((v) => ['load', v] as OpCall),
      fc.tuple(bitOp, fc.integer({ min: -1, max: 11 })).map(([op, i]) => [op, i] as OpCall),
      fc.constant(['lowbit'] as OpCall),
      fc.constant(['popcount'] as OpCall),
      fc.integer({ min: 0, max: 6 }).map((n) => ['subsets', n] as OpCall),
      fc.constant(['submasks'] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 10 }),
        fc.constantFrom('kernighan' as const, 'scan' as const),
        fc.array(call, { maxLength: 30 }),
        (width, popcount, calls) => {
          const st = settings({ width, popcount });
          const t = new Timeline(bitmask, st, 1, calls);
          const ref = new RefSet(width);
          let total = 0;
          calls.forEach(([op, a], k) => {
            const e = t.entries[k]!;
            const last = e.steps.at(-1)!;
            const i = Number(a);
            const inBits = Number.isInteger(i) && i >= 0 && i < width;
            if (op === 'load' && i < 2 ** width) ref.load(i);
            if (op === 'set' && inBits) ref.bits[i] = true;
            if (op === 'clear' && inBits) ref.bits[i] = false;
            if (op === 'toggle' && inBits) ref.bits[i] = !ref.bits[i];
            if (op === 'test' && inBits) expect(last.vars?.returned).toBe(ref.bits[i] ? 1 : 0);
            if (op === 'lowbit') {
              const low = ref.bits.indexOf(true);
              expect(last.vars?.returned).toBe(low < 0 ? 0 : 2 ** low);
            }
            const ones = ref.bits.filter(Boolean).length;
            if (op === 'popcount') expect(last.vars?.returned).toBe(ones);
            if (op === 'subsets' && i >= 1 && i <= Math.min(5, width))
              expect(e.end.list).toEqual(Array.from({ length: 2 ** i }, (_, m) => m));
            if (op === 'submasks' && ones <= 5) {
              const x = ref.value;
              const want = [];
              for (let m = x; m >= 0; m--) if ((m & x) === m) want.push(m);
              expect(e.end.list).toEqual(want);
            }
            expect(e.end.x).toBe(ref.value);
            expect(e.end.total).toBeGreaterThanOrEqual(total);
            total = e.end.total;
          });
          for (let s = 0; s < t.length; s++) {
            const { step } = t.at(s);
            expect(step.vars?.binary).toBe(bin(step.state.x, width));
            expect(step.state.x).toBeGreaterThanOrEqual(0);
            expect(step.state.x).toBeLessThan(2 ** width);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('parses decimal and binary input', () => {
    expect(parseBits('37')).toBe(37);
    expect(parseBits('0b100101')).toBe(37);
    expect(parseBits('-1')).toBeInstanceOf(Error);
    expect(parseBits('cat')).toBeInstanceOf(Error);
    expect(parseBits('5000')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  // The "returns" label drew at 8.1 px on a phone; with room for the list only while one is shown, and row names above the rows on a phone, at 9.4.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(bitmask, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(bitmask, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
