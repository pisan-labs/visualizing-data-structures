import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import deadlock, { parseScheduleInput } from '.';
import { cycleText, lockOrder, type DeadlockSettings, type Order } from './model';

const settings = (s: Partial<DeadlockSettings> = {}): DeadlockSettings =>
  ({ ...deadlock.defaults, ...s }) as DeadlockSettings;

const timeline = (calls: OpCall[], s: Partial<DeadlockSettings> = {}) =>
  new Timeline(deadlock, settings(s), 1, calls);

/** The reference: locks with FIFO lines, each thread lock x, lock y, unlock y, unlock x. */
class Reference {
  holder: Record<string, number | null> = { a: null, b: null };
  line: Record<string, number[]> = { a: [], b: [] };
  pc: number[];
  waitsFor: (string | null)[];
  orders: [string, string][];
  constructor(k: number, order: Order) {
    this.orders = Array.from({ length: k }, (_, t) => lockOrder(order, t));
    this.pc = Array(k).fill(0);
    this.waitsFor = Array(k).fill(null);
  }
  step(t: number): boolean {
    if (t >= this.pc.length || this.pc[t] === 4 || this.waitsFor[t]) return false;
    const [x, y] = this.orders[t]!;
    const k = this.pc[t]!;
    if (k < 2) {
      const name = k === 0 ? x : y;
      if (this.holder[name] !== null) {
        this.line[name]!.push(t);
        this.waitsFor[t] = name;
        return true;
      }
      this.holder[name] = t;
    } else {
      const name = k === 2 ? y : x;
      const next = this.line[name]!.shift() ?? null;
      this.holder[name] = next;
      if (next !== null) {
        this.waitsFor[next] = null;
        this.pc[next]!++;
      }
    }
    this.pc[t]!++;
    return true;
  }
  /** Is some thread on a cycle? Follow "waits for the holder of" from each thread. */
  onCycle(): Set<number> {
    const on = new Set<number>();
    for (let t = 0; t < this.pc.length; t++) {
      let u: number | null = t;
      for (let i = 0; i <= this.pc.length && u !== null; i++) {
        const w: string | null = this.waitsFor[u]!;
        u = w ? this.holder[w]! : null;
        if (u === t) on.add(t);
      }
    }
    return on;
  }
}

describe('deadlock', () => {
  it('deadlocks when each thread holds its first lock, and finds the cycle', () => {
    const t = timeline([['run', '1 2 1 2'], ['cycle']]);
    const end = t.endState();
    expect(end.m.threads.every((x) => x.status === 'blocked')).toBe(true);
    expect(end.search?.cycle).toEqual([0, 1]);
    const say = t.entries[1]!.steps.map((s) => s.say);
    expect(say.some((x) => x.includes('closes a cycle'))).toBe(true);
    expect(say.at(-1)).toContain('Cycle: T1 → T2 → T1');
  });

  it('says when a schedule is already doomed', () => {
    const t = timeline([['t1'], ['t2']]);
    expect(t.entries[1]!.steps[0]!.say).toContain('every schedule ends in deadlock');
  });

  it('finds no cycle when nobody waits', () => {
    const t = timeline([['t1'], ['cycle']]);
    expect(t.endState().search?.cycle).toBeUndefined();
    expect(t.entries[1]!.steps[0]!.say).toContain('no edges');
  });

  it('counts the deadlocks, and the global order has none', () => {
    const rows = (s: Partial<DeadlockSettings>) => timeline([['every']], s).endState().tally!.rows;
    expect(rows({})).toEqual([
      { outcome: 'all done', schedules: 10 },
      { outcome: 'deadlock, T1 and T2', schedules: 4 },
    ]);
    expect(rows({ order: 'global' })).toEqual([{ outcome: 'all done', schedules: 8 }]);
    expect(rows({ order: 'global', threads: 3 }).map((r) => r.outcome)).toEqual(['all done']);
    const three = rows({ threads: 3 });
    expect(three.reduce((a, r) => a + r.schedules, 0)).toBe(254);
    expect(three.map((r) => r.outcome)).not.toContain('deadlock, T1 and T3');
  });

  it('writes a cycle from its lowest thread', () => {
    expect(cycleText([2, 1])).toBe('T2 → T3 → T2');
  });

  it('matches a reference on every step, and the search finds exactly the cycles', () => {
    const call = fc.oneof(
      fc.constantFrom<OpCall>(['t1'], ['t2'], ['t3'], ['reset'], ['cycle']),
      fc
        .array(fc.integer({ min: 1, max: 3 }), { maxLength: 12 })
        .map((xs) => ['run', xs.join('')] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 3 }),
        fc.constantFrom<Order>('opposite', 'global'),
        fc.array(call, { maxLength: 30 }),
        (threads, order, calls) => {
          const t = new Timeline(deadlock, settings({ threads, order }), 1, calls);
          let ref = new Reference(threads, order);
          calls.forEach(([op, arg], i) => {
            if (op === 'reset') ref = new Reference(threads, order);
            else if (op === 'run') {
              const digits = [...String(arg)].map(Number);
              if (digits.length && digits.every((d) => d <= threads)) {
                ref = new Reference(threads, order);
                for (const d of digits) if (!ref.step(d - 1)) break;
              }
            } else if (op !== 'cycle') ref.step(Number(op[1]) - 1);
            const end = t.entries[i]!.end;
            expect(end.m.threads.map((x) => x.pc)).toEqual(ref.pc);
            expect(end.m.locks.a!.holder).toBe(ref.holder.a);
            expect(end.m.locks.b!.holder).toBe(ref.holder.b);
            const on = ref.onCycle();
            if (op === 'cycle') expect(new Set(end.search?.cycle ?? [])).toEqual(on);
            if (order === 'global') expect(on.size).toBe(0);
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('parses schedules', () => {
    expect(parseScheduleInput('1212')).toBe('1 2 1 2');
    expect(parseScheduleInput('4')).toBeInstanceOf(Error);
  });
});

describe('practice', () => {
  it('offers each choice once and answers from the model', () => {
    for (let seed = 1; seed <= 40; seed++)
      for (const { question } of practiceSet(deadlock, seed, 6)) {
        const a = question.answer;
        if (a.kind === 'choice') expect(new Set(a.options).size).toBe(a.options.length);
      }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(deadlock, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(deadlock, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
