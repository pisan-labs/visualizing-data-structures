import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import {
  configText,
  furthest,
  moveLabel,
  parsePda,
  pathTo,
  search,
  successors,
  type Pda,
  type Search,
} from '../_automata/pda';
import { randomWord } from '../_automata/random';
import { MACHINES, type MachineName } from './machines';
import { defaults, type PdaExtra, type PdaSettings, type PdaState } from './model';

type Def = VizDef<PdaState, PdaSettings, PdaExtra>;

const code = (s: string) => `\`${s || 'ε'}\``;
const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
const reverse = (w: string) => [...w].reverse().join('');

/** Machines with one computation per word, and the ones that may guess. */
const DETERMINISTIC: MachineName[] = ['anbn', 'parens', 'equal'];
const ANY: MachineName[] = ['anbn', 'parens', 'equal', 'palindromes', 'grammar'];

/** A word for the machine: in its language about half the time, otherwise close to it. */
function wordFor(rng: Rng, name: MachineName): string {
  const n = rng.int(1, 3);
  const good = rng.int(0, 1) === 0;
  let w: string;
  if (name === 'anbn' || name === 'grammar') w = 'a'.repeat(n) + 'b'.repeat(n);
  else if (name === 'palindromes') {
    const h = randomWord(rng, ['a', 'b'], n);
    w = h + reverse(h);
  } else if (name === 'parens') w = pick(rng, ['()', '(())', '()()', '(()())', '(())()', '((()))']);
  else {
    const h = randomWord(rng, ['a', 'b'], n);
    w = h + [...h].map((c) => (c === 'a' ? 'b' : 'a')).join('');
  }
  if (good) return w;
  const alphabet = name === 'parens' ? ['(', ')'] : ['a', 'b'];
  return rng.int(0, 1) === 0
    ? randomWord(rng, alphabet, rng.int(2, 5))
    : w.slice(0, -1) + (rng.int(0, 1) === 0 ? '' : pick(rng, alphabet).repeat(2));
}

/**
 * Practice for pushdown automata. Every answer comes from running the model: the search, the
 * computation it found, and the moves that fit a configuration.
 */
export function pdaPractice(def: () => Def): PracticeKind[] {
  const machine = (name: MachineName) => parsePda(MACHINES[name]) as Pda;
  const setup = (name: MachineName): OpCall[] => [['load', MACHINES[name]]];
  const watch = (w: string): OpCall[] => [['run', w || 'eps']];
  /** The computation a run shows: the accepting one, or the one that got furthest. */
  const computation = (s: Search) => pathTo(s, s.found ?? furthest(s)).map((id) => s.nodes[id]!);

  return [
    {
      id: 'accepts',
      title: 'Accept or reject?',
      make(rng) {
        const name = pick(rng, ANY);
        const p = machine(name);
        const w = wordFor(rng, name);
        const s = search(p, w, defaults.accept);
        // The page's own run gives the verdict.
        const steps = new Timeline(def(), defaults, 1, [...setup(name), ...watch(w)]).entries.at(
          -1,
        )!.steps;
        const yes = steps.at(-1)!.extra!.run!.verdict === 'accept';
        const end = s.nodes[s.found ?? furthest(s)]!;
        return {
          prompt: `Does this PDA accept ${code(w)}?`,
          setup: setup(name),
          answer: { kind: 'choice', options: ['Accept', 'Reject'], correct: yes ? 0 : 1 },
          explain: yes
            ? `A computation of ${s.nodes[s.found!]!.depth} moves reads all of ${code(w)} and ends in ${configText(end.config, w)}, in the accept state ${end.config.state}.`
            : `No computation accepts. The one that got furthest stops at ${configText(end.config, w)}${end.config.pos < w.length ? ', with input left to read' : `, and ${end.config.state} does not accept`}.`,
          watch: watch(w),
        };
      },
    },
    {
      id: 'stack',
      title: 'What is on the stack?',
      make(rng) {
        for (;;) {
          const name = pick(rng, DETERMINISTIC);
          const p = machine(name);
          const w = wordFor(rng, name);
          const run = computation(search(p, w, defaults.accept));
          const read = Math.max(...run.map((n) => n.config.pos));
          if (read < 1) continue;
          const k = rng.int(1, read);
          // The configuration right after the move that read the k-th symbol.
          const at = run.find((n) => n.config.pos === k)!;
          if (!at.config.stack) continue;
          return {
            prompt: `Run this PDA on ${code(w)}. What is on the stack right after it reads the ${k === 1 ? 'first symbol' : `first ${k} symbols`}, before any ε-move? Type the symbols top first.`,
            setup: setup(name),
            answer: { kind: 'sequence', value: [...at.config.stack] },
            explain: `After ${code(w.slice(0, k))} the configuration is ${configText(at.config, w)}: the stack holds ${at.config.stack}, with ${at.config.stack[0]} on top.`,
            watch: watch(w),
          };
        }
      },
    },
    {
      id: 'moves',
      title: 'How many moves?',
      make(rng) {
        for (;;) {
          const name = pick(rng, ANY);
          const p = machine(name);
          const w = wordFor(rng, name);
          const s = search(p, w, defaults.accept);
          if (s.outcome !== 'accept') continue;
          const k = s.nodes[s.found!]!.depth;
          return {
            prompt: `This PDA accepts ${code(w)}. How many moves does the shortest accepting computation make, ε-moves included?`,
            setup: setup(name),
            answer: { kind: 'number', value: k },
            explain: `${w.length} of the moves read a symbol of ${code(w)}, one each, and the other ${k - w.length} are ε-moves${k - w.length ? ', such as pushing $ at the start and popping it at the end' : ''}: ${k} in all.`,
            watch: watch(w),
          };
        }
      },
    },
    {
      id: 'next',
      title: 'Which move comes next?',
      make(rng) {
        for (;;) {
          const name = pick(rng, DETERMINISTIC);
          const p = machine(name);
          const w = wordFor(rng, name);
          const s = search(p, w, defaults.accept);
          const run = computation(s);
          // Any configuration of the computation but the start, and not the one that accepts.
          const last = run.length - (s.outcome === 'accept' ? 2 : 1);
          if (last < 1) continue;
          const at = run[rng.int(1, last)]!;
          const out = p.moves
            .map((m, i) => ({ m, i }))
            .filter(({ m }) => m.from === at.config.state);
          const next = successors(p, w, at.config);
          const NONE = 'None fits: the branch dies';
          const options = [...out.map(({ m }) => `${moveLabel(m)} to ${m.to}`), NONE];
          const correct = next.length
            ? out.findIndex(({ i }) => i === next[0]!.move)
            : options.length - 1;
          const after = next[0] ? configText(next[0].config, w) : '';
          return {
            prompt: `Running this PDA on ${code(w)}, it reaches the configuration ${configText(at.config, w)}. Which move does it make next?`,
            setup: setup(name),
            answer: { kind: 'choice', options, correct },
            explain: next.length
              ? `In ${at.config.state} the next symbol is ${w[at.config.pos] ?? 'nothing (the input is used up)'} and ${at.config.stack[0] ?? 'nothing'} is on top. Only ${options[correct]} fits, and it leads to ${after}.`
              : `In ${at.config.state} no move fits ${w[at.config.pos] ?? 'the end of the input'} with ${at.config.stack[0] ?? 'an empty stack'} on top, so this branch dies here.`,
            watch: watch(w),
          };
        }
      },
    },
  ];
}
