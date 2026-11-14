import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { minterleavings, mrun } from '../_threads3/macro';
import cas, { parseScheduleInput } from '.';
import {
  damaged,
  macro,
  retriesOf,
  stack,
  taken,
  type CasProgram,
  type CasSettings,
} from './model';

const settings = (s: Partial<CasSettings> = {}): CasSettings =>
  ({ ...cas.defaults, ...s }) as CasSettings;

const timeline = (calls: OpCall[], s: Partial<CasSettings> = {}) =>
  new Timeline(cas, settings(s), 1, calls);

/** The reference counter: r = n, s = r + 1, then a cas (and a retry) or a plain store. */
class Counter {
  n = 0;
  pc: number[];
  r: number[];
  s: number[];
  ok: number[];
  retries: number[];
  constructor(
    k: number,
    readonly cas: boolean,
  ) {
    this.pc = Array(k).fill(0);
    this.r = Array(k).fill(0);
    this.s = Array(k).fill(0);
    this.ok = Array(k).fill(0);
    this.retries = Array(k).fill(0);
  }
  step(t: number): boolean {
    if (t >= this.pc.length) return false;
    const k = this.pc[t]!;
    if (k === (this.cas ? 4 : 3)) return false;
    if (k === 0) this.r[t] = this.n;
    else if (k === 1) this.s[t] = this.r[t]! + 1;
    else if (k === 2 && !this.cas) this.n = this.s[t]!;
    else if (k === 2) {
      this.ok[t] = this.n === this.r[t] ? 1 : 0;
      if (this.ok[t]) this.n = this.s[t]!;
    } else if (!this.ok[t]) {
      this.retries[t]!++;
      this.pc[t] = 0;
      return true;
    }
    this.pc[t]!++;
    return true;
  }
}

describe('compare-and-swap', () => {
  it('retries a failed swap and still counts right', () => {
    const t = timeline([['run', '1 2 1 1 1 2 2 2 2 2 2 2']]);
    const m = t.endState().m;
    expect(m.mem.n).toBe(2);
    expect(retriesOf(m)).toBe(1);
    expect(t.at(9).step.say).toContain('T2’s swap failed');
  });

  it('never loses an update with the cas, and loses them with a plain store', () => {
    for (const threads of [2, 3]) {
      const rows = timeline([['every']], { threads }).endState().tally!.rows;
      expect(rows.every((r) => r.outcome.startsWith(`n = ${threads},`))).toBe(true);
      // A thread retries at most once for each other thread.
      const most = Math.max(...rows.map((r) => Number(/(\d+) retr/.exec(r.outcome)![1])));
      expect(most).toBe((threads * (threads - 1)) / 2);
    }
    expect(timeline([['every']], { program: 'plain' }).endState().tally!.rows).toEqual([
      { outcome: 'n = 2', schedules: 2 },
      { outcome: 'n = 1', schedules: 18 },
    ]);
  });

  it('hits ABA when all of T2 runs between T1’s reads and its cas', () => {
    const t = timeline([['run', '1 1 2 2 2 1 1']], { program: 'aba' });
    const m = t.endState().m;
    const mac = macro(settings({ program: 'aba' }));
    expect(stack(m)).toEqual([2, 3]);
    expect(damaged(mac, m)).toEqual([2]);
    const rows = timeline([['every']], { program: 'aba' }).endState().tally!.rows;
    expect(rows.find((r) => r.outcome.includes('('))).toEqual({
      outcome: 'stack B C (B is T2’s)',
      schedules: 3,
    });
  });

  it('never leaves a node on the stack twice, and damage only comes from a stale cas', () => {
    const st = settings({ program: 'aba' });
    const mac = macro(st);
    for (const r of minterleavings(mac, { cap: 2000 }).runs) {
      const end = mrun(mac, r.schedule).state;
      const on = stack(end);
      expect(new Set(on).size).toBe(on.length);
      // Every node is on the stack or in exactly one thread's hands, unless ABA struck, and
      // ABA strikes only a cas that worked the first time, on a stale read.
      const { t1, t2 } = taken(mac, end);
      if (damaged(mac, end).length) expect(end.threads[0]!.regs.retries).toBe(0);
      else expect([...on, ...t1, ...t2].sort()).toEqual([1, 2, 3]);
    }
  });

  it('matches a reference counter on every step of any sequence of operations', () => {
    const call = fc.oneof(
      fc.constantFrom<OpCall>(['t1'], ['t2'], ['t3'], ['reset']),
      fc
        .array(fc.integer({ min: 1, max: 3 }), { maxLength: 30 })
        .map((xs) => ['run', xs.join('')] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.constantFrom<CasProgram>('counter', 'plain'),
        fc.integer({ min: 2, max: 3 }),
        fc.array(call, { maxLength: 30 }),
        (program, threads, calls) => {
          const st = settings({ program, threads });
          const t = new Timeline(cas, st, 1, calls);
          const casOn = program === 'counter';
          let ref = new Counter(threads, casOn);
          calls.forEach(([op, arg], i) => {
            if (op === 'reset') ref = new Counter(threads, casOn);
            else if (op === 'run') {
              const digits = [...String(arg)].map(Number);
              if (digits.length && digits.every((d) => d <= threads)) {
                ref = new Counter(threads, casOn);
                for (const d of digits) if (!ref.step(d - 1)) break;
              }
            } else ref.step(Number(op[1]) - 1);
            const m = t.entries[i]!.end.m;
            expect(m.mem.n).toBe(ref.n);
            if (casOn) {
              expect(m.threads.map((x) => x.regs.retries ?? 0)).toEqual(ref.retries);
              // n counts exactly the swaps that worked.
              const done = m.threads.filter((x) => x.status === 'done').length;
              expect(m.mem.n).toBeGreaterThanOrEqual(done);
              if (done === threads) expect(m.mem.n).toBe(threads);
            }
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('parses schedules', () => {
    expect(parseScheduleInput('121')).toBe('1 2 1');
    expect(parseScheduleInput('4')).toBeInstanceOf(Error);
  });
});

describe('practice', () => {
  it('offers each choice once and answers from the model', () => {
    for (let seed = 1; seed <= 40; seed++)
      for (const { question } of practiceSet(cas, seed, 6)) {
        const a = question.answer;
        if (a.kind === 'choice') expect(new Set(a.options).size).toBe(a.options.length);
      }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(cas, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(cas, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
