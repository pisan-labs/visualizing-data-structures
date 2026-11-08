import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { cuckooHashing } from '.';
import { h, keysOf, type CuckooExtra, type CuckooSettings, type CuckooState } from './model';

type T = Timeline<CuckooState, CuckooSettings, CuckooExtra>;
const run = (calls: OpCall[], m = 11): T => new Timeline(cuckooHashing, { m }, 1, calls);

const isPrime = (n: number) => {
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return n >= 2;
};

/**
 * Cuckoo hashing written separately. It finds a cycle the slow, sure way: the walk is
 * deterministic, so it loops forever exactly when a whole configuration (tables, key in hand,
 * table it is headed for) comes back. The model uses the "homeless a third time" rule instead.
 */
class Reference {
  t: (number | null)[][];
  constructor(public m: number) {
    this.t = [Array(m).fill(null), Array(m).fill(null)];
  }
  slot(i: number, k: number) {
    return i === 0 ? k % this.m : Math.floor(k / this.m) % this.m;
  }
  walk(k: number): number | null {
    const seen = new Set<string>();
    let x = k;
    let i = 0;
    for (;;) {
      const sig = `${x}|${i}|${this.t[0]!.join(',')}|${this.t[1]!.join(',')}`;
      if (seen.has(sig)) return x;
      seen.add(sig);
      const j = this.slot(i, x);
      const old = this.t[i]![j]!;
      this.t[i]![j] = x;
      if (old === null) return null;
      x = old;
      i = 1 - i;
    }
  }
  insert(k: number): boolean {
    if (this.t[0]![this.slot(0, k)] === k || this.t[1]![this.slot(1, k)] === k) return false;
    const snapshot = this.t.map((r) => [...r]);
    if (this.walk(k) !== null) {
      // Rebuild from the keys before the walk plus k: the walk only moved keys around.
      const keys = [...snapshot[0]!, ...snapshot[1]!].filter((x): x is number => x !== null);
      return this.rehash(keys, k);
    }
    return true;
  }
  rehash(before: number[], k: number): boolean {
    const all = new Set([...before, k]);
    for (;;) {
      let m = this.m + 1;
      while (!isPrime(m)) m++;
      this.m = m;
      this.t = [Array(m).fill(null), Array(m).fill(null)];
      if ([...all].every((x) => this.walk(x) === null)) return true;
    }
  }
  keys() {
    return [...this.t[0]!, ...this.t[1]!].filter((x) => x !== null).sort((a, b) => a! - b!);
  }
}

describe('cuckoo hashing', () => {
  it('kicks keys out by identity and counts the kicks', () => {
    const t = run([61, 4, 26, 125, 37].map((k): OpCall => ['insert', k]));
    const last = t.entries.at(-1)!;
    expect(last.steps.at(-1)!.vars!.kicks).toBe(3);
    expect(last.steps.at(-1)!.say).toContain('37 settles there');
    // 4 moved from T2[0] back to T1[4] with its uid.
    const four = t.entries[1]!.end.t[0][4]!;
    expect(t.endState().t[0][4]!.uid).toBe(four.uid);
  });

  it('detects a cycle and rehashes into bigger tables', () => {
    const t = run([5, 126, 247].map((k): OpCall => ['insert', k]));
    const end = t.endState();
    expect(end.m).toBe(13);
    expect(end.rehashes).toBe(1);
    expect(keysOf(end).sort((a, b) => a - b)).toEqual([5, 126, 247]);
    expect(t.entries[2]!.steps.some((s) => s.say.includes('homeless for the third time'))).toBe(
      true,
    );
  });

  it('matches a reference with full cycle detection, and every key sits in one of its nests', () => {
    const key = fc.integer({ min: 0, max: 300 });
    const call: fc.Arbitrary<OpCall> = fc.oneof(
      { weight: 6, arbitrary: key.map((k) => ['insert', k] as OpCall) },
      { weight: 2, arbitrary: key.map((k) => ['search', k] as OpCall) },
      { weight: 2, arbitrary: key.map((k) => ['delete', k] as OpCall) },
      { weight: 1, arbitrary: fc.constantFrom<OpCall>(['clear'], ['insert', 'x']) },
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 13 }),
        fc.array(call, { maxLength: 30 }),
        (m, calls) => {
          const t = run(calls, m);
          const ref = new Reference(m);
          calls.forEach(([op, k], i) => {
            const last = t.entries[i]!.steps.at(-1)!;
            if (op === 'clear') ref.t = [Array(ref.m).fill(null), Array(ref.m).fill(null)];
            else if (typeof k !== 'number') return;
            else if (op === 'insert') ref.insert(k);
            else if (op === 'search') {
              const where =
                ref.t[0]![ref.slot(0, k)] === k ? 1 : ref.t[1]![ref.slot(1, k)] === k ? 2 : 0;
              expect(last.vars!.found ? last.vars!.probes : 0).toBe(where);
            } else {
              for (const s of [0, 1])
                if (ref.t[s]![ref.slot(s, k)] === k) ref.t[s]![ref.slot(s, k)] = null;
            }
            const end = t.entries[i]!.end;
            expect(end.m).toBe(ref.m);
            expect(end.t.map((r) => r.map((c) => c?.key ?? null))).toEqual(ref.t);
          });
          for (let i = 0; i < t.length; i++) {
            const s = t.at(i).step.state;
            const uids: number[] = [];
            for (const side of [0, 1] as const)
              s.t[side].forEach((c, j) => {
                if (!c) return;
                uids.push(c.uid);
                expect(h(side, c.key, s.m)).toBe(j);
              });
            expect(new Set(uids).size).toBe(uids.length);
          }
        },
      ),
      { numRuns: 250 },
    );
  });

  it('keeps its text readable on a laptop and a phone', () => {
    expect(smallestText(cuckooHashing, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(cuckooHashing, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
