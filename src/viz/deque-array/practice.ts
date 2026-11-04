import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeAnswer, PracticeKind, VizDef } from '../../engine/types';
import { defaults, items, type DequeExtra, type DequeSettings, type DequeState } from './model';

type Def = VizDef<DequeState, DequeSettings, DequeExtra>;

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

/** Adds at random ends. */
const adds = (rng: Rng, values: number[]): OpCall[] =>
  values.map((v) => [rng.int(0, 1) ? 'addFirst' : 'addLast', v]);

/** Practice questions for the circular-array deque. Every answer comes from running the model. */
export function dequePractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: DequeSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);

  return [
    {
      id: 'remove-returns',
      title: 'Which item comes off?',
      make(rng) {
        const setup = adds(rng, distinct(rng, rng.int(3, 5)));
        const first = rng.int(0, 1) === 1;
        const deque = items(run(setup).endState()).map(String);
        const right = first ? deque[0]! : deque[deque.length - 1]!;
        const op = first ? 'removeFirst' : 'removeLast';
        return {
          prompt: `The deque shows the result of ${calls(setup)}. What does \`${op}()\` return?`,
          setup,
          answer: choice(rng, right, shuffle(rng, deque)),
          explain: first
            ? `removeFirst takes the item at front, A[front] = ${right}.`
            : `removeLast takes the item just before rear, A[(rear - 1) mod 8] = ${right}.`,
          watch: [[op]],
        };
      },
    },
    {
      id: 'front-after',
      title: 'Where does front go?',
      make(rng) {
        const values = distinct(rng, 6);
        const setup: OpCall[] = values.slice(0, rng.int(0, 2)).map((v): OpCall => ['addLast', v]);
        const ask: OpCall[] = values.slice(3, 3 + rng.int(1, 3)).map((v) => ['addFirst', v]);
        const end = run([...setup, ...ask]).endState();
        return {
          prompt: `The array has capacity 8. Starting from the picture, run ${calls(ask)}. What is \`front\` afterwards?`,
          setup,
          answer: { kind: 'number', value: end.front },
          explain: `Each addFirst moves front back one slot, and stepping back from index 0 wraps to the last index, 7. After ${ask.length} of them front is ${end.front}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'contents',
      title: 'What is left, front to back?',
      make(rng) {
        const values = distinct(rng, 7);
        const setup = adds(rng, values.slice(0, 2));
        const ask: OpCall[] = values.slice(2).map((v): OpCall => {
          const r = rng.int(0, 3);
          return r === 0
            ? ['addFirst', v]
            : r === 1
              ? ['addLast', v]
              : r === 2
                ? ['removeFirst']
                : ['removeLast'];
        });
        const left = items(run([...setup, ...ask]).endState()).map(String);
        return {
          prompt: `Starting from the deque shown, run ${calls(ask)}. Type what is left, from front to back. Leave it blank if the deque is empty.`,
          setup,
          answer: { kind: 'sequence', value: left },
          explain: left.length
            ? `From front to back the deque holds ${left.join(', ')}.`
            : 'The removals take everything, so the deque is empty.',
          watch: ask,
        };
      },
    },
  ];
}
