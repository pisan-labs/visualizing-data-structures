import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { ivInput, ivText } from '../_intervals2/kit';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import {
  defaults,
  type Action,
  type MIExtra,
  type MISettings,
  type MIState,
  type Seg,
} from './model';

type Def = VizDef<MIState, MISettings, MIExtra>;

const text = (ivs: Seg[]) => ivs.map(ivInput).join(' ');
const load = (ivs: Seg[]): OpCall => ['load', text(ivs)];
const shown = (ivs: Seg[]) => ivs.map(ivText).join(', ');

/** n intervals with some overlaps, times 0 to 16. */
function intervals(rng: Rng, n: number): Seg[] {
  return Array.from({ length: n }, () => {
    const len = rng.int(1, 4);
    const s = rng.int(0, 16 - len);
    return { s, f: s + len };
  });
}

/** n sorted intervals that neither overlap nor touch. */
function sortedList(rng: Rng, n: number): Seg[] {
  const out: Seg[] = [];
  let t = rng.int(0, 1);
  for (let k = 0; k < n; k++) {
    const len = rng.int(1, 3);
    out.push({ s: t, f: t + len });
    t += len + rng.int(1, 2);
  }
  return out;
}

const ACTIONS: Record<Action, string> = {
  grow: 'It merges, and the end of the last one out grows',
  inside: 'It merges, but lies inside the last one out: nothing changes',
  start: 'It starts a new interval out',
};

