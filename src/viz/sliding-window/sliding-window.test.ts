import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { valuesArb } from '../_sorting/check';
import { load } from '../_sorting/kit';
import { slidingWindow } from '.';
import { defaults } from './model';

const run = (ops: OpCall[]) => new Timeline(slidingWindow, defaults, 1, ops);
const lastVars = (t: ReturnType<typeof run>) => t.entries.at(-1)!.steps.at(-1)!.vars ?? {};
const sumOf = (vs: number[]) => vs.reduce((a, b) => a + b, 0);

/** Every window A[i..j], by brute force. */
function windows(vs: number[]): { i: number; j: number; part: number[] }[] {
  const out: { i: number; j: number; part: number[] }[] = [];
  for (let i = 0; i < vs.length; i++)
    for (let j = i; j < vs.length; j++) out.push({ i, j, part: vs.slice(i, j + 1) });
  return out;
}

/** Each step's window region says what is inside it. */
function checkWindows(t: ReturnType<typeof run>, vs: number[], what: 'sum' | 'length') {
  for (const s of t.entries.at(-1)!.steps) {
    const w = s.extra?.regions?.find((r) => r.id === 'window');
    if (!w) continue;
    const part = vs.slice(w.from, w.to + 1);
    const want = what === 'sum' ? sumOf(part) : part.length;
    expect(w.label).toBe(`${what} = ${want}`);
    if (what === 'sum') expect(s.vars?.sum).toBe(want);
  }
}

describe('sliding window', { timeout: 60_000 }, () => {
  it('finds the largest sum of k in a row, as brute force does', () => {
    fc.assert(
      fc.property(valuesArb(1), fc.nat(), (vs, kk) => {
        const k = 1 + (kk % vs.length);
        const t = run([load(vs), ['fixed', k]]);
        const sums = windows(vs).filter((w) => w.part.length === k);
        const best = Math.max(...sums.map((w) => sumOf(w.part)));
        const v = lastVars(t);
        expect(v.result).toBe(best);
        expect(sumOf(vs.slice(Number(v.at), Number(v.at) + k))).toBe(best);
        expect(v.enters).toBe(vs.length);
        expect(v.leaves).toBe(vs.length - k);
        checkWindows(t, vs, 'sum');
      }),
      { numRuns: 300 },
    );
  });

  it('finds the shortest window with sum ≥ S, each value entering and leaving once', () => {
    fc.assert(
      fc.property(valuesArb(1), fc.integer({ min: 1, max: 400 }), (vs, S) => {
        const t = run([load(vs), ['atLeast', S]]);
        const ok = windows(vs).filter((w) => sumOf(w.part) >= S);
        const best = ok.length ? Math.min(...ok.map((w) => w.part.length)) : 0;
        const v = lastVars(t);
        expect(v.result).toBe(best);
        expect(v.enters).toBe(vs.length);
        expect(Number(v.leaves)).toBeLessThanOrEqual(vs.length);
        checkWindows(t, vs, 'sum');
      }),
      { numRuns: 300 },
    );
  });

  it('finds the longest window with no repeat, with counts that match the window', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 6 }), { minLength: 1, maxLength: 20 }),
        (vs) => {
          const t = run([load(vs), ['distinct']]);
          const ok = windows(vs).filter((w) => new Set(w.part).size === w.part.length);
          const best = Math.max(...ok.map((w) => w.part.length));
          const v = lastVars(t);
          expect(v.result).toBe(best);
          const at = Number(v.at);
          expect(new Set(vs.slice(at, at + best)).size).toBe(best);
          expect(Number(v.leaves)).toBeLessThanOrEqual(vs.length);
          checkWindows(t, vs, 'length');
          for (const s of t.entries[1]!.steps) {
            const w = s.extra?.regions?.find((r) => r.id === 'window');
            if (!w || !s.extra?.counts) continue;
            const want = new Map<number, number>();
            for (const x of vs.slice(w.from, w.to + 1)) want.set(x, (want.get(x) ?? 0) + 1);
            expect(new Map(s.extra.counts)).toEqual(want);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('explains a k or S it cannot use', () => {
    const t = run([load([1, 2, 3]), ['fixed', 5], ['atLeast', 0], ['fixed', 'cat']]);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/k must be from 1 to 3/);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/S must be from 1/);
    expect(t.entries[3]!.steps[0]!.say).toMatch(/one whole number/);
  });
});

describe('sliding window practice', () => {
  it('asks questions whose answers match brute force', () => {
    for (let seed = 1; seed < 40; seed++)
      for (const { kind, question: q } of practiceSet(slidingWindow, seed, 4)) {
        const vs = String(q.setup[0]![1]).split(' ').map(Number);
        if (kind.id === 'distinct') {
          const ok = windows(vs).filter((w) => new Set(w.part).size === w.part.length);
          expect(q.answer).toEqual({
            kind: 'number',
            value: Math.max(...ok.map((w) => w.part.length)),
          });
        }
        if (kind.id === 'max-sum') {
          const k = Number(q.watch![0]![1]);
          const best = Math.max(
            ...windows(vs)
              .filter((w) => w.part.length === k)
              .map((w) => sumOf(w.part)),
          );
          expect(q.answer).toEqual({ kind: 'number', value: best });
        }
      }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(slidingWindow, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(slidingWindow, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
