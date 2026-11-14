import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import producerConsumer, { parseScheduleInput } from '.';
import { type PcSettings, type Sync } from './model';

const settings = (s: Partial<PcSettings> = {}): PcSettings =>
  ({ ...producerConsumer.defaults, ...s }) as PcSettings;

const timeline = (calls: OpCall[], s: Partial<PcSettings> = {}) =>
  new Timeline(producerConsumer, settings(s), 1, calls);

/**
 * The reference: the buffer program written out by hand, with a FIFO lock, Mesa condition
 * variables (a woken thread joins the lock's line) and counting semaphores.
 */
class Reference {
  n: number;
  holder: number | null = null;
  line: number[] = [];
  sleep: Record<string, number[]> = { room: [], item: [] };
  sems: Record<string, number>;
  semLine: Record<string, number[]> = { spaces: [], items: [] };
  pc = [0, 0, 0];
  r = [0, 0, 0];
  blocked = [false, false, false];
  constructor(
    readonly sync: Sync,
    readonly size: number,
    start: number,
  ) {
    this.n = start;
    this.sems = { spaces: size - start, items: start };
  }
  release() {
    this.holder = this.line.shift() ?? null;
    if (this.holder !== null) {
      this.blocked[this.holder] = false;
      this.pc[this.holder]!++;
    }
  }
  lock(t: number): boolean {
    if (this.holder !== null) {
      this.line.push(t);
      this.blocked[t] = true;
      return false;
    }
    this.holder = t;
    return true;
  }
  step(t: number): boolean {
    const len = this.sync === 'sem' ? 6 : this.sync === 'while' ? 9 : 8;
    if (this.pc[t] === len || this.blocked[t]) return false;
    const prod = t === 0;
    const k = this.pc[t]!;
    if (this.sync === 'sem') {
      const [mine, other] = prod ? ['spaces', 'items'] : ['items', 'spaces'];
      if (k === 0) {
        this.sems[mine]!--;
        if (this.sems[mine]! < 0) {
          this.semLine[mine]!.push(t);
          this.blocked[t] = true;
          return true;
        }
      } else if (k === 1) {
        if (!this.lock(t)) return true;
      } else if (k === 2) this.r[t] = this.n + (prod ? 1 : -1);
      else if (k === 3) this.n = this.r[t]!;
      else if (k === 4) this.release();
      else {
        this.sems[other]!++;
        const w = this.semLine[other]!.shift();
        if (w !== undefined) {
          this.blocked[w] = false;
          this.pc[w]!++;
        }
      }
      this.pc[t]!++;
      return true;
    }
    // Lock and condition variables; the if version has no "goto t" (step 4).
    const loop = this.sync === 'while';
    const at = (i: number) => (loop || i < 4 ? i : i + 1); // map if-steps onto while-steps
    const kk = at(k);
    if (kk === 0) {
      if (!this.lock(t)) return true;
    } else if (kk === 1) this.r[t] = (prod ? this.n < this.size : this.n > 0) ? 1 : 0;
    else if (kk === 2) {
      if (this.r[t]) {
        this.pc[t] = loop ? 5 : 4;
        return true;
      }
    } else if (kk === 3) {
      this.release();
      this.sleep[prod ? 'room' : 'item']!.push(t);
      this.blocked[t] = true;
      return true;
    } else if (kk === 4) {
      this.pc[t] = 1;
      return true;
    } else if (kk === 5) this.r[t] = this.n + (prod ? 1 : -1);
    else if (kk === 6) this.n = this.r[t]!;
    else if (kk === 7) {
      const w = this.sleep[prod ? 'item' : 'room']!.shift();
      if (w !== undefined) this.line.push(w);
    } else this.release();
    this.pc[t]!++;
    return true;
  }
}

