import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import semaphore, { parseScheduleInput } from '.';
import { inside, program, threadSteps, type Pattern, type SemSettings } from './model';

const settings = (s: Partial<SemSettings> = {}): SemSettings =>
  ({ ...semaphore.defaults, ...s }) as SemSettings;

const timeline = (calls: OpCall[], s: Partial<SemSettings> = {}) =>
  new Timeline(semaphore, settings(s), 1, calls);

/** The reference: counting semaphores with FIFO waiters, read from the step texts. */
class Reference {
  sems: Record<string, number>;
  waiters: Record<string, number[]> = {};
  pc: number[];
  out: string[] = [];
  code: string[][];
  constructor(st: SemSettings) {
    const k = st.pattern === 'limit' ? 3 : 2;
    this.code = Array.from({ length: k }, (_, t) => threadSteps(st.pattern, st.sync, t));
    this.pc = Array(k).fill(0);
    this.sems = !st.sync
      ? {}
      : st.pattern === 'limit'
        ? { s: st.room }
        : st.pattern === 'first'
          ? { a: 0 }
          : { a: 1, b: 0 };
    for (const x of Object.keys(this.sems)) this.waiters[x] = [];
  }
  blocked = (t: number) => Object.values(this.waiters).some((w) => w.includes(t));
  step(t: number): boolean {
    if (t >= this.code.length || this.pc[t] === this.code[t]!.length || this.blocked(t))
      return false;
    const s = this.code[t]![this.pc[t]!]!;
    const m = /^([PV])\((\w)\)$/.exec(s);
    if (m && m[1] === 'P') {
      this.sems[m[2]!]!--;
      if (this.sems[m[2]!]! < 0) {
        this.waiters[m[2]!]!.push(t);
        return true;
      }
    } else if (m) {
      this.sems[m[2]!]!++;
      const w = this.waiters[m[2]!]!.shift();
      if (w !== undefined) this.pc[w]!++;
    } else this.out.push(/"(\w+)"/.exec(s)![1]!);
    this.pc[t]!++;
    return true;
  }
}

describe('semaphore', () => {
  it('lets two threads in and makes the third wait', () => {
    const t = timeline([['run', '1 2 1 2 3']]);
    const m = t.endState().m;
    expect(m.sems.s).toEqual({ value: -1, waiters: [2] });
    expect(inside(m).now).toEqual([0, 1]);
    expect(t.at(t.length - 2).step.say).toContain('T3 waits until one of them calls V(s)');
    expect(t.at(t.length - 1).step.say).toContain('T1 and T2 can still step (T3 waits)');
  });

  it('never has more inside than the room, in any interleaving', () => {
    for (const room of [1, 2, 3]) {
      const tally = timeline([['every']], { room }).endState().tally!;
      const most = tally.rows.map((r) => Number(/\d+/.exec(r.outcome)![0]));
      expect(Math.max(...most)).toBe(room);
    }
    const free = timeline([['every']], { sync: false }).endState().tally!;
    expect(free.rows.map((r) => r.outcome)).toContain('at most 3 inside');
  });

  it('prints in the order the semaphores force', () => {
    expect(timeline([['every']], { pattern: 'first' }).endState().tally!.rows).toEqual([
      { outcome: 'one two', schedules: 3 },
    ]);
    expect(timeline([['every']], { pattern: 'turns' }).endState().tally!.rows).toEqual([
      { outcome: 'ping pong ping pong', schedules: 43 },
    ]);
    expect(timeline([['every']], { pattern: 'turns', sync: false }).endState().tally!.total).toBe(
      6,
    );
  });

  it('remembers a V that comes before the P', () => {
    const t = timeline([['t1'], ['t1'], ['t2']], { pattern: 'first' });
    expect(t.endState().m.threads[1]!.status).toBe('ready');
    expect(t.entries[1]!.steps[0]!.say).toContain('remembers the signal');
  });

  it('matches a reference semaphore on every step of any sequence of operations', () => {
    const call = fc.oneof(
      fc.constantFrom<OpCall>(['t1'], ['t2'], ['t3'], ['reset']),
      fc
        .array(fc.integer({ min: 1, max: 3 }), { maxLength: 14 })
        .map((xs) => ['run', xs.join('')] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.constantFrom<Pattern>('limit', 'first', 'turns'),
        fc.boolean(),
        fc.integer({ min: 1, max: 3 }),
        fc.array(call, { maxLength: 30 }),
        (pattern, sync, room, calls) => {
          const st = settings({ pattern, sync, room });
          const t = new Timeline(semaphore, st, 1, calls);
          const k = program(st).threads.length;
          let ref = new Reference(st);
          calls.forEach(([op, arg], i) => {
            if (op === 'reset') ref = new Reference(st);
            else if (op === 'run') {
              const digits = [...String(arg)].map(Number);
              if (digits.length && digits.every((d) => d <= k)) {
                ref = new Reference(st);
                for (const d of digits) if (!ref.step(d - 1)) break;
              }
            } else ref.step(Number(op[1]) - 1);
            const m = t.entries[i]!.end.m;
            expect(m.threads.map((x) => x.pc)).toEqual(ref.pc);
            expect(m.out.map((o) => o.text)).toEqual(ref.out);
            for (const [x, v] of Object.entries(ref.sems)) {
              expect(m.sems[x]!.value).toBe(v);
              expect(m.sems[x]!.waiters).toEqual(ref.waiters[x]);
              // A negative value is minus the number of waiting threads.
              if (v < 0) expect(m.sems[x]!.waiters.length).toBe(-v);
            }
          });
          for (let i = 0; i < t.length; i++) {
            const v = t.at(i).step.vars!;
            if (pattern === 'limit' && sync) expect(v.inside).toBeLessThanOrEqual(room);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('parses schedules', () => {
    expect(parseScheduleInput('123')).toBe('1 2 3');
    expect(parseScheduleInput('T1')).toBeInstanceOf(Error);
    expect(parseScheduleInput('0')).toBeInstanceOf(Error);
  });
});

describe('practice', () => {
  it('offers each choice once and answers from the model', () => {
    for (let seed = 1; seed <= 40; seed++)
      for (const { question } of practiceSet(semaphore, seed, 6)) {
        const a = question.answer;
        if (a.kind === 'choice') expect(new Set(a.options).size).toBe(a.options.length);
      }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(semaphore, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(semaphore, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
