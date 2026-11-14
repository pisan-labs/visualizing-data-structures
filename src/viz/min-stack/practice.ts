import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import { fmt, list } from '../_design1/kit';
import { defaults, type MSExtra, type MSSettings, type MSState } from './model';

type Def = VizDef<MSState, MSSettings, MSExtra>;

const call = ([op, ...args]: OpCall) => `\`${op}(${args.map((a) => fmt(Number(a))).join(', ')})\``;
const calls = (cs: OpCall[]) => cs.map(call).join(', ');

/** Small values with a few repeats, so ties reach mins. */
const values = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.int(1, 9));

/**
 * Pushes and pops after a setup of `start` values, never popping the stack empty, ending with
 * at least one value.
 */
function moves(rng: Rng, start: number, n: number): OpCall[] {
  const out: OpCall[] = [];
  let size = start;
  for (let k = 0; k < n; k++) {
    if (size > 1 && rng.int(0, 1)) {
      out.push(['pop']);
      size--;
    } else {
      out.push(['push', rng.int(1, 9)]);
      size++;
    }
  }
  return out;
}

/**
 * Our own problem statements, for "spot it": three that call for a min stack, and some that look
 * alike and call for another pattern.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A drawing app keeps an undo history: the last action is undone first. At any moment it must show the cheapest action still in the history, instantly.',
    pattern: 'min-stack',
    cue: ['the last action is undone first', 'at any moment', 'instantly'],
    why: 'Last in, first out is a stack. Keep the minimum beside it in a second stack, so every undo still knows the cheapest action left.',
    near: ['monotonic-stack', 'top-k', 'two-heaps-median'],
  },
  {
    problem:
      'Plates are added to and taken from the top of a pile only. After every change, report the heaviest plate still in the pile in O(1).',
    pattern: 'min-stack',
    cue: ['added to and taken from the top', 'after every change', 'in O(1)'],
    why: 'The mirror image of a min stack: a second stack of maximums. Taking a plate off only uncovers the maximum that was there before it.',
    near: ['monotonic-stack', 'top-k', 'monotonic-queue'],
  },
  {
    problem:
      'A game saves checkpoints as you play. Loading goes back to the most recent save and discards it. At all times, show the lowest score among the saves that are left, in constant time.',
    pattern: 'min-stack',
    cue: ['the most recent save', 'discards it', 'at all times', 'in constant time'],
    why: 'Saving and loading the most recent is push and pop. A minimum that has to survive the pops needs the minimum stored with each push, not one variable.',
    near: ['monotonic-stack', 'sliding-window', 'two-heaps-median'],
  },
  {
    problem:
      'For each day of temperature readings, find how many days you wait until a warmer day.',
    pattern: 'monotonic-stack',
    cue: 'until a warmer day',
    why: 'Each day waits for the next bigger value: keep the days still waiting on a stack in falling order, and pop them when a warmer one comes.',
    near: ['min-stack', 'two-heaps-median'],
  },
  {
    problem:
      'A sensor gives one reading a second. After each reading, report the smallest of the last k readings.',
    pattern: 'monotonic-queue',
    cue: ['the last k readings', 'smallest'],
    why: 'Old readings leave from the front as new ones arrive at the back: a queue, not a stack. A deque kept in rising order has the minimum at its front.',
    near: ['min-stack', 'top-k'],
    alsoFits: ['sliding-window'],
  },
  {
    problem:
      'Numbers arrive one at a time and none ever leave. After each one, report the middle value of everything so far.',
    pattern: 'two-heaps-median',
    cue: ['none ever leave', 'the middle value'],
    why: 'The middle, not the smallest. A max-heap of the low half and a min-heap of the high half keep the middle at their tops.',
    near: ['min-stack', 'top-k'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function minStackPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: MSSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);
  const pushes = (vs: number[]): OpCall[] => vs.map((v) => ['push', v]);

  return [
    {
      id: 'min-after',
      title: 'What is the minimum now?',
      make(rng) {
        const setup = pushes(values(rng, rng.int(3, 5)));
        const ask = moves(rng, setup.length, rng.int(3, 4));
        const t = run([...setup, ...ask, ['min']]);
        const answer = Number(t.entries.at(-1)!.steps.at(-1)!.vars!.returned);
        const left = t.endState().items.map((i) => i.value);
        return {
          prompt: `Starting from the stack shown, run ${calls(ask)}. What does \`min()\` return then?`,
          setup,
          answer: { kind: 'number', value: answer },
          explain: `The stack ends as ${list(left)}, bottom to top, so the minimum is ${fmt(answer)}. mins knows it without a scan: its top is the minimum of whatever is still in the stack.`,
          watch: [...ask, ['min']],
        };
      },
    },
    {
      id: 'mins-contents',
      title: 'What does mins hold?',
      make(rng) {
        const setup = pushes(values(rng, rng.int(2, 3)));
        const ask = moves(rng, setup.length, rng.int(4, 5));
        const end = run([...setup, ...ask]).endState();
        const mins = end.mins.map((m) => String(m.value));
        return {
          prompt: `Starting from the stack shown, run ${calls(ask)}. Type what mins holds afterwards, from bottom to top.`,
          setup,
          answer: { kind: 'sequence', value: mins },
          explain: `A push goes onto mins when it is at most the top of mins, and a pop takes the top of mins off when the popped value equals it. The stack ends as ${list(end.items.map((i) => i.value))}, and mins as ${mins.join(', ')}: each entry is a value that was the minimum, or tied it, when it was pushed.`,
          watch: ask,
        };
      },
    },
    spotItKind({
      page: 'min-stack',
      rows: SPOT_ROWS,
      setup: pushes([5, 3, 7]),
      watch: [['push', 2], ['min'], ['pop'], ['min']],
    }),
  ];
}
