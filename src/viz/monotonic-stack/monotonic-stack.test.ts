import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { valuesArb } from '../_sorting/check';
import { load } from '../_sorting/kit';
import { monotonicStack } from '.';
import { defaults, type Find } from './model';

const run = (ops: OpCall[], find: Find = 'next-greater') =>
  new Timeline(monotonicStack, { ...defaults, find }, 1, ops);

/** By brute force: scan right (or left) from every value. */
function refNextGreater(vs: number[]): number[] {
  return vs.map((v, i) => vs.slice(i + 1).find((w) => w > v) ?? -1);
}
function refPreviousSmaller(vs: number[]): number[] {
  return vs.map((v, i) => [...vs.slice(0, i)].reverse().find((w) => w < v) ?? -1);
}
function refRectangle(h: number[]): number {
  let best = 0;
  for (let i = 0; i < h.length; i++) {
    let low = Infinity;
    for (let j = i; j < h.length; j++) {
      low = Math.min(low, h[j]!);
      best = Math.max(best, low * (j - i + 1));
    }
  }
  return best;
}

describe('monotonic stack', { timeout: 60_000 }, () => {
  for (const find of ['next-greater', 'previous-smaller'] as const) {
    it(`finds every ${find} value, with the stack in order on every step`, () => {
      fc.assert(
        fc.property(valuesArb(1), (vs) => {
          const t = run([load(vs), ['scan']], find);
          const steps = t.entries[1]!.steps;
          const ref = find === 'next-greater' ? refNextGreater(vs) : refPreviousSmaller(vs);
          expect(String(steps.at(-1)!.vars!.result)).toBe(ref.join(' '));
          for (const s of steps) {
            const stack = s.extra?.stack ?? [];
            // Indices increase; values never increase (next greater) or strictly increase.
            for (let k = 1; k < stack.length; k++) {
              expect(stack[k]!).toBeGreaterThan(stack[k - 1]!);
              const [p, q] = [vs[stack[k - 1]!]!, vs[stack[k]!]!];
              if (find === 'next-greater') expect(q).toBeLessThanOrEqual(p);
              else expect(q).toBeGreaterThan(p);
            }
            // An answer, once written, is the final one.
            (s.extra?.answers ?? []).forEach((a, i) => {
              if (a !== undefined) expect(a ?? -1).toBe(ref[i]);
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

  it('finds the largest rectangle that brute force finds, measuring each bar once', () => {
    fc.assert(
      fc.property(valuesArb(1), (vs) => {
        const steps = run([load(vs), ['histogram']]).entries[1]!.steps;
        const v = steps.at(-1)!.vars!;
        expect(v.result).toBe(refRectangle(vs));
        expect(v.pushes).toBe(vs.length);
        expect(v.pops).toBe(vs.length);
        for (const s of steps) {
          const r = s.extra?.rect;
          // A rectangle drawn really fits under the bars.
          if (r) for (let k = r.from; k <= r.to; k++) expect(vs[k]!).toBeGreaterThanOrEqual(r.h);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('follows the setting in its pseudocode', () => {
    const text = (find: Find) =>
      monotonicStack
        .pseudocode({ ...defaults, find })[0]!
        .lines.map((l) => l.text)
        .join('\n');
    expect(text('next-greater')).toContain('A[S.top] < A[i]');
    expect(text('previous-smaller')).toContain('A[S.top] ≥ A[i]');
  });
});

describe('monotonic stack practice', () => {
  it('asks questions whose answers match brute force', () => {
    for (let seed = 1; seed < 40; seed++)
      for (const { kind, question: q } of practiceSet(monotonicStack, seed, 4)) {
        const vs = String(q.setup[0]![1]).split(' ').map(Number);
        if (kind.id === 'rectangle')
          expect(q.answer).toEqual({ kind: 'number', value: refRectangle(vs) });
        if (kind.id === 'answers') {
          const ref =
            q.settings?.find === 'previous-smaller' ? refPreviousSmaller(vs) : refNextGreater(vs);
          expect(q.answer).toEqual({ kind: 'sequence', value: ref.map(String) });
        }
      }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(monotonicStack, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(monotonicStack, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
