import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { stuck } from '../_threads/machine';
import { rowNow } from '../_threads3/macro';
import dining, { parseScheduleInput } from '.';
import { eating, forkOrder, holders, macro, type DiningSettings, type Fix } from './model';

const settings = (s: Partial<DiningSettings> = {}): DiningSettings =>
  ({ ...dining.defaults, ...s }) as DiningSettings;

const timeline = (calls: OpCall[], s: Partial<DiningSettings> = {}) =>
  new Timeline(dining, settings(s), 1, calls);

/** The reference: forks as locks with FIFO lines, the waiter as a counting semaphore. */
class Reference {
  holder: (number | null)[];
  line: number[][];
  seats: number;
  seatLine: number[] = [];
  pc: number[];
  waits: (string | null)[];
  plans: [string, number][][];
  constructor(n: number, fix: Fix) {
    this.holder = Array(n).fill(null);
    this.line = Array.from({ length: n }, () => []);
    this.seats = n - 1;
    this.pc = Array(n).fill(0);
    this.waits = Array(n).fill(null);
    this.plans = Array.from({ length: n }, (_, t) => {
      const [a, b] = forkOrder(n, fix, t);
      const steps: [string, number][] = [
        ['take', a],
        ['take', b],
        ['eat', t],
        ['put', b],
        ['put', a],
      ];
      return fix === 'waiter' ? [['sit', 0], ...steps, ['leave', 0]] : steps;
    });
  }
  wake(t: number) {
    this.waits[t] = null;
    this.pc[t]!++;
  }
  step(t: number): boolean {
    if (t >= this.pc.length || this.pc[t] === this.plans[t]!.length || this.waits[t]) return false;
    const [kind, f] = this.plans[t]![this.pc[t]!]!;
    if (kind === 'take') {
      if (this.holder[f] !== null) {
        this.line[f]!.push(t);
        this.waits[t] = `f${f + 1}`;
        return true;
      }
      this.holder[f] = t;
    } else if (kind === 'put') {
      const next = this.line[f]!.shift() ?? null;
      this.holder[f] = next;
      if (next !== null) this.wake(next);
    } else if (kind === 'sit') {
      if (--this.seats < 0) {
        this.seatLine.push(t);
        this.waits[t] = 'waiter';
        return true;
      }
    } else if (kind === 'leave') {
      this.seats++;
      const w = this.seatLine.shift();
      if (w !== undefined) this.wake(w);
    }
    this.pc[t]!++;
    return true;
  }
}

describe('dining philosophers', () => {
  it('deadlocks when everyone holds a left fork, with the cycle in the narration', () => {
    const t = timeline([['run', '1 2 3 1 2 3']]);
    const m = t.endState().m;
    expect(stuck(m)).toBe(true);
    expect(holders(m, 3)).toEqual([0, 1, 2]);
    expect(t.at(t.length - 1).step.say).toContain('P1 → P2 → P3 → P1');
    expect(t.at(4).step.say).toContain('every schedule ends in deadlock');
  });

  it('counts the deadlocks, and both fixes have none', () => {
    const rows = (s: Partial<DiningSettings>) => timeline([['every']], s).endState().tally!.rows;
    expect(rows({})).toEqual([
      { outcome: 'all ate', schedules: 3003 },
      { outcome: 'deadlock', schedules: 48 },
    ]);
    for (const fix of ['order', 'waiter'] as Fix[])
      for (const philosophers of [3, 4])
        expect(rows({ fix, philosophers }).map((r) => r.outcome)).toEqual(['all ate']);
    expect(rows({ philosophers: 4 }).find((r) => r.outcome === 'deadlock')?.schedules).toBe(1088);
  });

  it('lets P3 wait with empty hands when it reaches right first', () => {
    const t = timeline([['run', '1 2 3']], { fix: 'order' });
    const m = t.endState().m;
    expect(m.threads[2]!.status).toBe('blocked');
    expect(holders(m, 3)).toEqual([0, 1, null]);
  });

  it('matches a reference table on every step of any sequence of operations', () => {
    const call = fc.oneof(
      fc.constantFrom<OpCall>(['t1'], ['t2'], ['t3'], ['t4'], ['reset']),
      fc
        .array(fc.integer({ min: 1, max: 4 }), { maxLength: 24 })
        .map((xs) => ['run', xs.join('')] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 4 }),
        fc.constantFrom<Fix>('none', 'order', 'waiter'),
        fc.array(call, { maxLength: 30 }),
        (n, fix, calls) => {
          const st = settings({ philosophers: n, fix });
          const t = new Timeline(dining, st, 1, calls);
          const mac = macro(st);
          let ref = new Reference(n, fix);
          calls.forEach(([op, arg], i) => {
            if (op === 'reset') ref = new Reference(n, fix);
            else if (op === 'run') {
              const digits = [...String(arg)].map(Number);
              if (digits.length && digits.every((d) => d <= n)) {
                ref = new Reference(n, fix);
                for (const d of digits) if (!ref.step(d - 1)) break;
              }
            } else ref.step(Number(op[1]) - 1);
            const m = t.entries[i]!.end.m;
            expect(holders(m, n)).toEqual(ref.holder);
            expect(m.threads.map((_, u) => rowNow(mac, m, u))).toEqual(ref.pc);
            // Neighbours never eat at once, and the fixes never get stuck.
            const e = eating(m, n);
            for (const a of e) expect(e).not.toContain((a + 1) % n);
            if (fix !== 'none') expect(stuck(m)).toBe(false);
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('parses schedules', () => {
    expect(parseScheduleInput('123')).toBe('1 2 3');
    expect(parseScheduleInput('P2 P1')).toBe('P2 P1');
    expect(parseScheduleInput('5')).toBeInstanceOf(Error);
  });
});

describe('practice', () => {
  it('offers each choice once and answers from the model', () => {
    for (let seed = 1; seed <= 40; seed++)
      for (const { question } of practiceSet(dining, seed, 6)) {
        const a = question.answer;
        if (a.kind === 'choice') expect(new Set(a.options).size).toBe(a.options.length);
      }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(dining, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(dining, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
