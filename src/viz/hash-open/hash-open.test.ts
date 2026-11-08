import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { loadFactor } from '../_hashing/hashing';
import { hashOpen } from '.';
import {
  delCount,
  liveCount,
  probeSeq,
  type OpenExtra,
  type OpenSettings,
  type OpenState,
  type Probing,
} from './model';

type T = Timeline<OpenState, OpenSettings, OpenExtra>;
type RefSlot = number | 'DEL' | null;

const settings = (s: Partial<OpenSettings> = {}): OpenSettings =>
  ({ ...hashOpen.defaults, ...s }) as OpenSettings;
const run = (calls: OpCall[], s: Partial<OpenSettings> = {}): T =>
  new Timeline(hashOpen, settings(s), 1, calls);
const lastStep = (t: T, k: number) => t.entries[k]!.steps.at(-1)!;
const slotsOf = (s: OpenState): RefSlot[] =>
  s.slots.map((c) => (c === null ? null : c.del ? 'DEL' : c.key));

/** A plain open-addressing table written separately from the model, to compare against. */
class Reference {
  T: RefSlot[];
  constructor(
    readonly m: number,
    readonly at: (k: number, i: number) => number,
  ) {
    this.T = Array(m).fill(null);
  }
  insert(k: number): 'added' | 'present' | 'full' {
    let d = -1;
    for (let i = 0; i < this.m; i++) {
      const j = this.at(k, i);
      if (this.T[j] === null) {
        this.T[d >= 0 ? d : j] = k;
        return 'added';
      }
      if (this.T[j] === 'DEL') {
        if (d < 0) d = j;
      } else if (this.T[j] === k) return 'present';
    }
    if (d >= 0) {
      this.T[d] = k;
      return 'added';
    }
    return 'full';
  }
  search(k: number): { slot: number; probes: number } {
    for (let i = 0; i < this.m; i++) {
      const j = this.at(k, i);
      if (this.T[j] === null) return { slot: -1, probes: i + 1 };
      if (this.T[j] === k) return { slot: j, probes: i + 1 };
    }
    return { slot: -1, probes: this.m };
  }
  delete(k: number): boolean {
    const { slot } = this.search(k);
    if (slot < 0) return false;
    this.T[slot] = 'DEL';
    return true;
  }
}

/** Every live key can be found: its probe sequence reaches it without an empty slot first. */
function checkFindable(s: OpenState, st: OpenSettings) {
  const keys = s.slots.filter((c) => c && !c.del).map((c) => c!.key);
  expect(new Set(keys).size, 'no key twice').toBe(keys.length);
  s.slots.forEach((c, j) => {
    if (!c || c.del) return;
    const seq = probeSeq(c.key, s.m, st);
    for (let i = 0; i < s.m; i++) {
      const at = seq.at(i);
      if (at === j) return;
      expect(s.slots[at], `${c.key}'s probe ${i} passes an empty slot`).not.toBeNull();
    }
    throw new Error(`${c.key} is not on its own probe sequence`);
  });
}

