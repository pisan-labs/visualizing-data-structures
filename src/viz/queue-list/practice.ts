import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeAnswer, PracticeKind, VizDef } from '../../engine/types';
import { items, type QueueListExtra, type QueueListSettings, type QueueListState } from './model';

type Def = VizDef<QueueListState, QueueListSettings, QueueListExtra>;

const call = ([op, ...args]: OpCall) => `\`${op}(${args.join(', ')})\``;
const calls = (cs: OpCall[]) => cs.map(call).join(', ');

function distinct(rng: Rng, n: number): number[] {
  const out = new Set<number>();
  while (out.size < n) out.add(rng.int(1, 99));
  return [...out];
}

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function choice(rng: Rng, right: string, wrong: string[]): PracticeAnswer {
  const others = [...new Set(wrong.filter((w) => w !== right))].slice(0, 3);
  const options = shuffle(rng, [right, ...others]);
  return { kind: 'choice', options, correct: options.indexOf(right) };
}

/** Practice questions for the linked queue. Every answer comes from running the model. */
export function queueListPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), {}, 1, cs);
  const mix = (rng: Rng, values: number[]): OpCall[] =>
    values.map((v) => (rng.int(0, 2) ? ['enqueue', v] : ['dequeue']));

  return [
    {
      id: 'dequeue-returns',
      title: 'What does dequeue return?',
      make(rng) {
        const setup: OpCall[] = distinct(rng, rng.int(2, 5)).map((v) => ['enqueue', v]);
        if (rng.int(0, 1)) setup.push(['dequeue']);
        const queue = items(run(setup).endState()).map(String);
        return {
          prompt: `The queue shows the result of ${calls(setup)}. What does \`dequeue()\` return?`,
          setup,
          answer: choice(
            rng,
            queue[0]!,
            shuffle(rng, [...queue.slice(1), ...distinct(rng, 3).map(String)]),
          ),
          explain: `dequeue returns head.value. head points at the oldest item still in the queue: ${queue[0]}.`,
          watch: [['dequeue']],
        };
      },
    },
    {
      id: 'tail-after',
      title: 'What does tail point at?',
      make(rng) {
        const values = distinct(rng, 7);
        const setup: OpCall[] = values.slice(0, rng.int(0, 2)).map((v) => ['enqueue', v]);
        const ask = mix(rng, values.slice(3));
        const queue = items(run([...setup, ...ask]).endState());
        const tail = queue[queue.length - 1];
        const right = tail === undefined ? 'null' : String(tail);
        return {
          prompt: `Starting from the queue shown, run ${calls(ask)}. What does \`tail\` point at afterwards?`,
          setup,
          answer: choice(rng, right, shuffle(rng, ['null', ...values.map(String)])),
          explain:
            tail === undefined
              ? 'The queue ends up empty, and the last dequeue sets tail to null along with head.'
              : `tail points at the most recent enqueue still in the queue: ${tail}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'contents',
      title: 'What is left in the queue?',
      make(rng) {
        const values = distinct(rng, 6);
        const setup: OpCall[] = values.slice(0, 2).map((v) => ['enqueue', v]);
        const ask = mix(rng, values.slice(2));
        const left = items(run([...setup, ...ask]).endState()).map(String);
        return {
          prompt: `Starting from the queue shown, run ${calls(ask)}. Type the values left, from head to tail. Leave it blank if the queue is empty.`,
          setup,
          answer: { kind: 'sequence', value: left },
          explain: left.length
            ? `Following next from head, the list holds ${left.join(', ')}, then null.`
            : 'The dequeues take every node, so head and tail are null.',
          watch: ask,
        };
      },
    },
    {
      id: 'enqueue-branch',
      title: 'Which line links the new node?',
      make(rng) {
        const values = distinct(rng, 4);
        const setup: OpCall[] = values.slice(0, rng.int(1, 2)).map((v) => ['enqueue', v]);
        if (rng.int(0, 1)) setup.push(...setup.map((): OpCall => ['dequeue']));
        const ask: OpCall = ['enqueue', values[3]!];
        const lines = run([...setup, ask])
          .entries.at(-1)!
          .steps.flatMap((s) => s.lines);
        const options = ['head = node', 'tail.next = node'];
        const empty = lines.includes('enqueue.head');
        return {
          prompt: `Starting from the queue shown, which line links in the new node during ${call(ask)}?`,
          setup,
          answer: { kind: 'choice', options, correct: empty ? 0 : 1 },
          explain: empty
            ? 'The queue is empty, so tail is null and there is no last node to hang the new one on. head = node makes it the front, and tail = node follows.'
            : 'tail is not null, so the new node goes after the current last node: tail.next = node, then tail = node.',
          watch: [ask],
        };
      },
    },
  ];
}
