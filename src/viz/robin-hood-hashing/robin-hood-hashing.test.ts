import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { robinHoodHashing } from '.';
import { dist, type Policy, type RobinExtra, type RobinSettings, type RobinState } from './model';

type T = Timeline<RobinState, RobinSettings, RobinExtra>;
const run = (calls: OpCall[], s: Partial<RobinSettings> = {}): T =>
  new Timeline(robinHoodHashing, { ...robinHoodHashing.defaults, ...s } as RobinSettings, 1, calls);
const keysOf = (s: RobinState) => s.slots.map((c) => c?.key ?? null);

/** Robin Hood and plain linear probing, written separately from the model. */
class Reference {
  t: (number | null)[];
  constructor(
    readonly m: number,
    readonly policy: Policy,
  ) {
    this.t = Array(m).fill(null);
  }
  d(k: number, j: number) {
    return (j - (k % this.m) + this.m) % this.m;
  }
  has(k: number) {
    return this.t.includes(k);
  }
  insert(k: number) {
    if (this.has(k) || !this.t.includes(null)) return;
    let x = k;
    let j = k % this.m;
    let d = 0;
    while (this.t[j] !== null) {
      const y = this.t[j]!;
      if (this.policy === 'robin' && this.d(y, j) < d) {
        this.t[j] = x;
        x = y;
        d = this.d(x, j);
      }
      j = (j + 1) % this.m;
      d++;
    }
    this.t[j] = x;
  }
  delete(k: number) {
    let i = this.t.indexOf(k);
    if (i < 0) return;
    this.t[i] = null;
    if (this.policy === 'robin') {
      // Backward shift: pull keys back while they are away from home.
      for (
        let j = (i + 1) % this.m;
        this.t[j] !== null && this.d(this.t[j]!, j) > 0;
        j = (j + 1) % this.m
      ) {
        this.t[i] = this.t[j]!;
        this.t[j] = null;
        i = j;
      }
      return;
    }
    // Plain linear probing: take out the rest of the run and insert it again.
    const rest: number[] = [];
    for (let j = (i + 1) % this.m; this.t[j] !== null; j = (j + 1) % this.m) {
      rest.push(this.t[j]!);
      this.t[j] = null;
    }
    for (const x of rest) this.insert(x);
  }
}

describe('Robin Hood hashing', () => {
  it('takes the slot from a richer key', () => {
    const t = run([22, 33, 1, 44].map((k): OpCall => ['insert', k]));
    expect(keysOf(t.endState()).slice(0, 4)).toEqual([22, 33, 44, 1]);
    const last = t.entries.at(-1)!.steps.at(-1)!;
    expect(last.vars!['max d']).toBe(2);
    expect(last.vars!['linear max d']).toBe(3);
  });

  it('stops a search early and shifts back on delete', () => {
    const base = [22, 33, 1, 44, 4, 5].map((k): OpCall => ['insert', k]);
    const t = run([...base, ['search', 55]]);
    const last = t.entries.at(-1)!.steps.at(-1)!;
    expect(last.lines).toContain('srch.early');
    expect(last.vars!.probes).toBe(4);
    const d = run([...base, ['delete', 33]]);
    expect(d.entries.at(-1)!.steps.at(-1)!.vars!.shifts).toBe(2);
    // 22 did not move, so only the moved keys got closer to home.
    expect(d.entries.at(-1)!.steps.at(-1)!.say).toContain('each key that moved is one closer');
    expect(d.entries.at(-1)!.steps.at(-1)!.say).not.toContain('every distance');
    expect(keysOf(d.endState()).slice(0, 6)).toEqual([22, 44, 1, null, 4, 5]);
  });

  it('matches a reference table and keeps every key findable', () => {
    const key = fc.integer({ min: 0, max: 60 });
    const call: fc.Arbitrary<OpCall> = fc.oneof(
      { weight: 5, arbitrary: key.map((k) => ['insert', k] as OpCall) },
      { weight: 2, arbitrary: key.map((k) => ['search', k] as OpCall) },
      { weight: 2, arbitrary: key.map((k) => ['delete', k] as OpCall) },
      { weight: 1, arbitrary: fc.constantFrom<OpCall>(['clear'], ['insert', 'cat']) },
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 16 }),
        fc.constantFrom<Policy>('robin', 'linear'),
        fc.array(call, { maxLength: 40 }),
        (m, policy, calls) => {
          const t = run(calls, { m, policy });
          let ref = new Reference(m, policy);
          calls.forEach(([op, k], i) => {
            const last = t.entries[i]!.steps.at(-1)!;
            if (op === 'clear') ref = new Reference(m, policy);
            else if (typeof k !== 'number') return;
            else if (op === 'insert') ref.insert(k);
            else if (op === 'delete') ref.delete(k);
            else expect(last.vars!.found).toBe(ref.has(k));
            expect(keysOf(t.entries[i]!.end)).toEqual(ref.t);
          });
          for (let i = 0; i < t.length; i++) {
            const st = t.at(i).step;
            // Mid-delete, the hole is still moving along, so a gap is expected there.
            if (st.lines.includes('del.shift') || st.lines.includes('del.scan')) continue;
            const s = st.state;
            s.slots.forEach((c, j) => {
              if (!c) return;
              // No empty slot between a key and its home.
              for (let q = c.key % m; q !== j; q = (q + 1) % m) expect(s.slots[q]).not.toBeNull();
              // Robin Hood: the next key is at most one further from home.
              const next = s.slots[(j + 1) % m];
              if (policy === 'robin' && next)
                expect(dist(next.key, (j + 1) % m, m)).toBeLessThanOrEqual(dist(c.key, j, m) + 1);
            });
          }
        },
      ),
      { numRuns: 250 },
    );
  });

  it('has the same total distance as linear probing, but a smaller maximum', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 99 }), { maxLength: 12 }), (keys) => {
        const calls = keys.map((k): OpCall => ['insert', k]);
        const v = run(calls, { m: 13 }).entries.at(-1)?.steps.at(-1)?.vars;
        if (!v) return;
        expect(v['sum d']).toBe(v['linear sum d']);
        expect(Number(v['max d'])).toBeLessThanOrEqual(Number(v['linear max d']));
      }),
    );
  });

  it('keeps its text readable on a laptop and a phone', () => {
    expect(smallestText(robinHoodHashing, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(robinHoodHashing, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
