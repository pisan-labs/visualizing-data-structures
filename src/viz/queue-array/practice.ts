import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeAnswer, PracticeKind, VizDef } from '../../engine/types';
import { defaults, items, type QueueExtra, type QueueSettings, type QueueState } from './model';

type Def = VizDef<QueueState, QueueSettings, QueueExtra>;

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

/** A multiple-choice answer: the right option plus up to three distinct wrong ones. */
function choice(rng: Rng, right: string, wrong: string[]): PracticeAnswer {
  const others = [...new Set(wrong.filter((w) => w !== right))].slice(0, 3);
  const options = shuffle(rng, [right, ...others]);
  return { kind: 'choice', options, correct: options.indexOf(right) };
}

/**
 * Practice questions for the circular-array queue. Every answer comes from running the model.
 * `def` is a getter to avoid an import cycle.
 */
export function queuePractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: QueueSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);
  const small: QueueSettings = { ...defaults, capacity: 6 };

  return [
    {
      id: 'dequeue-returns',
      title: 'What does dequeue return?',
      make(rng) {
        const setup: OpCall[] = distinct(rng, rng.int(2, 5)).map((v) => ['enqueue', v]);
        if (rng.int(0, 1)) setup.push(['dequeue']);
        const queue = items(run(setup).endState()).map(String);
        const front = queue[0]!;
        return {
          prompt: `The queue shows the result of ${calls(setup)}. What does \`dequeue()\` return?`,
          setup,
          answer: choice(
            rng,
            front,
            shuffle(rng, [...queue.slice(1), ...distinct(rng, 3).map(String)]),
          ),
          explain: `A queue is first in, first out. The front item, ${front}, has waited longest.`,
          watch: [['dequeue']],
        };
      },
    },
    {
      id: 'front-rear',
      title: 'Where do front and rear end up?',
      make(rng) {
        const values = distinct(rng, 9);
        const setup: OpCall[] = [
          ...values.slice(0, rng.int(3, 5)).map((v): OpCall => ['enqueue', v]),
          ...Array.from({ length: rng.int(1, 3) }, (): OpCall => ['dequeue']),
        ];
        const ask: OpCall[] = Array.from({ length: 4 }, (_, i) =>
          rng.int(0, 2) ? ['enqueue', values[5 + i]!] : ['dequeue'],
        );
        const end = run([...setup, ...ask], small).endState();
        return {
          prompt: `This queue has capacity 6 and leaves one slot empty. Starting from the picture, run ${calls(ask)}. Type the final \`front\` and \`rear\`, separated by a space.`,
          setup,
          settings: small,
          answer: { kind: 'sequence', value: [String(end.front), String(end.rear)] },
          explain: `Each enqueue moves rear one slot forward and each dequeue moves front, both wrapping from 5 back to 0. An enqueue into a full queue or a dequeue from an empty one changes nothing. They end at front = ${end.front} and rear = ${end.rear}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'next-slot',
      title: 'Which slot does enqueue fill?',
      make(rng) {
        // Move the queue along the array so rear is often near the end, or past it.
        const values = distinct(rng, 9);
        const filled = rng.int(3, 5);
        const removed = rng.int(2, filled);
        // At most 4 items, so the queue (5 usable slots) is never full and the enqueue happens.
        const extra = Math.min(rng.int(0, 2), 4 - (filled - removed));
        const setup: OpCall[] = [
          ...values.slice(0, filled).map((v): OpCall => ['enqueue', v]),
          ...Array.from({ length: removed }, (): OpCall => ['dequeue']),
          ...values.slice(filled, filled + extra).map((v): OpCall => ['enqueue', v]),
        ];
        const before = run(setup, small).endState();
        const x = values[8]!;
        return {
          prompt: `The queue has capacity 6. Which index of \`A\` does \`enqueue(${x})\` write to?`,
          setup,
          settings: small,
          answer: { kind: 'number', value: before.rear },
          explain: `enqueue stores the new item at A[rear], and rear is ${before.rear}. After the store, rear moves on to (${before.rear} + 1) mod 6 = ${(before.rear + 1) % 6}.`,
          watch: [['enqueue', x]],
        };
      },
    },
    {
      id: 'overflow',
      title: 'Does it fit?',
      make(rng) {
        const settings: QueueSettings = { ...defaults, capacity: 5 };
        const values = distinct(rng, 7);
        const setup: OpCall[] = values.slice(0, rng.int(3, 4)).map((v) => ['enqueue', v]);
        if (rng.int(0, 1)) setup.push(['dequeue'], ['enqueue', values[5]!]);
        const count = run(setup, settings).endState().count;
        const fits = count < 4;
        const options = ['Yes, it overflows', 'No, it fits'];
        return {
          prompt: `This queue has 5 slots and leaves one of them empty. Does \`enqueue(${values[6]})\` overflow?`,
          setup,
          settings,
          answer: { kind: 'choice', options, correct: fits ? 1 : 0 },
          explain: fits
            ? `The queue holds ${count} items. With one slot always left empty, 5 slots hold 4 items, so there is room for one more.`
            : 'The queue already holds 4 items. With one slot always left empty, that is all 5 slots can hold, so the slot after rear is front and the enqueue fails.',
          watch: [['enqueue', values[6]!]],
        };
      },
    },
  ];
}
