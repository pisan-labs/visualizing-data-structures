import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { setText, type Automaton } from '../_automata/automaton';
import { defaults, type ConvRun, type NdExtra, type NdSettings, type NfaState } from './model';
import { loadCall, randomNfa } from './presets';

type Def = VizDef<NfaState, NdSettings, NdExtra>;

const code = (s: string) => `\`${s}\``;

/**
 * Practice for the subset construction. Every answer comes from running the model: the start
 * set, the moves, the number of states and the accept states are read from the last step of
 * a Convert run.
 */
export function nfaToDfaPractice(def: () => Def): PracticeKind[] {
  function setup(rng: Rng, eps = 0.45) {
    const nfa = randomNfa(rng, rng.int(3, 4), { eps, maxDfa: 8, minDfa: 3 });
    const calls: OpCall[] = [loadCall(nfa)];
    const t = new Timeline(def(), defaults, 1, [...calls, ['convert']]);
    const r = t.entries.at(-1)!.steps.at(-1)!.extra!.run!;
    return { nfa, setup: calls, r, watch: [['convert']] as OpCall[] };
  }
  const intro = (nfa: Automaton) =>
    `Build the DFA for this NFA with the subset construction (start ${nfa.start}${nfa.accept.length ? `, accept ${nfa.accept.join(', ')}` : ''}).`;
  const setOf = (r: ConvRun, name: string) => r.rows.find((row) => row.name === name)!.set;

  return [
    {
      id: 'start-set',
      title: 'Where does the DFA start?',
      make(rng) {
        for (;;) {
          const { nfa, setup: s, r, watch } = setup(rng, 0.7);
          const start = setOf(r, r.start!);
          if (start.length < 2) continue;
          return {
            prompt: `${intro(nfa)} Which NFA states make up the DFA's start state? Type them in name order.`,
            setup: s,
            answer: { kind: 'sequence', value: start },
            explain: `The start state is E(${setText([nfa.start])}): ${nfa.start} and every state its ε-moves reach, directly or through other ε-moves. That is ${setText(start)}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'move-set',
      title: 'Where does a set go?',
      make(rng) {
        for (;;) {
          const { nfa, setup: s, r, watch } = setup(rng);
          const options = r.moves.filter(
            (m) => m.from !== r.start && setOf(r, m.to).length > 0 && setOf(r, m.from).length > 1,
          );
          if (!options.length) continue;
          const m = options[rng.int(0, options.length - 1)]!;
          const from = setOf(r, m.from);
          const to = setOf(r, m.to);
          return {
            prompt: `${intro(nfa)} One DFA state is the set ${setText(from)}. Which NFA states make up its move on ${code(m.on)}? Type them in name order.`,
            setup: s,
            answer: { kind: 'sequence', value: to },
            explain: `Follow every ${m.on}-move out of ${setText(from)}, then add what ε-moves reach from there: E(M) = ${setText(to)}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'dfa-size',
      title: 'How many states?',
      make(rng) {
        const { nfa, setup: s, r, watch } = setup(rng);
        const k = r.rows.length;
        const dead = r.rows.some((row) => row.set.length === 0);
        return {
          prompt: `${intro(nfa)} Counting only the sets the start can reach, and ∅ if it turns up, how many states does the DFA have?`,
          setup: s,
          answer: { kind: 'number', value: k },
          explain: `Breadth first from the start set, ${k} different sets turn up: ${r.rows.map((row) => setText(row.set)).join(', ')}.${dead ? ' One of them is ∅, the dead state.' : ''} The NFA has ${nfa.states.length} states, so there are ${2 ** nfa.states.length} subsets in all.`,
          watch,
        };
      },
    },
    {
      id: 'accepting',
      title: 'Which states accept?',
      make(rng) {
        for (;;) {
          const { nfa, setup: s, r, watch } = setup(rng);
          if (r.accept.length === 0 || r.accept.length === r.rows.length) continue;
          const sets = r.accept.map((n) => setText(setOf(r, n)));
          return {
            prompt: `${intro(nfa)} How many of the DFA's states accept?`,
            setup: s,
            answer: { kind: 'number', value: r.accept.length },
            explain: `A DFA state accepts when its set holds an accept state of the NFA (${nfa.accept.join(', ')}). ${sets.length === 1 ? 'One set does' : `${sets.length} sets do`}: ${sets.join(', ')}.`,
            watch,
          };
        }
      },
    },
  ];
}
