import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { nextPrime } from '../_hashing/hashing';
import { hashRehash } from '.';
import {
  MAX_M,
  sizeOf,
  type RehashExtra,
  type RehashSettings,
  type RehashState,
  type Table,
  type Threshold,
} from './model';

type T = Timeline<RehashState, RehashSettings, RehashExtra>;

const settings = (s: Partial<RehashSettings> = {}): RehashSettings =>
  ({ ...hashRehash.defaults, ...s }) as RehashSettings;
const run = (calls: OpCall[], s: Partial<RehashSettings> = {}): T =>
  new Timeline(hashRehash, settings(s), 1, calls);
const lastStep = (t: T, k: number) => t.entries[k]!.steps.at(-1)!;
const keysOf = (t: Table) => t.slots.map((c) => (c ? c.key : null));

/** A resizing linear-probing table written separately from the model. */
class Reference {
  T: (number | null)[];
  n = 0;
  total = 0;
  inserts = 0;
  constructor(readonly st: RehashSettings) {
    this.T = Array(st.m0).fill(null);
  }
  slot(T: (number | null)[], k: number): number {
    let j = k % T.length;
    for (let i = 0; i < T.length && T[j] !== null && T[j] !== k; i++) j = (j + 1) % T.length;
    return j;
  }
  insert(k: number): 'added' | 'present' | 'refused' {
    if (this.T[this.slot(this.T, k)] === k) return 'present';
    let cost = 1;
    const m = this.T.length;
    const next = this.st.grow === 'double' ? 2 * m : nextPrime(2 * m);
    if (this.n + 1 > Number(this.st.threshold) * m && next <= MAX_M) {
      const old = this.T;
      this.T = Array(next).fill(null);
      for (const x of old) if (x !== null) this.T[this.slot(this.T, x)] = x;
      cost += this.n;
    }
    const j = this.slot(this.T, k);
    if (this.T[j] !== null) return 'refused';
    this.T[j] = k;
    this.n++;
    this.inserts++;
    this.total += cost;
    return 'added';
  }
}

/** Every key can be found by linear probing from its home slot without passing an empty slot. */
function checkFindable(t: Table) {
  t.slots.forEach((c, j) => {
    if (!c) return;
    for (let i = 0; i < t.m; i++) {
      const at = (c.key + i) % t.m;
      if (at === j) return;
      expect(t.slots[at], `${c.key} passes an empty slot`).not.toBeNull();
    }
  });
}

describe('rehashing', () => {
  it('grows to the next prime and moves every key', () => {
    const t = run([12, 7, 19, 3].map((k): OpCall => ['insert', k]));
    expect(t.endState().table.m).toBe(11);
    expect(lastStep(t, 3).vars?.cost).toBe(4);
    const moves = t.entries[3]!.steps.filter((s) => s.lines.includes('ins.move'));
    expect(moves.map((s) => s.say)).toEqual([
      'Move 12 from slot 2: h(12) = 12 mod 11 = 1, which is free.',
      'Move 7 from slot 3: h(7) = 7 mod 11 = 7, which is free.',
      'Move 19 from slot 4: h(19) = 19 mod 11 = 8, which is free.',
    ]);
    expect(t.entries[3]!.steps.some((s) => s.state.fresh)).toBe(true);
    expect(t.endState().fresh).toBeUndefined();
  });

  it('keeps the amortized cost near 2 with the default policy', () => {
    const t = run(Array.from({ length: 10 }, (_, i): OpCall => ['insert', i + 1]));
    expect(t.endState().total).toBe(21);
    expect(lastStep(t, 9).vars?.amortized).toBe(2.1);
  });

  it('grows only when full with threshold 1.0', () => {
    const t = run(
      [1, 6, 11, 16, 21, 26].map((k): OpCall => ['insert', k]),
      { threshold: '1.0' },
    );
    expect(t.entries[4]!.end.table.m).toBe(5);
    expect(t.endState().table.m).toBe(11);
  });

  it('matches a reference table for any sequence of operations', () => {
    const key = fc.integer({ min: 0, max: 120 });
    const call: fc.Arbitrary<OpCall> = fc.oneof(
      { weight: 5, arbitrary: key.map((k) => ['insert', k] as OpCall) },
      { weight: 2, arbitrary: key.map((k) => ['search', k] as OpCall) },
      { weight: 1, arbitrary: fc.constantFrom<OpCall>(['clear'], ['insert', 'q'], ['search', -4]) },
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 13 }),
        fc.constantFrom<Threshold>('0.5', '0.75', '1.0'),
        fc.constantFrom('prime' as const, 'double' as const),
        fc.array(call, { maxLength: 45 }),
        (m0, threshold, grow, calls) => {
          const st = settings({ m0, threshold, grow });
          const t = new Timeline(hashRehash, st, 1, calls);
          let ref = new Reference(st);
          calls.forEach(([op, raw], idx) => {
            const last = lastStep(t, idx);
            if (op === 'clear') {
              ref = new Reference(st);
              return;
            }
            if (typeof raw !== 'number' || raw < 0) {
              expect(last.lines[0]).toMatch(/\.sig$/);
              return;
            }
            if (op === 'insert') {
              const r = ref.insert(raw);
              const got = last.lines.includes('ins.dup')
                ? 'present'
                : last.lines.includes('ins.store') && last.marks.some((m) => m.role === 'error')
                  ? 'refused'
                  : 'added';
              expect(got).toBe(r);
            } else {
              const found = ref.T.includes(raw);
              expect(last.vars?.found).toBe(found);
            }
            const end = t.entries[idx]!.end;
            expect(end.fresh).toBeUndefined();
            expect(keysOf(end.table)).toEqual(ref.T);
            expect(end.total).toBe(ref.total);
            expect(end.inserts).toBe(ref.inserts);
            checkFindable(end.table);
            // α stays within the threshold, unless the table has reached the largest size.
            const m = end.table.m;
            const canGrow = (grow === 'double' ? 2 * m : nextPrime(2 * m)) <= MAX_M;
            if (canGrow) expect(sizeOf(end)).toBeLessThanOrEqual(Number(threshold) * m);
          });
          for (let i = 0; i < t.length; i++) {
            const { step } = t.at(i);
            const s = step.state;
            const keys = [...s.table.slots, ...(s.fresh?.slots ?? [])]
              .filter(Boolean)
              .map((c) => c!.key);
            expect(new Set(keys).size, 'no key twice').toBe(keys.length);
            if (s.fresh) checkFindable(s.fresh);
            expect(step.vars?.n).toBe(sizeOf(s));
            expect(step.vars?.m).toBe(s.table.m);
            expect(step.vars?.total).toBe(s.total);
          }
        },
      ),
      { numRuns: 250 },
    );
  });
});
