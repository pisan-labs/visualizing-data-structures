import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { order } from '../_lists2/kit';
import { mergeSortedLists as def } from '.';
import { DUMMY, formatLists, listValues, plan, type KWay, type MSettings } from './model';

/** Up to 4 sorted lists of up to 5 small values, at most 10 in all. */
const listsArb = fc
  .array(fc.array(fc.integer({ min: 0, max: 6 }), { maxLength: 5 }), {
    minLength: 1,
    maxLength: 4,
  })
  .map((ls) => {
    let room = 10;
    return ls.map((l) => {
      const kept = l.slice(0, room);
      room -= kept.length;
      return kept.sort((x, y) => x - y);
    });
  });
const settingsArb = fc.record({
  approach: fc.constantFrom('pattern' as const, 'naive' as const),
  kway: fc.constantFrom<KWay>('pairs', 'one'),
});
const UNITS = ['comparisons', 'links', 'copies'];

/** The reference: comparisons a two-list merge makes (one per node taken while both last). */
function mergeCount(a: number[], b: number[]): { out: number[]; cmp: number } {
  const out: number[] = [];
  let i = 0;
  let j = 0;
  let cmp = 0;
  while (i < a.length && j < b.length) {
    cmp++;
    out.push(a[i]! <= b[j]! ? a[i++]! : b[j++]!);
  }
  return { out: [...out, ...a.slice(i), ...b.slice(j)], cmp };
}

function run(lists: number[][], settings: MSettings) {
  const t = new Timeline(def, settings, 1, [['build', formatLists(lists)], ['merge']]);
  return t.entries[1]!;
}

describe('merge-sorted-lists', () => {
  it('gives the sorted list both ways, with the reference comparisons for the pattern', () => {
    fc.assert(
      fc.property(listsArb, settingsArb, (lists, settings) => {
        const e = run(lists, settings);
        const all = lists.flat().sort((x, y) => x - y);
        expect(listValues(e.end)).toEqual([all]);
        const last = e.steps.at(-1)!;
        // The pattern's comparisons, pair merge by pair merge.
        const cur = lists.map((l) => [...l]);
        let cmp = 0;
        for (const [i, j] of plan(lists.length, settings.kway).flat()) {
          const m = mergeCount(cur[i]!, cur[j]!);
          cmp += m.cmp;
          cur[i] = m.out;
          cur[j] = [];
        }
        if (settings.approach === 'pattern') {
          expect(last.vars?.comparisons).toBe(cmp);
          expect(last.vars?.copies).toBe(0);
        } else {
          expect(last.vars?.links).toBe(all.length);
        }
        const total = UNITS.reduce((t, u) => t + Number(last.vars?.[u] ?? 0), 0);
        expect(last.vars?.[settings.approach === 'naive' ? 'naive total' : 'pattern total']).toBe(
          total,
        );
      }),
      { numRuns: 300 },
    );
  });

  it('relinks the same nodes, stably: equal values keep the order of their lists', () => {
    fc.assert(
      fc.property(listsArb, fc.constantFrom<KWay>('pairs', 'one'), (lists, kway) => {
        const e = run(lists, { approach: 'pattern', kway });
        const before = e.steps[0]!.state.nodes.map((n) => n.uid)
          .filter((u) => u !== DUMMY)
          .sort((x, y) => x - y);
        const uids = order(e.end.nodes, e.end.lists[0]!);
        expect([...uids].sort((x, y) => x - y)).toEqual(before);
        // Nodes were made list by list, so on a tie the smaller uid must come first.
        const value = new Map(e.end.nodes.map((n) => [n.uid, n.value]));
        for (let i = 1; i < uids.length; i++) {
          const [a, b] = [uids[i - 1]!, uids[i]!];
          if (value.get(a) === value.get(b)) expect(a).toBeLessThan(b);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('keeps every node on the board exactly once, and the out row linked in order', () => {
    fc.assert(
      fc.property(listsArb, settingsArb, (lists, settings) => {
        const e = run(lists, settings);
        let before = 0;
        for (const step of e.steps) {
          const x = step.extra!;
          const placed = [...x.rows.flat(), ...(x.out ?? [])].filter((u) => u !== null);
          const real = step.state.nodes.map((n) => n.uid);
          expect([...placed].sort((p, q) => p! - q!)).toEqual([...real].sort((p, q) => p - q));
          const out = (x.out ?? []).filter((u): u is number => u !== null);
          const next = new Map(step.state.nodes.map((n) => [n.uid, n.next]));
          for (let t = 1; t < out.length; t++) expect(next.get(out[t - 1]!)).toBe(out[t]);
          if (out.length && out[0] === DUMMY) expect(x.out![0]).toBe(DUMMY);
          const now = UNITS.reduce((t, u) => t + Number(step.vars?.[u] ?? 0), 0);
          expect(now).toBeGreaterThanOrEqual(before);
          before = now;
        }
      }),
      { numRuns: 200 },
    );
  });

  it('never makes more than m + n − 1 comparisons for two lists', () => {
    fc.assert(
      fc.property(listsArb, (lists) => {
        const two = [lists[0]!, lists[1] ?? []];
        const e = run(two, { approach: 'pattern', kway: 'pairs' });
        const c = Number(e.steps.at(-1)!.vars?.comparisons);
        const [m, n] = [two[0]!.length, two[1]!.length];
        expect(c).toBeLessThanOrEqual(Math.max(0, m + n - 1));
        expect(c).toBeGreaterThanOrEqual(Math.min(m, n));
      }),
    );
  });

  it('refuses unsorted, oversized and unreadable lists, and keeps the lists', () => {
    const t = new Timeline(def, { approach: 'pattern', kway: 'pairs' }, 1, [
      ['build', '1 5 3 | 2'],
      ['build', '1 2 3 4 5 6 | 7'],
      ['build', '1 | 2 | 3 | 4 | 5'],
      ['build', '1 2 3 4 5 | 1 2 3 4 5 | 9'],
      ['build', '1 x'],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/List A is not sorted: 3 comes after 5/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/at most 5 in each list/);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/at most 4/);
    expect(t.entries[3]!.steps[0]!.say).toMatch(/at most 10 in all/);
    expect(t.entries[4]!.steps[0]!.say).toMatch(/"x" is not a whole number/);
    expect(listValues(t.endState())).toEqual([
      [1, 4, 7, 9],
      [2, 3, 8],
    ]);
  });

  it('plans pairs round by round, and one at a time into A', () => {
    expect(plan(4, 'pairs')).toEqual([
      [
        [0, 1],
        [2, 3],
      ],
      [[0, 2]],
    ]);
    expect(plan(3, 'pairs')).toEqual([[[0, 1]], [[0, 2]]]);
    expect(plan(4, 'one')).toEqual([[[0, 1]], [[0, 2]], [[0, 3]]]);
    expect(plan(1, 'pairs')).toEqual([]);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
