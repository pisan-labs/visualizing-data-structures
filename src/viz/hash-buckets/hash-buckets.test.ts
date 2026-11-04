import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { hashBuckets } from '.';
import { sizeOf, type BucketExtra, type BucketSettings, type BucketState } from './model';

type T = Timeline<BucketState, BucketSettings, BucketExtra>;

const settings = (s: Partial<BucketSettings> = {}): BucketSettings =>
  ({ ...hashBuckets.defaults, ...s }) as BucketSettings;
const run = (calls: OpCall[], s: Partial<BucketSettings> = {}): T =>
  new Timeline(hashBuckets, settings(s), 1, calls);
const lastStep = (t: T, k: number) => t.entries[k]!.steps.at(-1)!;
const layout = (s: BucketState) => ({
  buckets: s.buckets.map((bk) => bk.map((x) => (x ? x.key : null))),
  overflow: s.overflow.map((x) => x.key),
});

/** Bucket hashing written separately from the model, to compare against. */
class Reference {
  buckets: (number | null)[][];
  overflow: number[] = [];
  probes = 0;
  constructor(
    readonly B: number,
    readonly b: number,
    readonly area: boolean,
  ) {
    this.buckets = Array.from({ length: B }, () => Array(b).fill(null));
  }
  insert(k: number): 'added' | 'present' | 'refused' {
    this.probes = 0;
    const bk = this.buckets[k % this.B]!;
    for (const x of bk) {
      this.probes++;
      if (x === k) return 'present';
    }
    const free = bk.indexOf(null);
    if (free >= 0) {
      bk[free] = k;
      return 'added';
    }
    if (!this.area) return 'refused';
    for (const x of this.overflow) {
      this.probes++;
      if (x === k) return 'present';
    }
    this.overflow.push(k);
    return 'added';
  }
  find(k: number, remove: boolean): boolean {
    this.probes = 0;
    const i = k % this.B;
    const bk = this.buckets[i]!;
    for (let t = 0; t < this.b; t++) {
      this.probes++;
      if (bk[t] === k) {
        if (remove) {
          bk[t] = null;
          const p = this.overflow.findIndex((x) => x % this.B === i);
          if (p >= 0) bk[t] = this.overflow.splice(p, 1)[0]!;
        }
        return true;
      }
    }
    if (!this.area || bk.includes(null)) return false;
    for (let p = 0; p < this.overflow.length; p++) {
      this.probes++;
      if (this.overflow[p] === k) {
        if (remove) this.overflow.splice(p, 1);
        return true;
      }
    }
    return false;
  }
}

describe('hashing with buckets', () => {
  it('spills into the overflow area and searches it only when the bucket is full', () => {
    const t = run([
      ['insert', 10],
      ['insert', 15],
      ['insert', 20],
      ['insert', 25],
      ['insert', 3],
      ['search', 25],
      ['search', 30],
      ['search', 8],
    ]);
    expect(layout(t.endState()).overflow).toEqual([20, 25]);
    expect(lastStep(t, 5).vars).toMatchObject({ found: true, probes: 4 });
    expect(lastStep(t, 6).vars).toMatchObject({ found: false, probes: 4 });
    expect(lastStep(t, 7).vars).toMatchObject({ found: false, probes: 2 });
    expect(t.entries[2]!.steps[0]!.say).toContain('h(20) = 20 mod 5 = 0');
  });

  it('pulls a key back from the overflow area on delete', () => {
    const t = run([10, 15, 20, 25].map((k): OpCall => ['insert', k]).concat([['delete', 15]]));
    expect(layout(t.endState())).toMatchObject({ overflow: [25] });
    expect(layout(t.endState()).buckets[0]).toEqual([10, 20]);
    expect(lastStep(t, 4).lines).toContain('del.move');
  });

  it('refuses a key when its bucket is full and there is no overflow area', () => {
    const t = run(
      [10, 15, 20].map((k): OpCall => ['insert', k]),
      { overflow: 'report' },
    );
    expect(lastStep(t, 2).lines).toContain('ins.report');
    expect(sizeOf(t.endState())).toBe(2);
  });

  it('matches a reference table for any sequence of operations', () => {
    const key = fc.integer({ min: 0, max: 40 });
    const call: fc.Arbitrary<OpCall> = fc.oneof(
      { weight: 4, arbitrary: key.map((k) => ['insert', k] as OpCall) },
      { weight: 2, arbitrary: key.map((k) => ['search', k] as OpCall) },
      { weight: 2, arbitrary: key.map((k) => ['delete', k] as OpCall) },
      { weight: 1, arbitrary: fc.constantFrom<OpCall>(['clear'], ['insert', 'x'], ['delete', -2]) },
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 12 }),
        fc.integer({ min: 1, max: 4 }),
        fc.constantFrom('area' as const, 'report' as const),
        fc.array(call, { maxLength: 40 }),
        (B, b, overflow, calls) => {
          const st = settings({ B, b, overflow });
          const t = new Timeline(hashBuckets, st, 1, calls);
          let ref = new Reference(B, b, overflow === 'area');
          calls.forEach(([op, raw], idx) => {
            const last = lastStep(t, idx);
            if (op === 'clear') {
              ref = new Reference(B, b, overflow === 'area');
              return;
            }
            if (typeof raw !== 'number' || raw < 0) {
              expect(last.lines[0]).toMatch(/\.sig$/);
              return;
            }
            if (op === 'insert') {
              const r = ref.insert(raw);
              const got = last.lines.some((l) => l === 'ins.store' || l === 'ins.append')
                ? 'added'
                : last.lines.includes('ins.report')
                  ? 'refused'
                  : 'present';
              expect(got).toBe(r);
            } else {
              const r = ref.find(raw, op === 'delete');
              if (op === 'search') expect(last.vars?.found).toBe(r);
              else expect(last.lines.includes('del.miss')).toBe(!r);
            }
            expect(last.vars?.probes).toBe(ref.probes);
            const end = t.entries[idx]!.end;
            expect(layout(end)).toEqual({ buckets: ref.buckets, overflow: ref.overflow });
            // The promise search relies on: only a full bucket has keys in the overflow area.
            // (Delete breaks it for one step, between freeing a slot and pulling a key back.)
            for (const x of end.overflow) expect(end.buckets[x.key % B]!.every(Boolean)).toBe(true);
          });
          for (let i = 0; i < t.length; i++) {
            const { step } = t.at(i);
            const s = step.state;
            const keys = [
              ...s.buckets.flatMap((bk) => bk.filter(Boolean).map((x) => x!.key)),
              ...s.overflow.map((x) => x.key),
            ];
            expect(new Set(keys).size, 'no key twice').toBe(keys.length);
            s.buckets.forEach((bk, i2) => {
              expect(bk.length).toBe(b);
              for (const x of bk) if (x) expect(x.key % B).toBe(i2);
            });
            if (overflow === 'report') expect(s.overflow).toEqual([]);
            expect(step.vars?.n).toBe(sizeOf(s));
            expect(step.vars?.overflow).toBe(s.overflow.length);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