/**
 * Our own problem statements, for "spot it": four that call for this page's pattern (merging,
 * inserting, intersecting), and some that look alike and call for another.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A shared calendar lists meetings as start and end times, in no particular order. Report the blocks of time when at least one meeting is on, with no two blocks overlapping.',
    pattern: 'merge-intervals',
    cue: ['start and end times', 'blocks of time', 'no two blocks overlapping'],
    why: 'Sort the meetings by start; each one either reaches the last block and extends it, or starts a new block.',
    near: ['two-pointers', 'difference-array', 'k-way-merge'],
    alsoFits: ['sweep-line'],
  },
  {
    problem:
      'A document has highlighted ranges of characters, some overlapping. Count the characters that are highlighted at least once.',
    pattern: 'merge-intervals',
    cue: ['ranges', 'some overlapping', 'at least once'],
    why: 'Merge the overlapping ranges first, then add up the lengths of what comes out: each character is counted once.',
    near: ['prefix-sum-hashmap', 'sliding-window', 'kadane'],
    alsoFits: ['difference-array', 'sweep-line'],
  },
  {
    problem:
      'A sorted list of booked time slots, none overlapping. A new booking arrives. Give the updated list, joining the new booking with every slot it overlaps.',
    pattern: 'merge-intervals',
    cue: ['sorted list', 'none overlapping', 'a new booking'],
    why: 'One pass: copy the slots that end before it, absorb the ones it overlaps, copy the rest. No sort needed.',
    near: ['two-pointers', 'sweep-line', 'difference-array'],
  },
  {
    problem:
      'Two people each keep a sorted list of the times they are free, no overlaps within a list. When are they both free?',
    pattern: 'merge-intervals',
    cue: ['two', 'sorted list', 'both free'],
    why: 'Walk both lists with one index each: keep each overlap, and move past whichever free time ends first.',
    near: ['k-way-merge', 'merge-sorted-lists', 'sliding-window'],
    alsoFits: ['two-pointers', 'sweep-line'],
  },
  {
    problem:
      'A call log gives the start and end of every call made in a day. What is the largest number of calls that were going on at the same moment?',
    pattern: 'sweep-line',
    cue: ['at the same moment', 'largest number'],
    why: 'The question is how many overlap, not what they cover: sweep the starts (+1) and ends (−1) in time order and keep the highest count.',
    near: ['merge-intervals', 'top-k', 'sliding-window'],
  },
  {
    problem:
      'A hotel takes many bookings, each adding some guests to every night from night a to night b. After all of them, how many guests stay each night?',
    pattern: 'difference-array',
    cue: ['adding some guests to every night', 'after all of them'],
    why: 'Each booking is a range update, and only the totals at the end are asked: +x at a, −x after b, then one running sum.',
    near: ['merge-intervals', 'prefix-sum-hashmap', 'kadane'],
    alsoFits: ['sweep-line'],
  },
  {
    problem: 'Two sorted lists of order numbers. List the order numbers that appear in both.',
    pattern: 'two-pointers',
    cue: ['two sorted lists', 'appear in both'],
    why: 'Single numbers, not intervals: one index in each list, moving the smaller one forward.',
    near: ['merge-intervals', 'k-way-merge', 'sweep-line'],
    alsoFits: ['binary-search', 'merge-sorted-lists'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function mergePractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[]) => new Timeline(def(), defaults, 1, ops);

  return [
    {
      id: 'merged',
      title: 'The merged list',
      make(rng) {
        const ivs = intervals(rng, rng.int(5, 7));
        const t = run([load(ivs), ['merge']]);
        const out = t.endState().ivs;
        return {
          prompt: `Merge these intervals: ${shown(ivs)}. Intervals that only touch merge too. Type the merged list in start order, each as start-end, such as 1-4 6-9.`,
          setup: [load(ivs)],
          answer: { kind: 'sequence', value: out.map(ivInput) },
          explain: `Sorted by start: ${shown([...ivs].sort((a, b) => a.s - b.s || a.f - b.f))}. Each one either reaches the last one out (merge, keeping the later end) or starts after it (a new one). Out come ${out.length === 1 ? 'one interval' : `${out.length} intervals`}: ${shown(out)}.`,
          watch: [['merge']],
        };
      },
    },
    {
      id: 'next-action',
      title: 'Merge or start?',
      make(rng) {
        const ivs = intervals(rng, rng.int(5, 7));
        const steps = run([load(ivs), ['merge']]).entries.at(-1)!.steps;
        const checks = steps.filter((s) => s.extra?.action);
        // Mostly the rarer outcomes, so "start" is not always right.
        const pick = checks[rng.int(0, checks.length - 1)]!;
        const k = checks.indexOf(pick);
        const before = k === 0 ? steps.find((s) => s.lines.includes('first'))! : checks[k - 1]!;
        const out = before.extra!.out;
        const x = pick.extra!.cur!;
        const sorted = [...ivs].sort((a, b) => a.s - b.s || a.f - b.f);
        const options = (['grow', 'inside', 'start'] as Action[]).map((a) => ACTIONS[a]);
        const action = pick.extra!.action!;
        const last = out[out.length - 1]!;
        return {
          prompt: `Sorted by start, the intervals are ${shown(sorted)}. After the first ${k + 1}, out holds ${shown(out)}. What happens with the next one, ${ivText(x)}? Touching ends merge.`,
          setup: [load(ivs)],
          answer: { kind: 'choice', options, correct: options.indexOf(ACTIONS[action]) },
          explain:
            action === 'start'
              ? `${ivText(x)} starts at ${x.s}, after the last one out, ${ivText(last)}, ends at ${last.f}. It starts a new one.`
              : action === 'grow'
                ? `${ivText(x)} starts at ${x.s}, no later than ${ivText(last)} ends at ${last.f}, and ends later, at ${x.f}: the end grows to ${x.f}.`
                : `${ivText(x)} starts at ${x.s}, no later than ${ivText(last)} ends at ${last.f}, and ends at ${x.f}, inside it: nothing changes.`,
          watch: [['merge']],
        };
      },
    },
    {
      id: 'insert',
      title: 'Insert into a sorted list',
      make(rng) {
        const list = sortedList(rng, rng.int(4, 5));
        const end = list[list.length - 1]!.f;
        const s = rng.int(list[0]!.s, Math.max(list[0]!.s, end - 3));
        const x = { s, f: Math.min(24, s + rng.int(2, 6)) };
        const t = run([load(list), ['insert', ivInput(x)]]);
        const out = t.endState().ivs;
        const absorbed = list.filter((v) => !(v.f < x.s || v.s > x.f));
        return {
          prompt: `The list ${shown(list)} is sorted and has no overlaps. Insert ${ivText(x)}, merging it with every interval it overlaps or touches. Type the new list, each as start-end.`,
          setup: [load(list)],
          answer: { kind: 'sequence', value: out.map(ivInput) },
          explain: absorbed.length
            ? `${ivText(x)} absorbs ${shown(absorbed)}; the others are copied as they are. The list becomes ${shown(out)}.`
            : `${ivText(x)} overlaps nothing, so it just goes in its place: ${shown(out)}.`,
          watch: [['insert', ivInput(x)]],
        };
      },
    },
    spotItKind({ page: 'merge-intervals', rows: SPOT_ROWS, watch: [['merge']] }),
  ];
}
