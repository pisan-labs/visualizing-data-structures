import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import { list } from '../_design1/kit';
import { defaults, queueOf, type TQExtra, type TQSettings, type TQState } from './model';

type Def = VizDef<TQState, TQSettings, TQExtra>;

const call = ([op, ...args]: OpCall) => `\`${op}(${args.join(', ')})\``;
const calls = (cs: OpCall[]) => cs.map(call).join(', ');

function distinct(rng: Rng, n: number): number[] {
  const out = new Set<number>();
  while (out.size < n) out.add(rng.int(1, 60));
  return [...out];
}

/**
 * Enqueues of fresh values and dequeues, never leaving fewer than `keep` values or more than 8.
 */
function mix(rng: Rng, start: number, n: number, fresh: number[], keep = 0): OpCall[] {
  const out: OpCall[] = [];
  let size = start;
  for (let k = 0; k < n; k++) {
    if (size > keep && (size >= 8 || rng.int(0, 2) === 0)) {
      out.push(['dequeue']);
      size--;
    } else {
      out.push(['enqueue', fresh.shift()!]);
      size++;
    }
  }
  return out;
}

/**
 * Our own problem statements, for "spot it": three that call for a queue from two stacks, and
 * some that look alike and call for another pattern.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A ticket counter must serve people first come, first served, but all it has for storage are piles: add to the top, take from the top. Over a whole day, each person must cost O(1).',
    pattern: 'two-stack-queue',
    cue: [
      'first come, first served',
      'piles: add to the top, take from the top',
      'over a whole day',
    ],
    why: 'Pour one stack into the other and the order flips, so the oldest value comes out on top. Pour only when the second stack is empty and each value moves across once.',
    near: ['min-stack', 'monotonic-stack', 'monotonic-queue'],
  },
  {
    problem:
      'A language gives you immutable lists that are cheap to add to and take from at the front only. Make a first-in, first-out queue with O(1) amortized operations.',
    pattern: 'two-stack-queue',
    cue: ['at the front only', 'first-in, first-out', 'amortized'],
    why: 'A list used at its front is a stack. Keep the back of the queue in one list and the front in another, and reverse the back into the front only when the front runs out.',
    near: ['monotonic-queue', 'reverse-k-group', 'min-stack'],
  },
  {
    problem:
      'Messages are written to an undo log that only offers push and pop at its end. Deliver the messages in the order they were written, with no more than a constant number of log operations per message overall.',
    pattern: 'two-stack-queue',
    cue: ['only offers push and pop', 'in the order they were written', 'per message overall'],
    why: 'Two last-in, first-out logs make a first-in, first-out queue: every message is pushed and popped at most twice, so four log operations each.',
    near: ['min-stack', 'monotonic-stack', 'lru-cache'],
  },
  {
    problem: 'A stack must also report its largest value, at any moment, in O(1).',
    pattern: 'min-stack',
    cue: ['a stack', 'its largest value, at any moment'],
    why: 'Still one stack: keep a second stack of maximums beside it. Nothing has to come out in first-in order.',
    near: ['two-stack-queue', 'monotonic-stack'],
  },
  {
    problem: 'Report the largest value in every window of k consecutive readings.',
    pattern: 'monotonic-queue',
    cue: ['every window of k consecutive'],
    why: 'Values leave the window from the front in the order they came: keep a deque of candidates in falling order, so the largest is always at its front.',
    near: ['min-stack', 'top-k'],
    alsoFits: ['two-stack-queue', 'sliding-window'],
  },
  {
    problem:
      'A radio log lists songs in the order they were played. Find the longest run of plays in which no song comes up twice.',
    pattern: 'sliding-window',
    cue: ['longest run of plays', 'no song comes up twice'],
    why: 'Grow the run on the right and shrink it from the left when a song repeats: two indices, not two stacks.',
    near: ['two-stack-queue', 'monotonic-queue'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function twoStackQueuePractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: TQSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);
  const enqueues = (vs: number[]): OpCall[] => vs.map((v) => ['enqueue', v]);

  return [
    {
      id: 'which-stack',
      title: 'Which stack is it in?',
      make(rng) {
        const vs = distinct(rng, 12);
        const setup = enqueues(vs.splice(0, rng.int(2, 4)));
        const ask = mix(rng, setup.length, rng.int(3, 5), vs);
        const end = run([...setup, ...ask]).endState();
        // Mostly a value still in the queue; now and then one already gone.
        const all = [...setup, ...ask].filter((c) => c[0] === 'enqueue').map((c) => Number(c[1]));
        const held = queueOf(end);
        const pool = rng.int(0, 4) && held.length ? held : all;
        const x = pool[rng.int(0, pool.length - 1)]!;
        const where = end.inn.some((i) => i.value === x)
          ? 0
          : end.out.some((i) => i.value === x)
            ? 1
            : 2;
        const options = ['in', 'out', 'Neither: it has been dequeued'];
        return {
          prompt: `Starting from the stacks shown, run ${calls(ask)}. Which stack holds ${x} afterwards?`,
          setup,
          answer: { kind: 'choice', options, correct: where },
          explain: `A dequeue moves values from in to out only when out is empty, and then all of them. Afterwards in holds ${list(end.inn.map((i) => i.value))} and out holds ${list(end.out.map((i) => i.value))}, bottom to top${where === 2 ? `; ${x} has already left the queue` : ''}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'cost',
      title: 'What does the next operation cost?',
      make(rng) {
        const vs = distinct(rng, 12);
        const setup = enqueues(vs.splice(0, rng.int(2, 4)));
        const before = mix(rng, setup.length, rng.int(1, 3), vs, 1);
        const fullSetup = [...setup, ...before];
        const op: OpCall = rng.int(0, 3) ? ['dequeue'] : ['peek'];
        const t = run([...fullSetup, op]);
        const cost = t.endState().history.at(-1)!;
        const start = t.entries.length >= 2 ? t.entries.at(-2)!.end : t.initial.state;
        return {
          prompt: `How many stack operations (pushes plus pops) does \`${op[0]}()\` cost on the stacks shown?`,
          setup: fullSetup,
          answer: { kind: 'number', value: cost },
          explain:
            start.out.length > 0
              ? `out is not empty, so nothing moves: ${op[0] === 'dequeue' ? 'one pop' : 'a look at its top, no pushes or pops'}. ${cost}.`
              : `out is empty, so all ${start.inn.length} values on in move across first, a pop and a push each: ${2 * start.inn.length}${op[0] === 'dequeue' ? `, plus the pop that takes the front: ${cost}` : ''}.`,
          watch: [op],
        };
      },
    },
    {
      id: 'total',
      title: 'What does the whole run cost?',
      make(rng) {
        const vs = distinct(rng, 12);
        const ask = mix(rng, 0, rng.int(6, 8), vs);
        const t = run(ask);
        const end = t.endState();
        const total = end.pushes + end.pops;
        return {
          prompt: `Starting from an empty queue, run ${calls(ask)}. How many stack operations (pushes plus pops) do they cost in all?`,
          setup: [],
          answer: { kind: 'number', value: total },
          explain: `Each value is pushed onto in, and once it is dequeued it has also been popped off in, pushed onto out and popped off out: at most 4 each. The operations cost ${end.history.join(', ')}: ${total} in all, at most ${3 * ask.length} = 3 × ${ask.length}.`,
          watch: ask,
        };
      },
    },
    spotItKind({
      page: 'two-stack-queue',
      rows: SPOT_ROWS,
      setup: enqueues([1, 2, 3, 4]),
      watch: [['dequeue'], ['enqueue', 5], ['dequeue']],
    }),
  ];
}