describe('open addressing', () => {
  it('shows each probe with the formula and real numbers', () => {
    const t = run([
      ['insert', 22],
      ['insert', 33],
    ]);
    const says = t.entries[1]!.steps.map((s) => s.say);
    expect(says[0]).toContain('h(33) = 33 mod 11 = 0');
    expect(says[1]).toContain('Probe 0: j = (0 + 0) mod 11 = 0');
    expect(says.at(-1)).toContain('Probe 1: j = (0 + 1) mod 11 = 1');
    expect(lastStep(t, 1).vars?.probes).toBe(2);
    const d = run([['insert', 33]], { probe: 'double' });
    expect(d.entries[0]!.steps[0]!.say).toContain('h2(33) = 1 + (33 mod 10) = 4');
    const p = run([['insert', 33]], { probe: 'double', h2: 'prime' });
    expect(p.entries[0]!.steps[0]!.say).toContain('h2(33) = 7 − (33 mod 7) = 2');
  });

  it('search skips a tombstone and insert reuses the first one', () => {
    const t = run([
      ['insert', 22],
      ['insert', 33],
      ['insert', 44],
      ['delete', 33],
      ['search', 44],
      ['insert', 55],
    ]);
    expect(lastStep(t, 4).vars?.found).toBe(true);
    expect(lastStep(t, 4).vars?.probes).toBe(3);
    expect(lastStep(t, 5).lines).toContain('ins.reuse');
    expect(slotsOf(t.endState()).slice(0, 4)).toEqual([22, 55, 44, null]);
  });

  it('explains quadratic probing that cannot reach the empty slots', () => {
    const t = run(
      [
        ['insert', 0],
        ['insert', 1],
        ['insert', 2],
        ['insert', 4],
        ['insert', 7],
      ],
      {
        m: 7,
        probe: 'quadratic',
      },
    );
    const last = lastStep(t, 4);
    expect(last.lines).toContain('ins.full');
    expect(last.say).toContain('3 slots are still empty (3, 5, 6)');
    expect(last.say).toContain('visited 0, 1, 4, 2');
    // Repeated slots are fine detail.
    expect(t.entries[4]!.steps.filter((s) => s.level === 3).length).toBe(3);
  });

  it('matches a reference table for any sequence of operations', () => {
    const key = fc.integer({ min: 0, max: 60 });
    const call: fc.Arbitrary<OpCall> = fc.oneof(
      { weight: 3, arbitrary: key.map((k) => ['insert', k] as OpCall) },
      { weight: 2, arbitrary: key.map((k) => ['search', k] as OpCall) },
      { weight: 2, arbitrary: key.map((k) => ['delete', k] as OpCall) },
      {
        weight: 1,
        arbitrary: fc.constantFrom<OpCall>(['clear'], ['insert', 'cat'], ['search', -1]),
      },
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 13 }),
        fc.constantFrom<Probing>('linear', 'quadratic', 'triangular', 'double'),
        fc.constantFrom('clrs' as const, 'prime' as const),
        fc.array(call, { maxLength: 40 }),
        (m, probe, h2, calls) => {
          const st = settings({ m, probe, h2 });
          const t = new Timeline(hashOpen, st, 1, calls);
          let ref = new Reference(m, (k, i) => probeSeq(k, m, st).at(i));
          calls.forEach(([op, raw], idx) => {
            const last = lastStep(t, idx);
            if (op === 'clear') {
              ref = new Reference(m, ref.at);
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
                : last.lines.includes('ins.full')
                  ? 'full'
                  : 'added';
              expect(got).toBe(r);
            } else if (op === 'search') {
              const r = ref.search(raw);
              expect(last.vars?.found).toBe(r.slot >= 0);
              expect(last.vars?.probes).toBe(r.probes);
              if (r.slot >= 0) expect(last.vars?.j).toBe(r.slot);
            } else {
              expect(last.lines.includes('del.mark')).toBe(ref.delete(raw));
            }
            expect(slotsOf(t.entries[idx]!.end)).toEqual(ref.T);
          });
          for (let i = 0; i < t.length; i++) {
            const { step } = t.at(i);
            const s = step.state;
            expect(s.slots.length).toBe(m);
            expect(step.vars?.n).toBe(liveCount(s));
            expect(step.vars?.deleted).toBe(delCount(s));
            expect(step.vars?.α).toBe(loadFactor(liveCount(s), m));
            const uids = s.slots.filter(Boolean).map((c) => c!.uid);
            expect(new Set(uids).size).toBe(uids.length);
            checkFindable(s, st);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('linear probing fails only when no slot is free', () => {
    const calls: OpCall[] = [3, 8, 13, 18, 23, 28].map((k) => ['insert', k]);
    const t = run(calls, { m: 5 });
    expect(lastStep(t, 5).lines).toContain('ins.full');
    expect(lastStep(t, 5).say).toContain('the table is full');
  });
});
