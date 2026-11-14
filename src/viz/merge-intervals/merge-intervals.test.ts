import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { ivInput, mergeSortCount } from '../_intervals2/kit';
import { mergeIntervals as def } from '.';
import {
  mergeEvery,
  mergePass,
  sortedDisjoint,
  type MISettings,
  type Seg,
  type Touch,
} from './model';

/**
 * A reference for closed intervals: mark the covered time in half units (point 2t is time t,
 * point 2t + 1 the stretch between t and t + 1) and read off the runs.
 */
function covered(ivs: Seg[]): Seg[] {
  const on = new Set<number>();
  for (const v of ivs) for (let p = 2 * v.s; p <= 2 * v.f; p++) on.add(p);
  const out: Seg[] = [];
  let start: number | null = null;
  for (let p = 0; p <= 52; p++) {
    if (on.has(p) && start === null) start = p;
    if (!on.has(p) && start !== null) {
      out.push({ s: start / 2, f: (p - 1) / 2 });
      start = null;
    }
  }
  return out;
}

/** A simpler reference: merge by repeatedly joining any overlapping pair. */
function joinPairs(ivs: Seg[], closed: boolean): Seg[] {
  const list = ivs.map((v) => ({ ...v }));
  const meets = (a: Seg, b: Seg) => (closed ? a.s <= b.f && b.s <= a.f : a.s < b.f && b.s < a.f);
  for (let changed = true; changed;) {
    changed = false;
    outer: for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        if (meets(list[i]!, list[j]!)) {
          list[i] = { s: Math.min(list[i]!.s, list[j]!.s), f: Math.max(list[i]!.f, list[j]!.f) };
          list.splice(j, 1);
          changed = true;
          break outer;
        }
  }
  return list.sort((a, b) => a.s - b.s);
}

const seg = fc
  .tuple(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 1, max: 4 }))
  .map(([s, len]) => ({ s, f: s + len }));
const lists = fc.array(seg, { minLength: 1, maxLength: 8 });
const touches = fc.constantFrom<Touch>('merge', 'apart');
const approaches = fc.constantFrom('pattern' as const, 'naive' as const);
const text = (ivs: Seg[]) => ivs.map(ivInput).join(' ');
const plain = (ivs: Seg[]) => ivs.map(({ s, f }) => ({ s, f }));

describe('merge-intervals', () => {
  it('merges to the reference both ways, and keeps every step consistent', () => {
    fc.assert(
      fc.property(lists, touches, approaches, (ivs, touch, approach) => {
        const closed = touch === 'merge';
        const settings: MISettings = { approach, touch };
        const t = new Timeline(def, settings, 1, [['load', text(ivs)], ['merge']]);
        const steps = t.entries[1]!.steps;
        const want = joinPairs(ivs, closed);
        expect(plain(t.endState().ivs)).toEqual(want);
        expect(sortedDisjoint(t.endState().ivs, closed)).toBe(true);
        const last = steps.at(-1)!;
        const p = mergePass(
          ivs.map((v, k) => ({ id: k + 1, ...v })),
          closed,
        );
        expect(last.vars?.['naive total']).toBe(
          mergeEvery(
            ivs.map((v, k) => ({ id: k + 1, ...v })),
            closed,
          ).checks,
        );
        expect(last.vars?.['pattern total']).toBe(p.comparisons + ivs.length - 1);
        if (approach === 'pattern') {
          expect(last.vars?.checks).toBe(ivs.length - 1);
          expect(last.vars?.comparisons).toBe(p.comparisons);
        } else {
          expect(last.vars?.comparisons).toBe(0);
          expect(last.vars?.checks).toBe(last.vars?.['naive total']);
        }
        for (const step of steps) {
          const e = step.extra!;
          // What is out so far is always sorted and disjoint, and covers only input time.
          expect(sortedDisjoint(e.out, closed)).toBe(true);
          for (const o of e.out) expect(ivs.some((v) => v.s >= o.s && v.f <= o.f)).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('agrees with a reference that marks covered time', () => {
    fc.assert(
      fc.property(lists, (ivs) => {
        expect(joinPairs(ivs, true)).toEqual(covered(ivs));
      }),
    );
  });

  it('inserts like appending and merging again, both ways', () => {
    fc.assert(
      fc.property(lists, seg, touches, approaches, (ivs, x, touch, approach) => {
        const closed = touch === 'merge';
        const list = joinPairs(ivs, closed);
        const t = new Timeline(def, { approach, touch }, 1, [
          ['load', text(list)],
          ['insert', ivInput(x)],
        ]);
        expect(plain(t.endState().ivs)).toEqual(joinPairs([...list, x], closed));
        if (approach === 'pattern') {
          const checks = Number(t.entries[1]!.steps.at(-1)!.vars?.checks);
          expect(checks).toBeLessThanOrEqual(list.length + 1);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('intersects like checking every point, both ways', () => {
    fc.assert(
      fc.property(lists, lists, touches, approaches, (as, bs, touch, approach) => {
        const closed = touch === 'merge';
        const a = joinPairs(as, closed);
        const b = joinPairs(bs, closed);
        const t = new Timeline(def, { approach, touch }, 1, [
          ['load', text(a)],
          ['intersect', text(b)],
        ]);
        const want: Seg[] = [];
        for (const x of a)
          for (const y of b) {
            const lo = Math.max(x.s, y.s);
            const hi = Math.min(x.f, y.f);
            if (closed ? lo <= hi : lo < hi) want.push({ s: lo, f: hi });
          }
        want.sort((p, q) => p.s - q.s);
        expect(plain(t.endState().ivs)).toEqual(want);
        const checks = Number(t.entries[1]!.steps.at(-1)!.vars?.checks);
        if (approach === 'naive') expect(checks).toBe(a.length * b.length);
        else expect(checks).toBeLessThanOrEqual(a.length + b.length - 1);
      }),
      { numRuns: 200 },
    );
  });

  it('counts a stable merge sort', () => {
    const { sorted, comparisons } = mergeSortCount([3, 1, 2, 1], (a, b) => a < b);
    expect(sorted).toEqual([1, 1, 2, 3]);
    expect(comparisons).toBe(5);
    expect(mergeSortCount([1, 2, 3, 4], (a, b) => a < b).comparisons).toBe(4);
  });

  it('refuses an unsorted list for insert and intersect, and bad input', () => {
    const t = new Timeline(def, { approach: 'pattern', touch: 'merge' }, 1, [
      ['insert', '5-8'],
      ['intersect', '1-3'],
      ['load', '1-3 3-5'],
      ['intersect', '1-2'],
      ['load', '5-2'],
      ['insert', '1-2 3-4'],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/Press Merge first/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/Press Merge first/);
    expect(t.entries[3]!.steps[0]!.say).toMatch(/1–3 overlaps 3–5/);
    expect(t.entries[4]!.steps[0]!.say).toMatch(/finish must come after the start/);
    expect(t.entries[5]!.steps[0]!.say).toMatch(/Insert takes one interval/);
  });

  it('reads the input box', () => {
    const parse = def.controls.input!.parse;
    expect(parse('5-8')).toBe('5-8');
    expect(parse('4-7, 1-3')).toBe('4-7 1-3');
    expect(parse('4-30')).toBeInstanceOf(Error);
    expect(parse('cat')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
