import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import type { Automaton } from '../_automata/automaton';
import { loadCall, wordText } from '../_automata/page';
import { randomDfa, randomWord } from '../_automata/random';
import { defaults, type DfaExtra, type DfaRun, type DfaSettings, type DfaState } from './model';

type Def = VizDef<DfaState, DfaSettings, DfaExtra>;

const code = (s: string) => `\`${s}\``;

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Practice for DFA runs. Every answer comes from running the model: the end state, the path
 * and the verdict are read from the steps of a run on the machine in the picture.
 */
export function dfaPractice(def: () => Def): PracticeKind[] {
  /** Run the word on the machine and return the steps of the run. */
  const steps = (a: Automaton, word: string) =>
    new Timeline(def(), defaults, 1, [loadCall(a), ['run', word || 'eps']]).entries.at(-1)!.steps;
  const end = (a: Automaton, word: string): DfaRun => steps(a, word).at(-1)!.extra!.run!;
  /** The states the run is in: at the start, then after each move. */
  const path = (a: Automaton, word: string): string[] =>
    steps(a, word)
      .filter((s, i) => i === 0 || s.lines.includes('run.move'))
      .map((s) => s.extra!.run!.q);
  const watch = (word: string): OpCall[] => [['run', word || 'eps']];

  function question(rng: Rng, partial = false) {
    const a = randomDfa(rng, rng.int(3, 4), { partial });
    const w = randomWord(rng, a.alphabet, rng.int(4, 6));
    return { a, w, setup: [loadCall(a)] as OpCall[] };
  }

  return [
    {
      id: 'end-state',
      title: 'Where does it end?',
      make(rng) {
        const { a, w, setup } = question(rng);
        const r = end(a, w);
        const states = path(a, w);
        return {
          prompt: `Run this DFA on ${code(w)}. Which state does it end in?`,
          setup,
          answer: { kind: 'choice', options: a.states, correct: a.states.indexOf(r.q) },
          explain: `Follow one arrow per symbol from ${a.start}: ${states.join(' → ')}. The run ends in ${r.q}.`,
          watch: watch(w),
        };
      },
    },
    {
      id: 'accepts',
      title: 'Accept or reject?',
      make(rng) {
        const { a, w, setup } = question(rng, rng.int(0, 1) === 1);
        const r = end(a, w);
        const options = ['Accept', 'Reject'];
        const why = r.stuck
          ? `After ${r.read} ${r.read === 1 ? 'symbol' : 'symbols'} the run is in ${r.q}, and ${r.q} has no move on ${r.word[r.read]}. A missing move rejects.`
          : `The run ends in ${r.q}, which ${r.verdict === 'accept' ? 'is' : 'is not'} an accept state.`;
        return {
          prompt: `Does this DFA accept ${code(w)}? A move that is not drawn is missing.`,
          setup,
          answer: { kind: 'choice', options, correct: r.verdict === 'accept' ? 0 : 1 },
          explain: why,
          watch: watch(w),
        };
      },
    },
    {
      id: 'path',
      title: 'Which states does it pass through?',
      make(rng) {
        const { a, w, setup } = question(rng);
        const states = path(a, w);
        return {
          prompt: `Run this DFA on ${code(w)}. Type the states it is in, starting with ${a.start} before the first symbol and ending with the state after the last.`,
          setup,
          answer: { kind: 'sequence', value: states },
          explain: `A DFA has exactly one move per state and symbol, so there is one path: ${states.join(', ')}. That is ${states.length} states for ${w.length} symbols.`,
          watch: watch(w),
        };
      },
    },
    {
      id: 'which-word',
      title: 'Which word is accepted?',
      make(rng) {
        for (;;) {
          const a = randomDfa(rng, rng.int(3, 4));
          const words = [
            ...new Set(Array.from({ length: 4 }, () => randomWord(rng, a.alphabet, rng.int(2, 5)))),
          ];
          if (words.length < 4) continue;
          const yes = words.filter((w) => end(a, w).verdict === 'accept');
          if (yes.length !== 1) continue;
          const options = shuffle(rng, words);
          const w = yes[0]!;
          const r = end(a, w);
          return {
            prompt: 'Exactly one of these words is accepted by this DFA. Which one?',
            setup: [loadCall(a)],
            answer: { kind: 'choice', options, correct: options.indexOf(w) },
            explain: `${wordText(w)} ends in ${r.q}, an accept state. Each of the others ends outside F.`,
            watch: [['test', options.join(' ')]],
          };
        }
      },
    },
  ];
}
