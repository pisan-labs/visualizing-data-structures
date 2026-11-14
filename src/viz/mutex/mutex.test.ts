import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import mutex, { parseScheduleInput } from '.';
import { contention, program, threadSteps, type LockMode, type MutexSettings } from './model';

const settings = (s: Partial<MutexSettings> = {}): MutexSettings =>
  ({ ...mutex.defaults, ...s }) as MutexSettings;

const timeline = (calls: OpCall[], s: Partial<MutexSettings> = {}) =>
  new Timeline(mutex, settings(s), 1, calls);

/** The reference: the steps of each thread, a lock with a FIFO line, and count. */
class Reference {
  count = 0;
  holder: number | null = null;
  line: number[] = [];
  pc: number[];
  reg: number[];
  waited = 0;
  waits = 0;
  code: string[][];
  constructor(threads: number, mode: LockMode) {
    this.code = Array.from({ length: threads }, (_, t) => threadSteps(mode, t));
    this.pc = Array(threads).fill(0);
    this.reg = Array(threads).fill(0);
  }
  step(t: number): boolean {
    if (t < 0 || t >= this.code.length) return false;
    if (this.pc[t] === this.code[t]!.length || this.line.includes(t)) return false;
    this.waited += this.line.length;
    const s = this.code[t]![this.pc[t]!]!;
    if (s === 'lock(m)') {
      if (this.holder !== null) {
        this.line.push(t);
        this.waits++;
        return true;
      }
      this.holder = t;
    } else if (s === 'unlock(m)') {
      this.holder = this.line.shift() ?? null;
      if (this.holder !== null) this.pc[this.holder]!++;
    } else if (s === 'r = count') this.reg[t] = this.count;
    else if (s === 'r = r + 1') this.reg[t]!++;
    else this.count = this.reg[t]!;
    this.pc[t]!++;
    return true;
  }
}

describe('mutex', () => {
  it('makes a second thread wait in line, and hands it the lock', () => {
    const t = timeline([['t1'], ['t2'], ['t1'], ['t1'], ['t1'], ['t1'], ['t2']]);
    const m = t.endState().m;
    expect(m.locks.m!.holder).toBe(1);
    expect(m.threads[1]!.pc).toBe(2);
    expect(t.entries[1]!.steps[0]!.say).toContain('T2 waits');
    expect(t.entries[5]!.steps[0]!.say).toContain('hands it to T2');
  });

  it('a step of a waiting thread changes nothing', () => {
    const t = timeline([['t1'], ['t2'], ['t2']]);
    expect(t.entries[2]!.steps[0]!.say).toContain('T2 is blocked');
    expect(t.endState().m.schedule).toEqual([0, 1]);
  });

  it('every interleaving with the lock ends at the right count', () => {
    for (const threads of [2, 3]) {
      const tally = timeline([['every']], { threads }).endState().tally!;
      expect(tally.rows).toEqual([
        { outcome: `count = ${threads}`, schedules: threads === 2 ? 10 : 210 },
      ]);
    }
  });

  it('loses updates with the store alone locked, and gets stuck when T1 forgets to unlock', () => {
    expect(timeline([['every']], { lock: 'store' }).endState().tally!.rows).toEqual([
      { outcome: 'count = 1', schedules: 84 },
      { outcome: 'count = 2', schedules: 8 },
    ]);
    expect(timeline([['every']], { lock: 'forget' }).endState().tally!.rows).toEqual([
      { outcome: 'count = 2', schedules: 5 },
      { outcome: 'stuck at count = 1', schedules: 4 },
    ]);
    const stuck = timeline([['run', '11112']], { lock: 'forget' });
    expect(stuck.at(stuck.length - 1).step.say).toContain('The program is stuck');
  });

  it('counts the waiting', () => {
    const t = timeline([['run', '1 2 3 1 1 1 1 2 2 2 2 3 3 3 3']], { threads: 3 });
    const p = program(settings({ threads: 3 }));
    expect(contention(p, t.endState().m)).toEqual({ waits: 2, waited: 13 });
  });

  it('matches a reference lock on every step of any sequence of operations', () => {
    const call = fc.oneof(
      fc.constantFrom<OpCall>(['t1'], ['t2'], ['t3'], ['reset']),
      fc
        .array(fc.integer({ min: 1, max: 3 }), { maxLength: 12 })
        .map((xs) => ['run', xs.join('')] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 3 }),
        fc.constantFrom<LockMode>('lock', 'store', 'forget', 'none'),
        fc.array(call, { maxLength: 30 }),
        (threads, lock, calls) => {
          const st = settings({ threads, lock });
          const t = new Timeline(mutex, st, 1, calls);
          let ref = new Reference(threads, lock);
          calls.forEach(([op, arg], k) => {
            if (op === 'reset') ref = new Reference(threads, lock);
            else if (op === 'run') {
              const digits = [...String(arg)].map(Number);
              if (digits.length && digits.every((d) => d <= threads)) {
                ref = new Reference(threads, lock);
                for (const d of digits) if (!ref.step(d - 1)) break;
              }
            } else ref.step(Number(op[1]) - 1);
            const m = t.entries[k]!.end.m;
            expect(m.mem.count).toBe(ref.count);
            expect(m.threads.map((x) => x.pc)).toEqual(ref.pc);
            expect(m.locks.m?.holder ?? null).toBe(ref.holder);
            expect(m.locks.m?.waiters ?? []).toEqual(ref.line);
            const v = t.entries[k]!.steps.at(-1)!.vars!;
            expect(v.waits).toBe(ref.waits);
            expect(v.waited).toBe(ref.waited);
          });
          // With the lock, no two threads are ever between their load and their store.
          for (let i = 0; i < t.length; i++) {
            const m = t.at(i).step.state.m;
            if (lock === 'lock') {
              const inside = m.threads.filter(
                (x) => x.pc >= 1 && x.pc <= 4 && x.status !== 'blocked',
              );
              expect(inside.length).toBeLessThanOrEqual(1);
              expect(t.at(i).step.vars?.lost).toBe(0);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('parses schedules', () => {
    expect(parseScheduleInput('1 2 1')).toBe('1 2 1');
    expect(parseScheduleInput('1,2,2')).toBe('1 2 2');
    expect(parseScheduleInput('122')).toBe('1 2 2');
    expect(parseScheduleInput('4')).toBeInstanceOf(Error);
    expect(parseScheduleInput('one')).toBeInstanceOf(Error);
    expect(parseScheduleInput('1'.repeat(41))).toBeInstanceOf(Error);
  });
});

describe('practice', () => {
  it('offers each choice once and answers from the model', () => {
    for (let seed = 1; seed <= 40; seed++)
      for (const { question } of practiceSet(mutex, seed, 6)) {
        const a = question.answer;
        if (a.kind === 'choice') expect(new Set(a.options).size).toBe(a.options.length);
      }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(mutex, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(mutex, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
