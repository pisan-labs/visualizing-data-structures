import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { continuousBatching, iterationLine } from '.';
import {
  ALL_SETTINGS,
  finishTime,
  fitting,
  HORIZON,
  idleCells,
  idleWaiting,
  made,
  throughput,
  wait,
  type CbSettings,
  type CbState,
  type Policy,
  type Spec,
} from './model';

/**
 * The same schedule worked out request by request instead of iteration by iteration. In line
 * order (arrival, then the order added), continuous batching gives each request the earliest
 * slot to come free; static batching starts a batch whenever every slot is free and someone is
 * waiting, and the batch lasts as long as its longest request.
 */
function reference(specs: readonly Spec[], slots: number, policy: Policy) {
  const order = specs
    .map(([arrive, , out], i) => ({ i, arrive, out }))
    .sort((a, b) => a.arrive - b.arrive || a.i - b.i);
  const start: number[] = [];
  const done: number[] = [];
  const slot: number[] = [];
  if (policy === 'continuous') {
    const free = Array<number>(slots).fill(0);
    for (const r of order) {
      const t = Math.max(r.arrive, Math.min(...free));
      const k = free.findIndex((f) => f <= t);
      start[r.i] = t;
      slot[r.i] = k;
      done[r.i] = t + r.out;
      free[k] = t + r.out;
    }
  } else {
    let t = 0;
    let next = 0;
    while (next < order.length) {
      t = Math.max(t, order[next]!.arrive);
      const batch = order
        .slice(next)
        .filter((r) => r.arrive <= t)
        .slice(0, slots);
      const end = t + Math.max(...batch.map((r) => r.out));
      batch.forEach((r, k) => {
        start[r.i] = t;
        slot[r.i] = k;
        done[r.i] = end;
      });
      next += batch.length;
      t = end;
    }
  }
  return { start, done, slot };
}

const specArb: fc.Arbitrary<Spec> = fc.tuple(
  fc.integer({ min: 0, max: 8 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 1, max: 6 }),
);
const settingsArb = fc.record({
  slots: fc.integer({ min: 2, max: 4 }),
  policy: fc.constantFrom<Policy>('continuous', 'static'),
});

const runAll = (settings: CbSettings, calls: OpCall[]) =>
  new Timeline(continuousBatching, settings, 1, calls).endState();

