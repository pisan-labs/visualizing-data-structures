import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { valuesArb } from '../_sorting/check';
import { load } from '../_sorting/kit';
import { monotonicQueue } from '.';
import { defaults, type Goal } from './model';

const run = (ops: OpCall[], goal: Goal = 'max') =>
  new Timeline(monotonicQueue, { ...defaults, goal }, 1, ops);

/** By brute force: scan every window. */
function refWindows(vs: number[], k: number, goal: Goal): number[] {
  const out: number[] = [];
  for (let s = 0; s + k <= vs.length; s++) {
    const part = vs.slice(s, s + k);
    out.push(goal === 'max' ? Math.max(...part) : Math.min(...part));
  }
  return out;
}

describe('monotonic queue', { timeout: 60_000 }, () => {
  for (const goal of ['max', 'min'] as const) {
    it(`finds every window's ${goal}, with the deque in order and inside the window`, () => {
      fc.assert(
        fc.property(valuesArb(1), fc.nat(), (vs, kk) => {
          const k = 1 + (kk % vs.length);
          const steps = run([load(vs), ['slide', k]], goal).entries[1]!.steps;
          const ref = refWindows(vs, k, goal);
          expect(String(steps.at(-1)!.vars!.result)).toBe(ref.join(' '));
          for (const s of steps) {
            const dq = s.extra?.deque ?? [];
            const i = Number(s.vars?.i);
            for (let j = 1; j < dq.length; j++) {
              expect(dq[j]!).toBeGreaterThan(dq[j - 1]!);
              const [p, q] = [vs[dq[j - 1]!]!, vs[dq[j]!]!];
              if (goal === 'max') expect(q).toBeLessThan(p);
              else expect(q).toBeGreaterThan(p);
            }
            // After the front check, everything in the deque is in the window.
            if (s.lines.includes('push')) for (const j of dq) expect(j).toBeGreaterThan(i - k);
            (s.extra?.out ?? []).forEach((v, w) => {
              if (v !== undefined) expect(v).toBe(ref[w]);
            });
          }
          const v = steps.at(-1)!.vars!;
          expect(v.pushes).toBe(vs.length);
          expect(Number(v.pops)).toBeLessThanOrEqual(vs.length);
        }),
        { numRuns: 300 },
      );
    });
  }

  it('explains a k it cannot use', () => {
    const t = run([load([1, 2, 3]), ['slide', 4], ['slide', 0]]);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/k must be from 1 to 3/);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/k must be from 1 to 3/);
  });

  it('follows the goal setting in its pseudocode', () => {
    const text = (goal: Goal) =>
      monotonicQueue
        .pseudocode({ ...defaults, goal })[0]!
        .lines.map((l) => l.text)
        .join('\n');
    expect(text('max')).toContain('A[D.back] ≤ A[i]');
    expect(text('min')).toContain('A[D.back] ≥ A[i]');
  });
});

describe('monotonic queue practice', () => {
  it('asks for window answers that match brute force', () => {
    for (let seed = 1; seed < 40; seed++)
      for (const { kind, question: q } of practiceSet(monotonicQueue, seed, 4)) {
        if (kind.id !== 'maxima') continue;
        const vs = String(q.setup[0]![1]).split(' ').map(Number);
        const k = Number(q.watch![0]![1]);
        const goal = (q.settings?.goal ?? 'max') as Goal;
        expect(q.answer).toEqual({
          kind: 'sequence',
          value: refWindows(vs, k, goal).map(String),
        });
      }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(monotonicQueue, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(monotonicQueue, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
