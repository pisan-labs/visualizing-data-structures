import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { order } from '../_lists2/kit';
import { reverseKGroup as def } from '.';
import { DUMMY, values, type Rest, type RKSettings } from './model';

/** The reference: slice into groups of k and turn each whole one (or every one) around. */
function reference(vs: number[], k: number, rest: Rest): number[] {
  const out: number[] = [];
  for (let i = 0; i < vs.length; i += k) {
    const g = vs.slice(i, i + k);
    out.push(...(g.length === k || rest === 'reverse' ? g.reverse() : g));
  }
  return out;
}

const lists = fc.uniqueArray(fc.integer({ min: 0, max: 99 }), { minLength: 1, maxLength: 10 });
const settingsArb = fc.record({
  approach: fc.constantFrom('pattern' as const, 'naive' as const),
  rest: fc.constantFrom<Rest>('keep', 'reverse'),
});
const UNITS = ['hops', 'links', 'copies'];

function run(vs: number[], k: number, settings: RKSettings) {
  const t = new Timeline(def, settings, 1, [
    ['build', vs.join(' ')],
    ['reverse', k],
  ]);
  return t.entries[1]!;
}

describe('reverse-k-group', () => {
  it('gives the reference order both ways; the pattern moves nodes, the naive way values', () => {
    fc.assert(
      fc.property(lists, fc.integer({ min: 1, max: 12 }), settingsArb, (vs, k, settings) => {
        const e = run(vs, k, settings);
        const want = reference(vs, k, settings.rest);
        expect(values(e.end)).toEqual(want);
        const start = e.steps[0]!.state.nodes.filter((n) => n.uid !== DUMMY);
        const uidOf = new Map(start.map((n) => [n.value, n.uid]));
        const ends = order(e.end.nodes, e.end.head);
        if (settings.approach === 'pattern') {
          // Each value is still in its own node: the nodes moved.
          expect(ends).toEqual(want.map((v) => uidOf.get(v)));
          expect(e.steps.at(-1)!.vars?.copies).toBe(0);
        } else {
          // The nodes stayed in order: the values moved.
          expect(ends).toEqual(start.map((n) => n.uid));
          expect(e.steps.at(-1)!.vars?.links).toBe(0);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('loses no node on any step, and its counters only go up to the total', () => {
    fc.assert(
      fc.property(lists, fc.integer({ min: 1, max: 12 }), settingsArb, (vs, k, settings) => {
        const e = run(vs, k, settings);
        let before = 0;
        for (const step of e.steps) {
          const s = step.state;
          const seen = new Set<number>();
          const roots = [s.nodes.some((n) => n.uid === DUMMY) ? DUMMY : s.head];
          for (const root of [...roots, ...Object.values(step.extra?.ptrs ?? {})])
            for (const u of order(s.nodes, root ?? null)) seen.add(u);
          expect(seen.size).toBe(s.nodes.length);
          const now = UNITS.reduce((t, u) => t + Number(step.vars?.[u] ?? 0), 0);
          expect(now).toBeGreaterThanOrEqual(before);
          before = now;
        }
        const last = e.steps.at(-1)!;
        expect(before).toBe(
          last.vars?.[settings.approach === 'naive' ? 'naive total' : 'pattern total'],
        );
      }),
      { numRuns: 300 },
    );
  });

  it('costs 2k + 2 hops and k + 1 links per whole group', () => {
    const e = run([1, 2, 3, 4, 5, 6, 7, 8], 3, { approach: 'pattern', rest: 'keep' });
    const v = e.steps.at(-1)!.vars!;
    // Two whole groups, then a walk of 2 that finds the short group.
    expect(v.hops).toBe(2 * (2 * 3 + 2) + 2);
    expect(v.links).toBe(2 * (3 + 1));
  });

  it('refuses a bad k and a list it cannot read, and keeps the list', () => {
    const t = new Timeline(def, { approach: 'pattern', rest: 'keep' }, 1, [
      ['reverse', 'x'],
      ['reverse', 0],
      ['build', '1 2 300'],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/Type k as one whole number/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/at least 1/);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/300 is too big/);
    expect(values(t.endState())).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
