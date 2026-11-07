import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { randomRegex, randomWord } from './gen';
import { braces, defaults, type RxExtra, type RxSettings, type RxState } from './model';
import { parse, show } from './syntax';

type Def = VizDef<RxState, RxSettings, RxExtra>;

const code = (s: string) => `\`${s}\``;
const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** The text with only the parentheses it needs. */
const tidy = (text: string) => {
  const p = parse(text, '|');
  return p instanceof Error ? text : show(p.tree.r);
};

/**
 * Practice for the regex-to-NFA page. Every answer comes from running the model, so it agrees
 * with what the page shows. `def` is a getter to avoid an import cycle.
 */
export function rxPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: RxSettings = defaults) =>
    new Timeline(def(), settings, 1, cs).endState();
  /** A small expression with some structure, 2 to `most` symbols. */
  const small = (rng: Rng, most = 3) => show(randomRegex(rng, rng.int(2, most)));

  return [
    {
      id: 'states-after',
      title: 'How many states?',
      make(rng) {
        const how = pick(rng, ['thompson', 'sipser'] as const);
        const settings: RxSettings = { ...defaults, construction: how };
        const text = small(rng);
        const wrap = pick(rng, ['star', 'union', 'concat', 'opt'] as const);
        const outer = tidy(
          { star: `(${text})*`, union: `(${text})|a`, concat: `(${text})b`, opt: `(${text})?` }[
            wrap
          ],
        );
        const setup: OpCall[] = [['build', text]];
        const before = run(setup, settings).nfa.states.length;
        const after = run([...setup, ['build', outer]], settings).nfa.states.length;
        const name = how === 'thompson' ? "Thompson's" : "Sipser's";
        const why = {
          thompson: {
            star: 'The star adds a new start and a new accept state.',
            union:
              'The symbol a is 2 states, and the union adds a new start and a new accept state.',
            concat: 'The symbol b is 2 states; concatenation only adds an ε-arrow.',
            opt: 'R? is built as R|ε: 2 states for the ε branch and 2 for the union.',
          },
          sipser: {
            star: 'The star adds one state, a new start that accepts.',
            union: 'The symbol a is 2 states, and the union adds one new start.',
            concat: 'The symbol b is 2 states; concatenation only adds ε-arrows.',
            opt: 'R? adds one state, a new start that accepts.',
          },
        }[how][wrap];
        return {
          prompt: `The picture shows the NFA that ${name} construction builds for ${code(text)}: ${before} states. How many states does it build for ${code(outer)}?`,
          setup,
          settings,
          answer: { kind: 'number', value: after },
          explain: `${after} states, ${after - before} more. ${why}`,
          watch: [['build', outer]],
        };
      },
    },
    {
      id: 'accept-or-reject',
      title: 'Accept or reject?',
      make(rng) {
        const text = show(randomRegex(rng, rng.int(2, 4)));
        const setup: OpCall[] = [['build', text]];
        const want = rng.int(0, 1) ? 'accept' : 'reject';
        let w = randomWord(rng, rng.int(1, 4));
        for (let i = 0; i < 30 && run([...setup, ['run', w]]).run!.result !== want; i++)
          w = randomWord(rng, rng.int(1, 4));
        const end = run([...setup, ['run', w]]).run!;
        const ok = end.result === 'accept';
        const options = ['Accept', 'Reject'];
        const fin = end.set.filter((q) => run(setup).nfa.accept.includes(q));
        return {
          prompt: `Does this NFA for ${code(text)} accept ${code(w)}?`,
          setup,
          answer: { kind: 'choice', options, correct: ok ? 0 : 1 },
          explain: ok
            ? `After reading ${w}, the active states include ${fin.join(' and ')}, an accept state.`
            : end.set.length
              ? `After reading ${w}, the active states are ${braces(end.set)}, and none of them accepts.`
              : `Partway through ${w}, no state has a move on the next symbol, so every path dies.`,
          watch: [['run', w]],
        };
      },
    },
    {
      id: 'start-closure',
      title: 'The ε-closure of the start state',
      make(rng) {
        let text = small(rng);
        for (let i = 0; i < 10 && !/[*|?]/.test(text); i++) text = small(rng);
        const setup: OpCall[] = [['build', text]];
        const set = run([...setup, ['run', 'ε']]).run!.set;
        return {
          prompt: `Which states can this NFA for ${code(text)} be in before it reads anything? That is the ε-closure of the start state q0: q0 and every state it reaches by ε-arrows alone. Type them in name order.`,
          setup,
          answer: { kind: 'sequence', value: set },
          explain:
            set.length === 1
              ? 'No ε-arrow leaves q0, so the closure is q0 alone.'
              : `Follow every ε-arrow from q0, then every ε-arrow from the states it reaches, and so on: ${set.join(', ')}.`,
          watch: [['run', 'ε']],
        };
      },
    },
    {
      id: 'active-after',
      title: 'Which states are active?',
      make(rng) {
        const text = small(rng, 4);
        const w = randomWord(rng, rng.int(1, 2));
        const setup: OpCall[] = [['build', text]];
        const end = run([...setup, ['run', w]]).run!;
        return {
          prompt: `Run ${code(w)} on this NFA for ${code(text)}. After reading all of it and following the ε-arrows, which states are active? Type them in name order, or leave it blank if none are.`,
          setup,
          answer: { kind: 'sequence', value: end.set },
          explain: end.set.length
            ? `Start from the ε-closure of q0, follow the arrows for each symbol, and take the ε-closure after each one: ${braces(end.set)}.`
            : `At some symbol no active state has a move on it, so nothing is active at the end.`,
          watch: [['run', w]],
        };
      },
    },
  ];
}