describe('producer-consumer', () => {
  it('makes the producer wait while the buffer is full', () => {
    const t = timeline([['t1'], ['t1'], ['t1'], ['t1']]);
    const m = t.endState().m;
    expect(m.conds.room!.waiters).toEqual([0]);
    expect(m.locks.m!.holder).toBeNull();
    expect(t.entries[1]!.steps[0]!.say).toContain('the buffer is full');
  });

  it('every interleaving ends with every item taken once, with while or semaphores', () => {
    for (const sync of ['while', 'sem'] as const)
      for (const size of [1, 2]) {
        const rows = timeline([['every']], { sync, size, start: 1 }).endState().tally!.rows;
        expect(rows.map((r) => r.outcome)).toEqual(['n = 0']);
      }
  });

  it('with if and an empty start, some interleavings take an item that is not there', () => {
    const tally = timeline([['every']], { sync: 'if', start: 0 }).endState().tally!;
    expect(tally.total).toBe(284);
    const bad = tally.rows.filter((r) => r.outcome.includes('took nothing'));
    expect(bad.reduce((a, r) => a + r.schedules, 0)).toBe(52);
    const ok = timeline([['every']], { sync: 'while', start: 0 }).endState().tally!;
    expect(ok.rows.every((r) => r.outcome.includes('still') || r.outcome.includes('waits'))).toBe(
      true,
    );
  });

  it('runs the steal: with if, C1 takes nothing; with while, it checks again', () => {
    const sched = '2 2 2 2 1 1 1 1 3 1 1 1 3 3 3 3 3 3 2 2 2 2';
    expect(timeline([['run', sched]], { sync: 'if', start: 0 }).endState().m.mem.n).toBe(-1);
    const w = timeline([['run', sched]], { sync: 'while', start: 0 });
    expect(w.endState().m.mem.n).toBe(0);
    expect(w.endState().m.conds.item!.waiters).toEqual([1]);
    expect(w.at(w.length - 1).step.vars?.rechecks).toBe(1);
  });

  it('matches a reference buffer on every step of any sequence of operations', () => {
    const call = fc.oneof(
      fc.constantFrom<OpCall>(['t1'], ['t2'], ['t3'], ['reset']),
      fc
        .array(fc.integer({ min: 1, max: 3 }), { maxLength: 20 })
        .map((xs) => ['run', xs.join('')] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.constantFrom<Sync>('while', 'if', 'sem'),
        fc.integer({ min: 1, max: 2 }),
        fc.integer({ min: 0, max: 1 }),
        fc.array(call, { maxLength: 40 }),
        (sync, size, start, calls) => {
          const t = new Timeline(producerConsumer, settings({ sync, size, start }), 1, calls);
          let ref = new Reference(sync, size, start);
          calls.forEach(([op, arg], i) => {
            if (op === 'reset') ref = new Reference(sync, size, start);
            else if (op === 'run') {
              const digits = [...String(arg)].map(Number);
              if (digits.length) {
                ref = new Reference(sync, size, start);
                for (const d of digits) if (!ref.step(d - 1)) break;
              }
            } else ref.step(Number(op[1]) - 1);
            const m = t.entries[i]!.end.m;
            expect(m.mem.n).toBe(ref.n);
            expect(m.threads.map((x) => x.pc)).toEqual(ref.pc);
            expect(m.locks.m!.holder).toBe(ref.holder);
            expect(m.locks.m!.waiters).toEqual(ref.line);
            if (sync === 'sem') {
              expect(m.sems.spaces!.value).toBe(ref.sems.spaces);
              expect(m.sems.items!.value).toBe(ref.sems.items);
            } else {
              expect(m.conds.room!.waiters).toEqual(ref.sleep.room);
              expect(m.conds.item!.waiters).toEqual(ref.sleep.item);
            }
          });
          // With while or semaphores, n never leaves 0 to size.
          if (sync !== 'if')
            for (let i = 0; i < t.length; i++) {
              const n = t.at(i).step.state.m.mem.n!;
              expect(n).toBeGreaterThanOrEqual(0);
              expect(n).toBeLessThanOrEqual(size);
            }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('parses schedules', () => {
    expect(parseScheduleInput('P1 c1 2')).toBe('P1 C1 2');
    expect(parseScheduleInput('123')).toBe('1 2 3');
    expect(parseScheduleInput('P2')).toBeInstanceOf(Error);
    expect(parseScheduleInput('4')).toBeInstanceOf(Error);
  });
});

describe('practice', () => {
  it('offers each choice once and answers from the model', () => {
    for (let seed = 1; seed <= 30; seed++)
      for (const { question } of practiceSet(producerConsumer, seed, 6)) {
        const a = question.answer;
        if (a.kind === 'choice') expect(new Set(a.options).size).toBe(a.options.length);
      }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(producerConsumer, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(producerConsumer, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
