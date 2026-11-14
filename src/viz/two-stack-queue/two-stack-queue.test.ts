import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { twoStackQueue as def } from '.';
import { BOUND, MAX_SIZE, queueOf, type TQSettings } from './model';

const calls = fc.array(
  fc.oneof(
    fc.integer({ min: 0, max: 99 }).map((v): OpCall => ['enqueue', v]),
    fc.constantFrom<OpCall>(['dequeue'], ['peek']),
  ),
  { maxLength: 40 },
);
const approaches = fc.constantFrom('pattern' as const, 'naive' as const);

/** The reference: an array used as a queue, and the stack operations each design spends. */
function reference(cs: OpCall[]) {
  const q: number[] = [];
  const results: (number | null)[] = [];
  let inn = 0;
  let out = 0;
  const cost = { naive: 0, pattern: 0 };
  const each = { naive: [] as number[], pattern: [] as number[] };
  for (const [op, x] of cs) {
    let p = 0;
    let n = 0;
    if (op === 'enqueue') {
      if (q.length >= MAX_SIZE) continue;
      q.push(Number(x));
      inn++;
      p = 1;
      n = 1;
    } else if (q.length) {
      const size = q.length;
      if (out === 0) {
        p += 2 * inn;
        out = inn;
        inn = 0;
      }
      if (op === 'dequeue') {
        p += 1;
        out--;
        n = 4 * size - 1;
        results.push(q.shift()!);
      } else {
        n = 4 * size;
        results.push(q[0]!);
      }
    } else results.push(null);
    cost.naive += n;
    cost.pattern += p;
    each.naive.push(n);
    each.pattern.push(p);
  }
  return { q, results, cost, each };
}

describe('two-stack-queue', () => {
  it('is first in, first out both ways, and counts the stack operations each design spends', () => {
    fc.assert(
      fc.property(approaches, calls, (approach, cs) => {
        const settings: TQSettings = { approach };
        const t = new Timeline(def, settings, 1, cs);
        const ref = reference(cs);
        const got = t.entries
          .filter((e) => e.call[0] !== 'enqueue')
          .map((e) => {
            const r = e.steps.at(-1)!.vars?.returned;
            return r === undefined ? null : Number(r);
          });
        expect(got).toEqual(ref.results);
        const end = t.endState();
        expect(queueOf(end)).toEqual(ref.q);
        expect(end.cost).toEqual(ref.cost);
        expect(end.history).toEqual(ref.each[approach]);
        expect(end.pushes + end.pops).toBe(ref.cost[approach]);
        // The pattern never averages more than 3 stack operations per queue operation.
        expect(ref.cost.pattern).toBeLessThanOrEqual(BOUND * ref.each.pattern.length);
        for (const e of t.entries) {
          const s = e.end;
          // Between operations, the naive design keeps everything on in.
          if (approach === 'naive') expect(s.out).toEqual([]);
          else expect(s.shadow).toEqual({ inn: s.inn.length, out: s.out.length });
          // Every step shows the queue in order, wherever its values sit.
          for (const st of e.steps) {
            const pushes = Number(st.vars?.pushes);
            const pops = Number(st.vars?.pops);
            expect(pushes).toBeGreaterThanOrEqual(pops);
            const values = [...st.state.inn, ...st.state.out].map((i) => i.uid);
            expect(new Set(values).size).toBe(values.length);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('moves everything across only when out is empty', () => {
    const t = new Timeline(def, def.defaults, 1, [
      ['enqueue', 1],
      ['enqueue', 2],
      ['enqueue', 3],
      ['dequeue'],
      ['enqueue', 4],
      ['dequeue'],
    ]);
    expect(t.endState().history).toEqual([1, 1, 1, 7, 1, 1]);
    expect(t.endState().inn.map((i) => i.value)).toEqual([4]);
    expect(t.endState().out.map((i) => i.value)).toEqual([3]);
  });

  it('refuses values it cannot read and a ninth value, without counting them', () => {
    const t = new Timeline(def, def.defaults, 1, [
      ['enqueue', 'cat'],
      ...Array.from({ length: MAX_SIZE + 1 }, (_, i): OpCall => ['enqueue', i]),
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/not a whole number/);
    expect(t.entries.at(-1)!.steps[0]!.say).toMatch(/at most 8 values/);
    expect(t.endState().history).toHaveLength(MAX_SIZE);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