describe('continuous-batching', () => {
  it('matches a request-by-request schedule', () => {
    fc.assert(
      fc.property(
        settingsArb,
        fc.array(specArb, { minLength: 1, maxLength: 6 }),
        (settings, raw) => {
          const specs = fitting(raw);
          const end = runAll(settings, [...specs.map((x): OpCall => ['add', ...x]), ['run']]);
          expect(end.reqs).toHaveLength(specs.length);
          const ref = reference(specs, settings.slots, settings.policy);
          end.reqs.forEach((r, i) => {
            expect(r.start).toBe(ref.start[i]);
            expect(r.done).toBe(ref.done[i]);
            for (let t = r.start!; t < r.start! + r.out; t++)
              expect(end.chart[t]![ref.slot[i]!]!.req).toBe(r.name);
          });
          const total = specs.reduce((t, [, , n]) => t + n, 0);
          expect(end.clock).toBe(Math.max(...ref.done));
          expect(made(end)).toBe(total);
          expect(idleCells(end)).toBe(settings.slots * end.clock - total);
          // Continuous batching never leaves a slot idle while someone waits.
          if (settings.policy === 'continuous') expect(idleWaiting(end)).toBe(0);
        },
      ),
      { numRuns: 400 },
    );
  });

  it('gives the same schedule tick by tick, with requests added along the way', () => {
    fc.assert(
      fc.property(
        settingsArb,
        fc.array(
          fc.oneof(
            specArb.map((x): OpCall => ['add', ...x]),
            fc.constant<OpCall>(['tick']),
          ),
          {
            maxLength: 30,
          },
        ),
        (settings, calls) => {
          const t = new Timeline(continuousBatching, settings, 1, [...calls, ['run']]);
          const end = t.endState();
          const specs = end.reqs.map((r): Spec => [r.arrive, r.prompt, r.out]);
          const ref = reference(specs, settings.slots, settings.policy);
          end.reqs.forEach((r, i) => {
            expect(r.start).toBe(ref.start[i]);
            expect(r.done).toBe(ref.done[i]);
          });
          expect(end.clock).toBeLessThanOrEqual(HORIZON);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('keeps its invariants on every step', () => {
    fc.assert(
      fc.property(
        settingsArb,
        fc.array(
          fc.oneof(
            specArb.map((x): OpCall => ['add', ...x]),
            fc.constant<OpCall>(['tick']),
            fc.constant<OpCall>(['run']),
          ),
          { maxLength: 20 },
        ),
        (settings, calls) => {
          const t = new Timeline(continuousBatching, settings, 1, calls);
          for (let i = 0; i < t.length; i++) {
            const s: CbState = t.at(i).step.state;
            expect(s.chart).toHaveLength(s.clock);
            expect(s.read).toHaveLength(s.clock);
            expect(s.slots).toHaveLength(settings.slots);
            // A request is in at most one slot, and only after it arrived.
            const inSlots = s.slots.filter((x) => x !== null);
            expect(new Set(inSlots).size).toBe(inSlots.length);
            for (const r of s.reqs) {
              expect(r.made).toBeLessThanOrEqual(r.out);
              if (r.start !== null) expect(r.start).toBeGreaterThanOrEqual(r.arrive);
              if (r.done !== null) expect(r.done).toBeGreaterThanOrEqual(r.start! + r.out);
              const cells = s.chart.flat().filter((c) => c.req === r.name).length;
              expect(cells).toBe(r.made);
            }
            if (settings.policy === 'continuous') expect(idleWaiting(s)).toBe(0);
            expect(s.clock).toBeLessThanOrEqual(HORIZON);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('presets and practice only make requests that fit every setting', () => {
    for (const settings of ALL_SETTINGS)
      for (const p of continuousBatching.controls.presets!)
        for (const size of [3, 4, 6]) {
          const calls = p.make({ next: () => 0.99, int: (_lo, hi) => hi }, size);
          const end = runAll(settings, calls);
          expect(end.reqs).toHaveLength(calls.length - 1);
          expect(finishTime(end, settings)).toBeLessThanOrEqual(HORIZON);
        }
  });

  it('tells the story the examples and the concept page tell', () => {
    const end = (id: string, policy?: Policy) => {
      const ex = continuousBatching.examples.find((e) => e.id === id)!;
      const settings = { ...(ex.settings as CbSettings), ...(policy ? { policy } : {}) };
      return runAll(settings, ex.ops);
    };
    const st = end('static-waits');
    expect(st.reqs.map((r) => r.done)).toEqual([6, 6, 6, 9, 9]);
    expect(st.clock).toBe(9);
    expect(idleCells(st)).toBe(11);
    expect(idleWaiting(st)).toBe(7);
    expect(throughput(st)).toBe('1.78');
    const co = end('long-and-short');
    expect(co.reqs.map((r) => r.done)).toEqual([2, 6, 3, 4, 6]);
    expect(co.clock).toBe(6);
    expect(idleCells(co)).toBe(2);
    expect(throughput(co)).toBe('2.67');
    const late = end('late-arrival');
    expect(late.reqs[2]!.start).toBe(6);
    expect(end('late-arrival', 'continuous').reqs[2]!.start).toBe(1);
    expect(end('late-arrival', 'continuous').reqs[2]!.done).toBe(3);
    const long = end('one-long');
    expect([long.clock, idleCells(long), idleWaiting(long)]).toEqual([10, 15, 13]);
    expect(end('one-long', 'continuous').clock).toBe(8);
    expect(end('burst').reqs.map((r) => r.start)).toEqual([0, 0, 0, 1, 3, 5]);
    expect(throughput(end('burst'))).toBe('2.25');
    expect(end('steady').reqs.every((r) => r.start === r.arrive)).toBe(true);
    const steady = end('steady', 'static');
    expect(steady.batches[0]).toBe(0);
    expect(steady.reqs.map(wait)).toEqual([0, 2, 0, 2, 0]);
    expect(throughput(end('equal-lengths'))).toBe('3.00');
    expect(st.read.slice(0, 2)).toEqual([16, 3]);
    expect(iterationLine(st, 0)).toBe('0: A B C | -');
    expect(iterationLine(st, 5)).toBe('5: - B - | A B C');
  });

  it('refuses what does not fit', () => {
    const say = (calls: OpCall[], settings: CbSettings = { slots: 2, policy: 'static' }) => {
      const t = new Timeline(continuousBatching, settings, 1, calls);
      return t.at(t.length - 1).step.say;
    };
    expect(say([['tick']])).toMatch(/No requests yet/);
    expect(say([['add', 'A', 2, 3]])).toMatch(/three whole numbers/);
    expect(say([['add', 0, 13, 3]])).toMatch(/three whole numbers/);
    expect(say([['add', 0, 2, 1], ['tick'], ['add', 0, 2, 2]])).toMatch(/time 1 already/);
    expect(say([['add', 0, 2, 1], ['run'], ['run']])).toMatch(/Every request is done/);
    const long: OpCall[] = [0, 0, 0, 0, 0].map((a): OpCall => ['add', a, 3, 8]);
    expect(say(long)).toMatch(/chart ends at 18/);
    expect(say(long, { slots: 3, policy: 'continuous' })).toMatch(/arrives at time 0/);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(continuousBatching, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(continuousBatching, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
