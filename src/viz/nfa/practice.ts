import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { EPS, type Automaton } from '../_automata/automaton';
import { loadCall, setText } from '../_automata/page';
import { randomNfa, randomWord } from '../_automata/random';
import { defaults, type NfaExtra, type NfaRun, type NfaSettings, type NfaState } from './model';

type Def = VizDef<NfaState, NfaSettings, NfaExtra>;

const code = (s: string) => `\`${s}\``;

/**
 * Practice for NFA runs. Every answer comes from running the model: the sets are read from the
 * steps of a run on the machine in the picture.
 */
export function nfaPractice(def: () => Def): PracticeKind[] {
  const steps = (a: Automaton, word: string) =>
    new Timeline(def(), defaults, 1, [loadCall(a), ['run', word || 'eps']]).entries.at(-1)!.steps;
  const end = (a: Automaton, word: string): NfaRun => steps(a, word).at(-1)!.extra!.run!;
  const watch = (word: string): OpCall[] => [['run', word || 'eps']];

  /** A random NFA whose runs are worth asking about: the sets do not all die at once. */
  function question(rng: Rng, eps = true) {
    for (;;) {
      const a = randomNfa(rng, rng.int(3, 5), { eps });
      const w = randomWord(rng, a.alphabet, rng.int(3, 5));
      const r = end(a, w);
      if (!r.dead || rng.int(0, 3) === 0) return { a, w, r, setup: [loadCall(a)] as OpCall[] };
    }
  }

  return [
    {
      id: 'final-set',
      title: 'Which states are active at the end?',
      make(rng) {
        const { w, r, setup } = question(rng);
        return {
          prompt: `Run this NFA on ${code(w)}, following ε-moves after every symbol. Which states are active at the end? Type them in name order, or leave it blank if every branch dies.`,
          setup,
          answer: { kind: 'sequence', value: r.set },
          explain: r.dead
            ? 'Every branch dies before the end of the word, so no state is active.'
            : `From the start, the sets are ${r.rows.map(setText).join(', ')}. The last one is ${setText(r.set)}.`,
          watch: watch(w),
        };
      },
    },
    {
      id: 'accepts',
      title: 'Accept or reject?',
      make(rng) {
        const { a, w, r, setup } = question(rng);
        const acc = r.set.filter((q) => a.accept.includes(q));
        return {
          prompt: `Does this NFA accept ${code(w)}?`,
          setup,
          answer: { kind: 'choice', options: ['Accept', 'Reject'], correct: acc.length ? 0 : 1 },
          explain: r.dead
            ? 'Every branch dies before the end of the word, so it is rejected.'
            : acc.length
              ? `The final set ${setText(r.set)} contains ${acc.join(' and ')}, an accept state. One accepting branch is enough.`
              : `The final set ${setText(r.set)} has no accept state, so every branch ends outside F.`,
          watch: watch(w),
        };
      },
    },
    {
      id: 'closure',
      title: 'Where does it start?',
      make(rng) {
        for (;;) {
          const a = randomNfa(rng, rng.int(4, 5));
          if (!a.moves.some((m) => m.on === EPS && m.from === a.start)) continue;
          const start = end(a, '').rows[0]!;
          return {
            prompt: `Before reading anything, this NFA follows the ε-moves from ${a.start}. Which states are active then? Type them in name order.`,
            setup: [loadCall(a)],
            answer: { kind: 'sequence', value: start },
            explain: `E(${setText([a.start])}) holds ${a.start} and every state its ε-moves reach, following ε-moves from those too: ${setText(start)}.`,
            watch: watch(''),
          };
        }
      },
    },
    {
      id: 'count',
      title: 'How many states are active?',
      make(rng) {
        const { a, w, setup } = question(rng);
        const k = rng.int(1, w.length);
        const run = end(a, w);
        const set = run.rows[k] ?? [];
        return {
          prompt: `Run this NFA on ${code(w)}. How many states are active right after the first ${k === 1 ? 'symbol is' : `${k} symbols are`} read, ε-moves included?`,
          setup,
          answer: { kind: 'number', value: set.length },
          explain: run.rows[k]
            ? `After ${code(w.slice(0, k))} the set is ${setText(set)}: ${set.length} ${set.length === 1 ? 'state' : 'states'}.`
            : `Every branch has died by then, so no state is active.`,
          watch: watch(w),
        };
      },
    },
  ];
}
