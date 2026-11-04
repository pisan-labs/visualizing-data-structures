import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeAnswer, PracticeKind, VizDef } from '../../engine/types';
import { items, type DequeListExtra, type DequeListSettings, type DequeListState } from './model';

type Def = VizDef<DequeListState, DequeListSettings, DequeListExtra>;

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

const adds = (rng: Rng, values: number[]): OpCall[] =>
  values.map((v) => [rng.int(0, 1) ? 'addFirst' : 'addLast', v]);

/** Practice questions for the linked deque. Every answer comes from running the model. */
export function dequeListPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), {}, 1, cs);

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
            ? `removeFirst returns head.value: ${right}.`
            : `removeLast returns tail.value: ${right}.`,
          watch: [[op]],
        };
      },
    },
    {
      id: 'contents',
      title: 'What is left, head to tail?',
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
          prompt: `Starting from the deque shown, run ${calls(ask)}. Type what is left, from head to tail. Leave it blank if the deque is empty.`,
          setup,
          answer: { kind: 'sequence', value: left },
          explain: left.length
            ? `Following next from head, the list holds ${left.join(', ')}. Following prev from tail gives the same items backwards.`
            : 'The removals take every node, so head and tail are null.',
          watch: ask,
        };
      },
    },
    {
      id: 'tail-prev',
      title: 'What comes before tail?',
      make(rng) {
        const values = distinct(rng, 6);
        // At least two nodes, so a removeLast still leaves a tail to ask about.
        const setup = adds(rng, values.slice(0, rng.int(2, 4)));
        const ask: OpCall[] = rng.int(0, 1) ? [['removeLast']] : [['addLast', values[5]!]];
        const deque = items(run([...setup, ...ask]).endState());
        const before = deque.length >= 2 ? String(deque[deque.length - 2]) : 'null';
        return {
          prompt: `Starting from the deque shown, run ${calls(ask)}. What does \`tail.prev\` point at afterwards?`,
          setup,
          answer: choice(rng, before, shuffle(rng, ['null', ...values.map(String)])),
          explain:
            before === 'null'
              ? 'Only one node is left. It is both head and tail, and its prev is null.'
              : `tail.prev is the second-to-last node, holding ${before}.`,
          watch: ask,
        };
      },
    },
  ];
}
