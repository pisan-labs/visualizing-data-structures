import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { defaults, type StackExtra, type StackSettings, type StackState } from './model';

type Def = VizDef<StackState, StackSettings, StackExtra>;

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

/**
 * Practice questions for the array stack. Answers come from running the model, so they always
 * agree with what the visualization shows. `def` is a getter to avoid an import cycle.
 */
export function stackPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: StackSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);
  const contents = (t: Timeline<StackState, StackSettings, StackExtra>) => {
    const s = t.endState();
    return s.slots.slice(0, s.size).map((x) => String(x!.value));
  };

  return [
    {
      id: 'pop-returns',
      title: 'What does pop return?',
      make(rng) {
        const setup: OpCall[] = distinct(rng, rng.int(2, 5)).map((v) => ['push', v]);
        if (rng.int(0, 1)) setup.push(['pop']);
        const stack = contents(run(setup));
        const top = stack[stack.length - 1]!;
        // A random filler can repeat a value already on the stack: offer each value once.
        const fillers = new Set([...stack.slice(0, -1), ...distinct(rng, 3).map(String)]);
        const others = shuffle(rng, [...fillers])
          .filter((v) => v !== top)
          .slice(0, 3);
        const options = shuffle(rng, [top, ...others]);
        return {
          prompt: `The stack shows the result of ${calls(setup)}. What does \`pop()\` return?`,
          setup,
          answer: { kind: 'choice', options, correct: options.indexOf(top) },
          explain: `The top item is the most recent push that has not been popped yet: ${top}.`,
          watch: [['pop']],
        };
      },
    },
    {
      id: 'top-after',
      title: 'Where does top end up?',
      make(rng) {
        const setup: OpCall[] = distinct(rng, rng.int(1, 3)).map((v) => ['push', v]);
        const values = distinct(rng, 4);
        const ask: OpCall[] = Array.from({ length: 4 }, (_, i) =>
          rng.int(0, 1) ? ['push', values[i]!] : ['pop'],
        );
        const end = run([...setup, ...ask]).endState();
        return {
          prompt: `Starting from the stack shown, run ${calls(ask)}. What is \`top\` afterwards? Here \`top\` counts the items.`,
          setup,
          answer: { kind: 'number', value: end.size },
          explain: `Each push adds one and each pop takes one away, but a pop on an empty stack changes nothing. \`top\` ends at ${end.size}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'contents-after',
      title: 'What is left in the stack?',
      make(rng) {
        const setup: OpCall[] = distinct(rng, 2).map((v) => ['push', v]);
        const values = distinct(rng, 4);
        const ask: OpCall[] = Array.from({ length: 4 }, (_, i) =>
          rng.int(0, 2) ? ['push', values[i]!] : ['pop'],
        );
        const left = contents(run([...setup, ...ask]));
        return {
          prompt: `Starting from the stack shown, run ${calls(ask)}. Type what is left, from bottom to top. Leave it blank if the stack is empty.`,
          setup,
          answer: { kind: 'sequence', value: left },
          explain: left.length
            ? `Bottom to top, the stack holds ${left.join(', ')}. Every pop removes the most recent push that is still there.`
            : 'The pops remove everything, so the stack is empty.',
          watch: ask,
        };
      },
    },
    {
      id: 'overflow',
      title: 'Does it fit?',
      make(rng) {
        const settings: Settings = { ...defaults, capacity: 4 };
        const setup: OpCall[] = distinct(rng, rng.int(3, 4)).map((v) => ['push', v]);
        const x = rng.int(1, 99);
        const before = run(setup, settings as StackSettings).endState().size;
        const fits = before < 4;
        const options = ['Yes, it overflows', 'No, it fits'];
        return {
          prompt: `This stack has capacity 4. Does \`push(${x})\` overflow?`,
          setup,
          settings,
          answer: { kind: 'choice', options, correct: fits ? 1 : 0 },
          explain: fits
            ? `The stack holds ${before} items, so there is room for one more.`
            : 'The stack already holds 4 items, so top equals the capacity and the push fails.',
          watch: [['push', x]],
        };
      },
    },
  ];
}
