import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { hyperloglog } from '.';
import { estimate, split, type HllExtra, type HllSettings, type HllState } from './model';

type T = Timeline<HllState, HllSettings, HllExtra>;
const run = (calls: OpCall[], s: Partial<HllSettings> = {}): T =>
  new Timeline(hyperloglog, { ...hyperloglog.defaults, ...s } as HllSettings, 1, calls);

/** HyperLogLog written separately: a BigInt finalizer and string bit counting. */
function reference(b: number) {
  const m = 2 ** b;
  const M = Array<number>(m).fill(0);
  const mask = (1n << 32n) - 1n;
  const hash = (x: number) => {
    let h = BigInt(x);
    h ^= h >> 16n;
    h = (h * 0x85ebca6bn) & mask;
    h ^= h >> 13n;
    h = (h * 0xc2b2ae35n) & mask;
    h ^= h >> 16n;
    return Number(h >> 16n);
  };
  return {
    M,
    add(x: number) {
      const bits = hash(x).toString(2).padStart(16, '0');
      const j = parseInt(bits.slice(0, b), 2);
      const rest = bits.slice(b);
      const rho = rest.includes('1') ? rest.indexOf('1') + 1 : rest.length + 1;
      M[j] = Math.max(M[j]!, rho);
    },
  };
}

describe('HyperLogLog', () => {
  it('splits the hash into a register and ρ', () => {
    const { h, j, rho } = split(42, 4);
    const bits = h.toString(2).padStart(16, '0');
    expect(j).toBe(parseInt(bits.slice(0, 4), 2));
    expect(rho).toBe(bits.slice(4).indexOf('1') + 1);
    const t = run([['add', 42]]);
    expect(t.entries[0]!.steps[0]!.say).toContain(`h(42) = ${h}, which is ${bits} in binary`);
  });

  it('reports α·m for an empty sketch without the correction, and 0 with it', () => {
    const off = run([['estimate']], { small: false }).entries[0]!.steps.at(-1)!;
    expect(off.vars!.estimate).toBe('10.8');
    const on = run([['estimate']]).entries[0]!.steps.at(-1)!;
    expect(on.vars!.estimate).toBe('0.0');
    expect(on.lines).toContain('est.lc');
  });

  it('estimates a hundred distinct items within a few standard errors', () => {
    const calls = Array.from({ length: 100 }, (_, i): OpCall => ['add', i * 7 + 3]);
    const e = estimate(run(calls).endState(), true).value;
    expect(e).toBeGreaterThan(40);
    expect(e).toBeLessThan(200);
  });

  it('matches a reference sketch, and repeats change nothing', () => {
    const item = fc.integer({ min: 0, max: 999 });
    const call: fc.Arbitrary<OpCall> = fc.oneof(
      { weight: 8, arbitrary: item.map((x) => ['add', x] as OpCall) },
      { weight: 1, arbitrary: fc.constantFrom<OpCall>(['estimate'], ['clear'], ['add', 'cat']) },
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 6 }),
        fc.boolean(),
        fc.array(call, { maxLength: 60 }),
        (b, small, calls) => {
          const t = run(calls, { b, small });
          let ref = reference(b);
          calls.forEach(([op, x], i) => {
            if (op === 'clear') ref = reference(b);
            else if (op === 'add' && typeof x === 'number') ref.add(x);
            expect(t.entries[i]!.end.M).toEqual(ref.M);
          });
          // Adding everything again changes no register.
          const end = t.endState();
          const again = run([...calls, ...end.seen.map((x): OpCall => ['add', x])], {
            b,
            small,
          }).endState();
          expect(again.M).toEqual(end.M);
          for (let i = 0; i < t.length; i++) {
            const s = t.at(i).step.state;
            expect(s.M.length).toBe(2 ** b);
            for (const v of s.M) expect(v).toBeLessThanOrEqual(16 - b + 1);
            expect(new Set(s.seen).size).toBe(s.seen.length);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('keeps its text readable on a laptop and a phone', () => {
    expect(smallestText(hyperloglog, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(hyperloglog, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
