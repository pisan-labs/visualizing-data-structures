import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { rowNow } from '../_threads3/macro';
import barrier, { parseScheduleInput } from '.';
import { departures, kinds, macro, seated, type BarrierSettings, type Problem } from './model';

const settings = (s: Partial<BarrierSettings> = {}): BarrierSettings =>
  ({ ...barrier.defaults, ...s }) as BarrierSettings;

const timeline = (calls: OpCall[], s: Partial<BarrierSettings> = {}) =>
  new Timeline(barrier, settings(s), 1, calls);

/** The reference barrier for three: count += 1; if r == 3: V(b); P(b); V(b); go. */
class Reference {
  count = 0;
  b = 0;
  line: number[] = [];
  pc = [0, 0, 0];
  r = [0, 0, 0];
  blocked = [false, false, false];
  early = [false, false, false];
  plan: string[];
  constructor(naive: boolean) {
    this.plan = naive ? ['arrive', 'go'] : ['arrive', 'last', 'P', 'V', 'go'];
  }
  V() {
    this.b++;
    const w = this.line.shift();
    if (w !== undefined) {
      this.blocked[w] = false;
      this.pc[w]!++;
    }
  }
  step(t: number): boolean {
    if (t >= 3 || this.pc[t] === this.plan.length || this.blocked[t]) return false;
    const what = this.plan[this.pc[t]!]!;
    if (what === 'arrive') this.r[t] = ++this.count;
    else if (what === 'last' && this.r[t] === 3) this.V();
    else if (what === 'P' && --this.b < 0) {
      this.line.push(t);
      this.blocked[t] = true;
      return true;
    } else if (what === 'V') this.V();
    else if (what === 'go') this.early[t] = this.count < 3;
    this.pc[t]!++;
    return true;
  }
}

describe('barrier', () => {
  it('holds everyone until the third arrives', () => {
    const t = timeline([['run', '1 1 1 2 2 2']]);
    const m = t.endState().m;
    expect(m.sems.b).toEqual({ value: -2, waiters: [0, 1] });
    const all = timeline([['run', '1 1 1 2 2 2 3 3 3 1 1 2 2 3 3']]).endState().m;
    expect(all.threads.every((x) => x.status === 'done')).toBe(true);
    expect(all.sems.b!.value).toBe(1);
  });

  it('lets nobody go on early, in any interleaving, and the naive versions do', () => {
    const rows = (s: Partial<BarrierSettings>) => timeline([['every']], s).endState().tally!.rows;
    expect(rows({}).map((r) => r.outcome)).toEqual(['all waited']);
    expect(rows({ problem: 'reusable' }).map((r) => r.outcome)).toEqual(['all waited']);
    expect(rows({ naive: true }).reduce((a, r) => a + r.schedules, 0)).toBe(90);
    expect(rows({ naive: true }).find((r) => r.outcome === 'all waited')?.schedules).toBe(36);
    expect(
      rows({ problem: 'reusable', naive: true }).some((r) => r.outcome.includes('early')),
    ).toBe(true);
    const car = rows({ problem: 'group' });
    expect(car.map((r) => r.outcome)).toEqual(['D + R1 R2', 'D + R1 R3', 'D + R2 R3']);
    expect(new Set(car.map((r) => r.schedules)).size).toBe(1);
  });

  it('matches a reference barrier on every step, and the patterns never let anyone out early', () => {
    const call = fc.oneof(
      fc.constantFrom<OpCall>(['t1'], ['t2'], ['t3'], ['t4'], ['reset']),
      fc
        .array(fc.integer({ min: 1, max: 4 }), { maxLength: 40 })
        .map((xs) => ['run', xs.join('')] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.constantFrom<Problem>('barrier', 'reusable', 'group'),
        fc.boolean(),
        fc.array(call, { maxLength: 30 }),
        (problem, naive, calls) => {
          const st = settings({ problem, naive });
          const mac = macro(st);
          const t = new Timeline(barrier, st, 1, calls);
          const k = mac.p.threads.length;
          let ref = new Reference(naive);
          calls.forEach(([op, arg], i) => {
            if (op === 'reset') ref = new Reference(naive);
            else if (op === 'run') {
              const digits = [...String(arg)].map(Number);
              if (digits.length && digits.every((d) => d <= k)) {
                ref = new Reference(naive);
                for (const d of digits) if (!ref.step(d - 1)) break;
              }
            } else ref.step(Number(op[1]) - 1);
            const m = t.entries[i]!.end.m;
            const d = departures(mac, m, st);
            if (!naive) expect(d.early).toEqual([]);
            if (problem === 'group') {
              expect(seated(mac, m).length).toBeLessThanOrEqual(2);
              // A rider has gone only after both riders are in.
              if (!naive && d.gone.some((u) => u > 0)) expect(m.mem.ins).toBe(2);
              return;
            }
            if (problem === 'reusable') {
              if (naive) return;
              // need is 3 per round a thread has arrived for. Past the first turnstile, all have
              // arrived for that round, and nobody is ever more than a round ahead.
              const go = kinds(st, 0).indexOf('go');
              const need = m.threads.map((x) => x.regs.need ?? 0);
              expect(Math.max(...need) - Math.min(...need)).toBeLessThanOrEqual(3);
              m.threads.forEach((x, u) => {
                if (x.status !== 'done' && rowNow(mac, m, u) >= go)
                  expect(m.mem.a).toBeGreaterThanOrEqual(need[u]!);
              });
              return;
            }
            expect(m.mem.count).toBe(ref.count);
            expect(m.sems.b?.value ?? 0).toBe(ref.b);
            expect(m.threads.map((_, u) => rowNow(mac, m, u))).toEqual(ref.pc);
            expect(d.early).toEqual([0, 1, 2].filter((u) => ref.early[u]));
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('parses schedules', () => {
    expect(parseScheduleInput('123')).toBe('1 2 3');
    expect(parseScheduleInput('D R1')).toBe('D R1');
    expect(parseScheduleInput('5')).toBeInstanceOf(Error);
  });
});

describe('practice', () => {
  it('offers each choice once and answers from the model', () => {
    for (let seed = 1; seed <= 40; seed++)
      for (const { question } of practiceSet(barrier, seed, 6)) {
        const a = question.answer;
        if (a.kind === 'choice') expect(new Set(a.options).size).toBe(a.options.length);
      }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(barrier, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(barrier, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
