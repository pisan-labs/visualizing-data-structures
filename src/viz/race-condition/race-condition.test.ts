import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import raceCondition, { parseScheduleInput } from '.';
import { expected, program, stores, type RaceSettings } from './model';

const settings = (s: Partial<RaceSettings> = {}): RaceSettings => ({
  ...raceCondition.defaults,
  ...s,
});

const timeline = (calls: OpCall[], s: Partial<RaceSettings> = {}) =>
  new Timeline(raceCondition, settings(s), 1, calls);

/** The reference: count, and each thread's next step and register, three steps an increment. */
class Reference {
  count = 0;
  pc: number[];
  reg: number[];
  constructor(
    readonly threads: number,
    readonly steps: number,
  ) {
    this.pc = Array(threads).fill(0);
    this.reg = Array(threads).fill(0);
  }
  step(t: number): boolean {
    if (t < 0 || t >= this.threads || this.pc[t] === this.steps) return false;
    const part = this.pc[t]! % 3;
    if (part === 0) this.reg[t] = this.count;
    else if (part === 1) this.reg[t]! += 1;
    else this.count = this.reg[t]!;
    this.pc[t]!++;
    return true;
  }
}

describe('race condition', () => {
  it('loses an update when both threads load before either stores', () => {
    const t = timeline([['t1'], ['t2'], ['t1'], ['t1'], ['t2'], ['t2']]);
    expect(t.endState().m.mem.count).toBe(1);
    const last = t.at(t.length - 1).step;
    expect(last.say).toContain('One update was lost');
    expect(last.marks).toContainEqual({ id: 'var-count', role: 'error' });
    expect(t.entries[1]!.steps[0]!.say).toContain('an increment will be lost');
  });

  it('runs a schedule from the start, and stops at a thread with no steps left', () => {
    const t = timeline([['t1'], ['run', '111222']]);
    expect(t.endState().m.mem.count).toBe(2);
    expect(t.endState().m.schedule).toEqual([0, 0, 0, 1, 1, 1]);
    const stopped = timeline([['run', '11112']]);
    expect(stopped.endState().m.schedule).toEqual([0, 0, 0]);
    expect(stopped.at(stopped.length - 1).step.lines).toEqual(['run.stop']);
  });

  it('counts every interleaving: 18 of 20 lose an update', () => {
    const t = timeline([['every']]);
    expect(t.endState().tally?.rows).toEqual([
      { count: 1, schedules: 18 },
      { count: 2, schedules: 2 },
    ]);
    expect(t.endState().m.schedule).toEqual([]);
    expect(t.entries[0]!.steps).toHaveLength(1 + 20 + 1);
  });

  it('counts from the current state', () => {
    const t = timeline([['t1'], ['every']]);
    expect(t.endState().tally).toEqual({
      rows: [
        { count: 1, schedules: 9 },
        { count: 2, schedules: 1 },
      ],
      total: 10,
      from: 1,
    });
  });

  it('counts the 17 million schedules of three threads by state', () => {
    const t = timeline([['every']], { threads: 3, times: 2 });
    const tally = t.endState().tally!;
    expect(tally.total).toBe(17153136);
    expect(tally.rows.at(-1)).toEqual({ count: 6, schedules: 90 });
    expect(t.entries[0]!.steps[0]!.say).toContain('counts them by state');
  });

  it('refuses a thread that does not exist without changing anything', () => {
    const t = timeline([['t3'], ['run', '19']]);
    expect(t.entries[0]!.steps[0]!.say).toContain('Set Threads to 3');
    expect(t.endState().m.schedule).toEqual([0]);
  });

  it('matches a reference counter on every step of any sequence of operations', () => {
    const call = fc.oneof(
      fc.constantFrom<OpCall>(['t1'], ['t2'], ['t3'], ['reset']),
      fc
        .array(fc.integer({ min: 1, max: 3 }), { maxLength: 8 })
        .map((xs) => ['run', xs.join('')] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 3 }),
        fc.integer({ min: 1, max: 2 }),
        fc.array(call, { maxLength: 30 }),
        (threads, times, calls) => {
          const st = settings({ threads, times });
          const t = new Timeline(raceCondition, st, 1, calls);
          let ref = new Reference(threads, 3 * times);
          calls.forEach(([op, arg], k) => {
            const check = () => {
              const m = t.entries[k]!.end.m;
              expect(m.mem.count).toBe(ref.count);
              expect(m.threads.map((x) => x.pc)).toEqual(ref.pc);
              expect(m.threads.map((x) => x.regs.r)).toEqual(ref.reg);
            };
            if (op === 'reset') ref = new Reference(threads, 3 * times);
            else if (op === 'run') {
              // An empty schedule is refused and changes nothing.
              if (String(arg) === '') return check();
              ref = new Reference(threads, 3 * times);
              for (const d of String(arg)) if (!ref.step(Number(d) - 1)) break;
            } else ref.step(Number(op[1]) - 1);
            check();
          });
          const p = program(st);
          for (let i = 0; i < t.length; i++) {
            const { step } = t.at(i);
            const m = step.state.m;
            expect(step.vars?.count).toBe(m.mem.count);
            expect(m.mem.count).toBeLessThanOrEqual(stores(m));
            expect(step.vars?.lost).toBe(stores(m) - m.mem.count!);
            expect(m.schedule.length).toBe(m.threads.reduce((a, x) => a + x.pc, 0));
            expect(step.vars?.expected).toBe(expected(p));
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('parses schedules', () => {
    expect(parseScheduleInput('1 2 1')).toBe('121');
    expect(parseScheduleInput('1,2,2')).toBe('122');
    expect(parseScheduleInput('4')).toBeInstanceOf(Error);
    expect(parseScheduleInput('one')).toBeInstanceOf(Error);
    expect(parseScheduleInput('1'.repeat(19))).toBeInstanceOf(Error);
  });
});

describe('practice', () => {
  it('offers each choice once and answers from the model', () => {
    for (let seed = 1; seed <= 60; seed++)
      for (const { question } of practiceSet(raceCondition, seed, 6)) {
        const a = question.answer;
        if (a.kind === 'choice') expect(new Set(a.options).size).toBe(a.options.length);
      }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(raceCondition, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(raceCondition, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
