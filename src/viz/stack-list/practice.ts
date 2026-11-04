import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeAnswer, PracticeKind, VizDef } from '../../engine/types';
import { items, type StackListExtra, type StackListSettings, type StackListState } from './model';

type Def = VizDef<StackListState, StackListSettings, StackListExtra>;

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

/** Practice questions for the linked stack. Every answer comes from running the model. */
export function stackListPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), {}, 1, cs);
  const mix = (rng: Rng, values: number[]): OpCall[] =>
    values.map((v) => (rng.int(0, 2) ? ['push', v] : ['pop']));

  return [
    {
      id: 'pop-returns',
      title: 'What does pop return?',
      make(rng) {
        const setup: OpCall[] = distinct(rng, rng.int(2, 5)).map((v) => ['push', v]);
        if (rng.int(0, 1)) setup.push(['pop']);
        const stack = items(run(setup).endState()).map(String);
        return {
          prompt: `The stack shows the result of ${calls(setup)}. What does \`pop()\` return?`,
          setup,
          answer: choice(
            rng,
            stack[0]!,
            shuffle(rng, [...stack.slice(1), ...distinct(rng, 3).map(String)]),
          ),
          explain: `pop returns top.value, and top points at the most recent push that is still there: ${stack[0]}.`,
          watch: [['pop']],
        };
      },
    },
    {
      id: 'top-after',
      title: 'What does top point at?',
      make(rng) {
        const values = distinct(rng, 7);
        const setup: OpCall[] = values.slice(0, 2).map((v) => ['push', v]);
        const ask = mix(rng, values.slice(2));
        const top = items(run([...setup, ...ask]).endState())[0];
        const right = top === undefined ? 'null' : String(top);
        return {
          prompt: `Starting from the stack shown, run ${calls(ask)}. What does \`top\` point at afterwards?`,
          setup,
          answer: choice(rng, right, shuffle(rng, ['null', ...values.map(String)])),
          explain:
            top === undefined
              ? 'The pops take every node, so top is null.'
              : `Each push puts a node in front and each pop moves top one link along. top ends at the node holding ${top}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'contents',
      title: 'What is left in the stack?',
      make(rng) {
        const values = distinct(rng, 6);
        const setup: OpCall[] = values.slice(0, 2).map((v) => ['push', v]);
        const ask = mix(rng, values.slice(2));
        const left = items(run([...setup, ...ask]).endState()).map(String);
        return {
          prompt: `Starting from the stack shown, run ${calls(ask)}. Type the values left, from top to bottom. Leave it blank if the stack is empty.`,
          setup,
          answer: { kind: 'sequence', value: left },
          explain: left.length
            ? `Following next from top, the list holds ${left.join(', ')}, then null.`
            : 'The pops take every node, so top is null and nothing is left.',
          watch: ask,
        };
      },
    },
  ];
}
