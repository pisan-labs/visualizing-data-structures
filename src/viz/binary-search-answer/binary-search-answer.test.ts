import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { binarySearchAnswer as def } from '.';
import { cost, type BASettings, type Problem } from './model';

/** The reference: days by brute force, every capacity from the heaviest package up. */
function refShip(w: number[], d: number): { answer: number; ok: (c: number) => boolean } {
  const ok = (c: number) => {
    if (c < Math.max(...w)) return false;
    let days = 1;
    let load = 0;
    for (const x of w) {
      if (load + x > c) {
        days++;
        load = 0;
      }
      load += x;
    }
    return days <= d;
  };
  let c = Math.max(...w);
  while (!ok(c)) c++;
  return { answer: c, ok };
}

/** The reference: the largest smallest gap over every way to choose k of the positions. */
function refSpread(p: number[], k: number): { answer: number; ok: (g: number) => boolean } {
  let best = 0;
  const choose = (start: number, picked: number[]) => {
    if (picked.length === k) {
      let gap = Infinity;
      for (let i = 1; i < k; i++) gap = Math.min(gap, picked[i]! - picked[i - 1]!);
      best = Math.max(best, gap);
      return;
    }
    for (let i = start; i < p.length; i++) choose(i + 1, [...picked, p[i]!]);
  };
  choose(0, []);
  return { answer: best, ok: (g: number) => g <= best };
}

const approaches = fc.constantFrom('pattern' as const, 'naive' as const);
const ship = fc.record({
  w: fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 2, maxLength: 10 }),
  d: fc.integer({ min: 1, max: 12 }),
});
const spread = fc
  .uniqueArray(fc.integer({ min: 0, max: 50 }), { minLength: 2, maxLength: 9 })
  .chain((p) => fc.record({ p: fc.constant(p), k: fc.integer({ min: 2, max: p.length }) }));

function steps(problem: Problem, values: number[], param: number, settings: BASettings) {
  const t = new Timeline(def, { ...settings, problem }, 1, [
    ['load', values.join(' ')],
    ['search', param],
  ]);
  return t.entries[1]!.steps;
}

function checkRun(
  problem: Problem,
  values: number[],
  param: number,
  approach: 'pattern' | 'naive',
  ref: { answer: number; ok: (x: number) => boolean },
) {
  const all = steps(problem, values, param, { approach, problem });
  const last = all.at(-1)!;
  expect(last.vars?.answer).toBe(ref.answer);
  const sorted = problem === 'spread' ? [...values].sort((a, b) => a - b) : values;
  const state = problem === 'ship' ? { w: values, p: [0, 1] } : { w: [1, 1], p: sorted };
  const mine = cost(state, problem, param, approach);
  expect(last.vars?.checks).toBe(mine.checks);
  expect(last.vars?.reads).toBe(mine.reads);
  const n = cost(state, problem, param, 'naive');
  const p = cost(state, problem, param, 'pattern');
  expect(last.vars?.['naive total']).toBe(n.checks + n.reads);
  expect(last.vars?.['pattern total']).toBe(p.checks + p.reads);
  for (const step of all) {
    const e = step.extra!;
    // The window always holds the answer, inside the range of possible answers.
    expect(e.lo0).toBeLessThanOrEqual(e.lo);
    expect(e.lo).toBeLessThanOrEqual(e.hi);
    expect(e.hi).toBeLessThanOrEqual(e.hi0);
    expect(ref.answer).toBeGreaterThanOrEqual(e.lo);
    expect(ref.answer).toBeLessThanOrEqual(e.hi);
    // Every verdict agrees with the reference check.
    for (const t of e.tried) expect(t.ok).toBe(ref.ok(t.x));
    expect(e.tried.length).toBeLessThanOrEqual(e.tries);
    expect(Number(step.vars?.checks)).toBeGreaterThanOrEqual(e.tried.length);
  }
  if (approach === 'pattern') {
    // About log2 of the range in checks.
    const e = last.extra!;
    expect(e.tried.length).toBeLessThanOrEqual(Math.ceil(Math.log2(e.hi0 - e.lo0 + 1)));
  }
}

describe('binary-search-answer', () => {
  it('finds the smallest capacity both ways, and every step agrees with the reference', () => {
    fc.assert(
      fc.property(ship, approaches, ({ w, d }, approach) => {
        checkRun('ship', w, d, approach, refShip(w, d));
      }),
      { numRuns: 300 },
    );
  });

  it('finds the largest gap both ways, and every step agrees with the reference', () => {
    fc.assert(
      fc.property(spread, approaches, ({ p, k }, approach) => {
        checkRun(
          'spread',
          p,
          k,
          approach,
          refSpread(
            [...p].sort((a, b) => a - b),
            k,
          ),
        );
      }),
      { numRuns: 300 },
    );
  });

  it('refuses inputs it cannot use', () => {
    const t = new Timeline(def, { approach: 'pattern', problem: 'spread' }, 1, [
      ['search', 1],
      ['search', 9],
      ['load', '3 3 5'],
      ['load', '1 2 99'],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/at least 2/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/do not fit on 7 positions/);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/twice/);
    expect(t.entries[3]!.steps[0]!.say).toMatch(/out of range/);
    const s = new Timeline(def, { approach: 'pattern', problem: 'ship' }, 1, [
      ['load', '1 2 30'],
      ['load', '5'],
    ]);
    expect(s.entries[0]!.steps[0]!.say).toMatch(/out of range/);
    expect(s.entries[1]!.steps[0]!.say).toMatch(/at least 2 weights/);
  });

  it('reads the input box: one number is d or k, a list is values', () => {
    const parse = def.controls.input!.parse;
    expect(parse('3')).toBe(3);
    expect(parse('4, 7, 2')).toBe('4 7 2');
    expect(parse('0')).toBeInstanceOf(Error);
    expect(parse('13')).toBeInstanceOf(Error);
    expect(parse('1 x')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
