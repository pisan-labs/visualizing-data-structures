import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { differenceArray as def } from '.';
import { MAX_UPDATES, type DSettings, type Update } from './model';

/** The reference: add x to every cell, update by update. */
function reference(a: number[], us: Update[]): number[] {
  const out = [...a];
  for (const u of us) for (let i = u.l; i <= u.r; i++) out[i]! += u.x;
  return out;
}

const cases = fc
  .array(fc.integer({ min: -9, max: 9 }), { minLength: 1, maxLength: 12 })
  .chain((a) =>
    fc.record({
      a: fc.constant(a),
      us: fc.array(
        fc
          .tuple(
            fc.integer({ min: 0, max: a.length - 1 }),
            fc.integer({ min: 0, max: a.length - 1 }),
            fc.integer({ min: -9, max: 9 }),
          )
          .map(([p, q, x]) => ({ l: Math.min(p, q), r: Math.max(p, q), x })),
        { minLength: 1, maxLength: MAX_UPDATES },
      ),
    }),
  );
const approaches = fc.constantFrom('pattern' as const, 'naive' as const);

function runBatch(a: number[], us: Update[], settings: DSettings) {
  const calls: OpCall[] = [
    ['load', a.join(' ')],
    ...us.map((u): OpCall => ['add', u.l, u.r, u.x]),
    ['apply'],
  ];
  return new Timeline(def, settings, 1, calls);
}

describe('difference-array', () => {
  it('gives the reference answer both ways, and keeps every step consistent', () => {
    fc.assert(
      fc.property(cases, approaches, ({ a, us }, approach) => {
        const t = runBatch(a, us, { approach });
        const want = reference(a, us);
        expect(t.endState()).toEqual({ a: want, updates: [] });
        const steps = t.entries.at(-1)!.steps;
        const last = steps.at(-1)!;
        const n = a.length;
        const covered = us.reduce((s, u) => s + u.r - u.l + 1, 0);
        expect(last.vars?.['naive total']).toBe(covered);
        expect(last.vars?.['pattern total']).toBe(2 * us.length + n);
        expect(last.vars?.writes).toBe(approach === 'pattern' ? 2 * us.length : covered);
        expect(last.vars?.sums).toBe(approach === 'pattern' ? n : 0);
        for (const step of steps) {
          const e = step.extra!;
          expect(e.batch).toEqual(us);
          if (approach === 'naive') {
            // A is the start plus the updates done so far, plus part of the current one.
            const doneSoFar = reference(a, us.slice(0, e.done));
            if (e.cur !== undefined) {
              const u = us[e.cur]!;
              const i = step.vars!.i as number;
              const partial = reference(doneSoFar, [{ ...u, r: i }]);
              expect(step.state.a).toEqual(partial);
            } else if (step !== last) expect(step.state.a).toEqual(a);
          } else {
            const d = e.d!;
            expect(d.length).toBe(n + 1);
            // Every value of D is what the updates written so far put there.
            const written = Array(n + 1).fill(0);
            const upto = e.cur === undefined ? (e.run ? us.length : 0) : e.cur + 1;
            us.slice(0, upto).forEach((u, k) => {
              written[u.l] += u.x;
              const half = k === e.cur && step.lines.includes('start');
              if (!half) written[u.r + 1] -= u.x;
            });
            expect(d).toEqual(written);
            if (e.run) {
              // run is the running sum of D, and A is rebuilt as far as the pass has got.
              let r = 0;
              e.run.forEach((v, i) => {
                r += d[i]!;
                if (v !== null) {
                  expect(v).toBe(r);
                  expect(step.state.a[i]).toBe(want[i]);
                } else expect(step.state.a[i]).toBe(a[i]);
              });
            } else expect(step.state.a).toEqual(a);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('writes the stop of an update that reaches the last value into the spare cell', () => {
    const t = runBatch([1, 2, 3], [{ l: 0, r: 2, x: 5 }], { approach: 'pattern' });
    expect(t.entries.at(-1)!.steps.at(-1)!.extra!.d).toEqual([5, 0, 0, -5]);
    expect(t.endState().a).toEqual([6, 7, 8]);
  });

  it('refuses updates it cannot apply, and an empty queue', () => {
    const t = new Timeline(def, { approach: 'pattern' }, 1, [
      ['add', 3, 1, 2],
      ['add', 0, 8, 2],
      ['add', 'x', 1, 2],
      ['load', '1 2 3'],
      ['apply'],
      ...Array.from({ length: MAX_UPDATES + 1 }, (): OpCall => ['add', 0, 2, 1]),
    ]);
    const say = (k: number) => t.entries[k]!.steps[0]!.say;
    expect(say(0)).toMatch(/r must be at least l/);
    expect(say(1)).toMatch(/r must be from 0 to 7/);
    expect(say(2)).toMatch(/Type l as one whole number/);
    expect(say(4)).toMatch(/No updates are queued/);
    expect(say(5 + MAX_UPDATES)).toMatch(/queued already/);
    expect(t.endState().updates).toHaveLength(MAX_UPDATES);
  });

  it('reads the input box: one number for l, r or x, a list for Load', () => {
    const parse = def.controls.input!.parse;
    expect(parse('3')).toBe(3);
    expect(parse('−2')).toBe(-2);
    expect(parse('5, 3, 8')).toBe('5 3 8');
    expect(parse('100')).toBeInstanceOf(Error);
    expect(parse('1 2 x')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
