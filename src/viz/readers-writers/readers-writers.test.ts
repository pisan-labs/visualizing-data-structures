import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { rowNow } from '../_threads3/macro';
import rw, { parseScheduleInput } from '.';
import { history, inside, macro, type RwSettings, type Variant } from './model';

const settings = (s: Partial<RwSettings> = {}): RwSettings =>
  ({ ...rw.defaults, ...s }) as RwSettings;

const timeline = (calls: OpCall[], s: Partial<RwSettings> = {}) =>
  new Timeline(rw, settings(s), 1, calls);

/**
 * The reference read-write lock, readers first, written out by hand: a FIFO lock m, a count n,
 * and a semaphore room. Writer (thread 0): P(room), write, V(room). Reader: [lock(m), n += 1],
 * [if n == 1: P(room), unlock(m)], [read], [lock(m), n -= 1], [if n == 0: V(room), unlock(m)].
 */
class Reference {
  n = 0;
  room = 1;
  holder: number | null = null;
  mLine: number[] = [];
  roomLine: number[] = [];
  plans: string[][][];
  at: [number, number][];
  r: number[];
  waits: (string | null)[];
  constructor(k: number) {
    const reader = [
      ['lock', 'add'],
      ['first', 'unlock'],
      ['read'],
      ['lock', 'sub'],
      ['last', 'unlock'],
    ];
    this.plans = [[['P'], ['write'], ['V']], ...Array.from({ length: k }, () => reader)];
    this.at = this.plans.map(() => [0, 0]);
    this.r = this.plans.map(() => 0);
    this.waits = this.plans.map(() => null);
  }
  done = (t: number) => this.at[t]![0] === this.plans[t]!.length;
  advance(t: number) {
    const [row, part] = this.at[t]!;
    this.at[t] = part + 1 < this.plans[t]![row]!.length ? [row, part + 1] : [row + 1, 0];
  }
  wake(t: number) {
    this.waits[t] = null;
    this.advance(t);
  }
  part(t: number, what: string) {
    if (what === 'lock' && this.holder !== null) {
      this.mLine.push(t);
      this.waits[t] = 'm';
      return;
    }
    if (what === 'lock') this.holder = t;
    else if (what === 'unlock') {
      this.holder = this.mLine.shift() ?? null;
      if (this.holder !== null) this.wake(this.holder);
    } else if (what === 'add' || what === 'sub') {
      this.n += what === 'add' ? 1 : -1;
      this.r[t] = this.n;
    } else if (what === 'P' || (what === 'first' && this.r[t] === 1)) {
      if (--this.room < 0) {
        this.roomLine.push(t);
        this.waits[t] = 'room';
        return;
      }
    } else if (what === 'V' || (what === 'last' && this.r[t] === 0)) {
      this.room++;
      const w = this.roomLine.shift();
      if (w !== undefined) this.wake(w);
    }
    this.advance(t);
  }
  step(t: number): boolean {
    if (t >= this.plans.length || this.done(t) || this.waits[t]) return false;
    const row = this.at[t]![0];
    while (!this.done(t) && this.at[t]![0] === row && !this.waits[t])
      this.part(t, this.plans[t]![row]![this.at[t]![1]]!);
    return true;
  }
}

describe('readers and writers', () => {
  it('lets two readers in at once, and the writer alone', () => {
    const t = timeline([['run', 'R1 R1 R2 R2']]);
    const st = settings();
    const mac = macro(st);
    const m = t.endState().m;
    expect([1, 2].map((r) => inside(mac, m, r, st))).toEqual([true, true]);
    expect(m.mem.n).toBe(2);
    expect(m.sems.room!.value).toBe(0);
  });

  it('lets a later reader overtake the waiting writer, unless there is a turnstile', () => {
    const t = timeline([['run', 'R1 R1 R1 W R2 R2 R2 R1 R1 R2 R2 W W']]);
    expect(history(t.endState().m).overtaken).toBe(true);
    expect(t.at(8).step.say).toContain('came while W was waiting, and still got in first');
    const outcomes = (s: Partial<RwSettings>) =>
      timeline([['every']], s)
        .endState()
        .tally!.rows.map((r) => r.outcome);
    expect(outcomes({})).toContain('2 at once, W overtaken');
    expect(outcomes({ variant: 'turnstile' }).some((o) => o.includes('overtaken'))).toBe(false);
    expect(outcomes({ variant: 'mutex' })).toEqual(['1 at a time']);
  });

  it('matches a reference lock on every step, and the writer is never in with anyone', () => {
    const call = fc.oneof(
      fc.constantFrom<OpCall>(['t1'], ['t2'], ['t3'], ['t4'], ['reset']),
      fc
        .array(fc.integer({ min: 1, max: 4 }), { maxLength: 30 })
        .map((xs) => ['run', xs.join('')] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.constantFrom<Variant>('readers', 'turnstile', 'mutex'),
        fc.integer({ min: 2, max: 3 }),
        fc.array(call, { maxLength: 30 }),
        (variant, readers, calls) => {
          const st = settings({ variant, readers });
          const mac = macro(st);
          const t = new Timeline(rw, st, 1, calls);
          const k = readers + 1;
          let ref = new Reference(readers);
          calls.forEach(([op, arg], i) => {
            if (op === 'reset') ref = new Reference(readers);
            else if (op === 'run') {
              const digits = [...String(arg)].map(Number);
              if (digits.length && digits.every((d) => d <= k)) {
                ref = new Reference(readers);
                for (const d of digits) if (!ref.step(d - 1)) break;
              }
            } else ref.step(Number(op[1]) - 1);
            const m = t.entries[i]!.end.m;
            const ins = Array.from({ length: k }, (_, u) => inside(mac, m, u, st));
            if (ins[0]) expect(ins.filter(Boolean).length).toBe(1);
            if (variant === 'mutex') expect(ins.filter(Boolean).length).toBeLessThanOrEqual(1);
            if (variant === 'turnstile') expect(history(m).overtaken).toBe(false);
            if (variant !== 'readers') return;
            expect(m.mem.n).toBe(ref.n);
            expect(m.sems.room!.value).toBe(ref.room);
            expect(m.locks.m!.holder).toBe(ref.holder);
            expect(m.threads.map((_, u) => rowNow(mac, m, u))).toEqual(ref.at.map((a) => a[0]));
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('parses schedules', () => {
    expect(parseScheduleInput('R1 W r2')).toBe('R1 W R2');
    expect(parseScheduleInput('12')).toBe('1 2');
    expect(parseScheduleInput('R4')).toBeInstanceOf(Error);
  });
});

describe('practice', () => {
  it('offers each choice once and answers from the model', () => {
    for (let seed = 1; seed <= 40; seed++)
      for (const { question } of practiceSet(rw, seed, 6)) {
        const a = question.answer;
        if (a.kind === 'choice') expect(new Set(a.options).size).toBe(a.options.length);
      }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(rw, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(rw, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
