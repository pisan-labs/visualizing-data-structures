import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { order } from '../_lists2/kit';
import { fastSlowPointers as def } from '.';
import { middleHops, middleIndex, values, type FSSettings, type Middle } from './model';

const lists = fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 10 });
const settingsArb = fc.record({
  approach: fc.constantFrom('pattern' as const, 'naive' as const),
  middle: fc.constantFrom<Middle>('second', 'first'),
});
const UNITS = ['hops', 'links', 'copies', 'comparisons'];

function run(vs: number[], call: OpCall, settings: FSSettings) {
  const t = new Timeline(def, settings, 1, [['build', vs.join(' ')], call]);
  return t.entries[1]!;
}

/** Every node can still be reached from head or from a pointer variable: none is lost. */
function reachableAll(step: ReturnType<typeof run>['steps'][number]) {
  const s = step.state;
  const seen = new Set<number>();
  for (const root of [s.head, ...Object.values(step.extra?.ptrs ?? {})])
    for (const u of order(s.nodes, root ?? null)) seen.add(u);
  return seen.size === s.nodes.length;
}

describe('fast-slow-pointers', () => {
  it('finds the reference middle both ways, with the hops each approach takes', () => {
    fc.assert(
      fc.property(lists, settingsArb, (vs, settings) => {
        const e = run(vs, ['middle'], settings);
        const n = vs.length;
        const last = e.steps.at(-1)!;
        const i = middleIndex(n, settings.middle);
        expect(last.vars?.middle).toBe(vs[i]);
        expect(last.vars?.index).toBe(i);
        expect(last.vars?.['pattern total']).toBe(middleHops(n, settings.middle));
        expect(last.vars?.['naive total']).toBe(n + i);
        expect(last.vars?.hops).toBe(
          settings.approach === 'naive' ? n + i : middleHops(n, settings.middle),
        );
        expect(values(e.end)).toEqual(vs);
      }),
      { numRuns: 200 },
    );
  });

  it('finds the k-th from the end, or nothing for a short list, in 2n − k hops both ways', () => {
    fc.assert(
      fc.property(lists, fc.integer({ min: 1, max: 12 }), settingsArb, (vs, k, settings) => {
        const e = run(vs, ['kth', k], settings);
        const n = vs.length;
        const last = e.steps.at(-1)!;
        if (k <= n) {
          expect(last.vars?.found).toBe(true);
          expect(last.vars?.value).toBe(vs[n - k]);
          expect(last.vars?.['naive total']).toBe(2 * n - k);
          expect(last.vars?.['pattern total']).toBe(2 * n - k);
        } else {
          expect(last.vars?.found).toBe(false);
          expect(last.vars?.hops).toBe(n);
        }
        expect(values(e.end)).toEqual(vs);
      }),
      { numRuns: 200 },
    );
  });

  it('checks palindromes both ways, loses no node on the way, and puts the list back', () => {
    const palindromes = lists.map((half) => [...half, ...[...half].reverse().slice(1)]);
    fc.assert(
      fc.property(fc.oneof(lists, palindromes), settingsArb, (raw, settings) => {
        const vs = raw.slice(0, 10);
        const e = run(vs, ['palindrome'], settings);
        const last = e.steps.at(-1)!;
        expect(last.vars?.palindrome).toBe(vs.join() === [...vs].reverse().join());
        expect(values(e.end)).toEqual(vs);
        expect(e.end.nodes.map((n) => n.next)).toEqual(e.steps[0]!.state.nodes.map((n) => n.next));
        let before = 0;
        for (const step of e.steps) {
          expect(reachableAll(step)).toBe(true);
          // Counters only go up.
          const now = UNITS.reduce((t, u) => t + Number(step.vars?.[u] ?? 0), 0);
          expect(now).toBeGreaterThanOrEqual(before);
          before = now;
        }
        const total = settings.approach === 'naive' ? 'naive total' : 'pattern total';
        expect(before).toBe(last.vars?.[total]);
        if (settings.approach === 'naive') {
          expect(last.vars?.copies).toBe(vs.length);
          expect(last.vars?.links).toBe(0);
        } else expect(last.vars?.copies).toBe(0);
      }),
      { numRuns: 300 },
    );
  });

  it('refuses a bad k and a list it cannot read, and keeps the list', () => {
    const t = new Timeline(def, { approach: 'pattern', middle: 'second' }, 1, [
      ['kth', 'x'],
      ['kth', 0],
      ['build', '1 2 300'],
      ['build', Array(11).fill(1).join(' ')],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/Type k as one whole number/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/at least 1/);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/300 is too big/);
    expect(t.entries[3]!.steps[0]!.say).toMatch(/at most 10/);
    expect(values(t.endState())).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('reads the input box: one number is k, a list is values', () => {
    const parse = def.controls.input!.parse;
    expect(parse('3')).toBe(3);
    expect(parse('1, 2 3')).toBe('1 2 3');
    expect(parse('100')).toBeInstanceOf(Error);
    expect(parse('1 x')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
