import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import type { Automaton } from '../_automata/automaton';
import { automatonLines } from '../_automata/page';
import { randomWord } from '../_automata/random';
import cppSource from './code/cpp/product.hpp?raw';
import javaSource from './code/java/Dfa.java?raw';
import pythonSource from './code/python/product.py?raw';
import completeAsDifference from './examples/complement-as-difference.json';
import deadState from './examples/dead-state.json';
import difference from './examples/difference.json';
import differentAlphabets from './examples/different-alphabets.json';
import emptyIntersection from './examples/empty-intersection.json';
import everyPair from './examples/every-pair.json';
import runAllThree from './examples/run-all-three.json';
import sameMachine from './examples/same-machine.json';
import symmetric from './examples/symmetric.json';
import union from './examples/union.json';
import explain from './explain.md?raw';
import { loadPair, machine, randomPair, rename, type MachineName } from './machines';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  looksLikeMachines,
  ops,
  parseMachines,
  pseudocode,
  START_TEXT,
  type ProdExtra,
  type ProdSettings,
  type ProdState,
} from './model';
import { productPractice } from './practice';
import { pairName } from './product';
import { view } from './view';

const build: OpCall = ['build'];

/** Load two machines, build their product, then run a word of the chosen length on all three. */
function preset(label: string, make: (rng: Rng) => [Automaton, Automaton]): Preset {
  return {
    label,
    make: (rng, size) => {
      const [a, b] = make(rng);
      return [loadPair(a, b), build, ['run', randomWord(rng, a.alphabet, size) || 'eps']];
    },
  };
}

const named = (a: MachineName, b: MachineName) => (): [Automaton, Automaton] => [
  machine(a),
  machine(b),
];

const TOKEN = /^(?:[A-Za-z0-9]+|eps|ε)$/;

export const productConstruction: VizDef<ProdState, ProdSettings, ProdExtra> = {
  id: 'product-construction',
  title: 'Union and intersection of DFAs',
  family: 'Automata and computability',
  blurb:
    'Run two DFAs at once: the product construction pairs up their states to build one DFA for the union, intersection or difference.',
  settings: [
    {
      kind: 'choice',
      key: 'op',
      label: 'Operation',
      options: [
        { value: 'union', label: 'Union, A ∪ B: in A or in B' },
        { value: 'intersection', label: 'Intersection, A ∩ B: in both' },
        { value: 'difference', label: 'Difference, A − B: in A, not in B' },
        { value: 'symmetric', label: 'Symmetric difference, A ⊕ B: in exactly one' },
      ],
      help: 'The pairs and their moves are the same for every operation. Only which pairs accept changes.',
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: {
      label: 'Machines or word',
      placeholder: 'e.g. p0 a -> p1; accept p1 | q0 b -> q1; accept q1, or abba',
      maxLength: 600,
      sample: START_TEXT,
      parse(token) {
        const t = token.trim();
        if (!t)
          return new Error(
            'Type two machines separated by |, such as "p0 a -> p1; accept p1 | q0 b -> q1; accept q1", or a word to run.',
          );
        if (looksLikeMachines(t)) {
          const r = parseMachines(t);
          return r instanceof Error ? r : t;
        }
        for (const tok of t.split(/\s+/))
          if (!TOKEN.test(tok))
            return new Error(
              `"${tok}" is not a word. Use letters and digits, or ε (eps) for the empty word.`,
            );
        return t;
      },
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'build', label: 'Build', usesInput: false },
      { op: 'run', label: 'Run', usesInput: true },
      { op: 'complementA', label: 'Complement A', usesInput: false, more: true },
      { op: 'complementB', label: 'Complement B', usesInput: false, more: true },
    ],
    random: {
      label: 'Random DFAs',
      make: (rng) => {
        const [a, b] = randomPair(rng, { partial: rng.int(0, 1) === 1 });
        return [loadPair(a, b), build];
      },
    },
    presets: [
      preset("Even a's or ends in b", named('evenA', 'endsB')),
      preset('Starts with a, ends in b (a dead state)', named('startsA', 'endsB')),
      preset('Divisible by 3 and even (every pair)', named('div3', 'even2')),
      preset('A machine with itself (the diagonal)', () => [
        rename(machine('endsB'), 'p'),
        machine('endsB'),
      ]),
      preset('Random DFAs', (rng) => randomPair(rng)),
      preset('Random DFAs with missing moves', (rng) => randomPair(rng, { partial: true })),
    ],
    sizes: [3, 5, 8],
  },
  explain,
  complexity: [
    {
      op: 'Build the product (reachable pairs)',
      best: {
        cost: 'Θ(max(|A|, |B|)·|Σ|)',
        why: 'Every reachable state of A and of B shows up in some pair, so at least the larger machine.',
        example: 'same-machine',
      },
      average: {
        cost: 'Θ(k·|Σ|)',
        why: 'k reachable pairs, each with one move per symbol, each move two table lookups.',
        example: 'difference',
      },
      worst: {
        cost: 'Θ(|A|·|B|·|Σ|)',
        why: 'Every pair can be reachable, as for divisible by 3 and even.',
        example: 'every-pair',
      },
      note: 'k is somewhere from max(|A|, |B|) to |A|·|B|. Sipser’s proof uses all |A|·|B| pairs; building from the start pair skips the ones no word reaches.',
    },
    {
      op: 'Is the intersection empty?',
      best: {
        cost: 'O(1)',
        why: 'The start pair already accepts: ε is in both.',
      },
      average: {
        cost: 'O(k·|Σ|)',
        why: 'A search from the start pair stops at the first accepting pair it finds.',
        example: 'union',
      },
      worst: {
        cost: 'Θ(k·|Σ|)',
        why: 'When it is empty, every reachable pair must be checked to be sure.',
        example: 'empty-intersection',
      },
    },
    {
      op: 'Complement one DFA',
      best: {
        cost: 'Θ(|Q|)',
        why: 'Already complete: just swap which states accept.',
        example: 'complement-as-difference',
      },
      average: {
        cost: 'Θ(|Q|·|Σ|)',
        why: 'Find the missing moves, add the dead state, then swap.',
      },
      worst: {
        cost: 'Θ(|Q|·|Σ|)',
        why: 'Every state and symbol is checked for a missing move.',
        example: 'dead-state',
      },
    },
    {
      op: 'Run the product on a word of length n',
      best: {
        cost: 'Θ(n)',
        why: 'One move per symbol: a pair of lookups.',
        example: 'run-all-three',
      },
      average: { cost: 'Θ(n)', why: 'The same as running A and B side by side.' },
      worst: {
        cost: 'Θ(n)',
        why: 'However many pairs the product has, a run visits one per symbol.',
      },
    },
  ],
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    union,
    emptyIntersection,
    difference,
    deadState,
    everyPair,
    sameMachine,
    completeAsDifference,
    symmetric,
    runAllThree,
    differentAlphabets,
  ] as unknown as SavedExample[],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as ProdSettings),
  },
  practice: productPractice(() => productConstruction),
  preview: { example: 'union', level: 2, hide: ['tbl-'] },
};

/**
 * Driver protocol for the code tabs. A pair of machines is two runs of automatonLines('dfa', m):
 * the driver takes the first "dfa" line as A, the next as B, then A again. Then:
 *   complement A|B   prints "states <n> | accept <states, sorted>" (or "-")
 *   build <op>       prints the pairs in the order found, "| accept <pairs>", and
 *                    "| p,q-c->p',q' ..." for every pair and symbol, "-" for none
 *   run <op> [word]  prints "accept <pair>" or "reject <pair>", the pair the run ends in
 * Pairs are written "p,q". Loads and runs the model refuses leave no lines.
 */
function codeScript(calls: OpCall[], settings: ProdSettings) {
  const t = new Timeline(productConstruction, settings, 1, calls);
  const lines = (s: ProdState) => [...automatonLines('dfa', s.a), ...automatonLines('dfa', s.b)];
  const input = lines(t.initial.state);
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    const name = e.call[0];
    const last = e.steps.at(-1)!.extra;
    if (name === 'load' && (e.end.a !== before.a || e.end.b !== before.b))
      input.push(...lines(e.end));
    if (name === 'complementA' || name === 'complementB') {
      const m = name === 'complementA' ? e.end.a : e.end.b;
      input.push(`complement ${name.at(-1)}`);
      expected.push(`states ${m.states.length} | accept ${[...m.accept].sort().join(' ') || '-'}`);
    }
    if (name === 'build' && last?.build) {
      const r = last.build;
      const moves = r.moves.map((m) => `${m.from}-${m.on}->${m.to}`).join(' ');
      input.push(`build ${settings.op}`);
      expected.push(`${r.rows.join(' ')} | accept ${r.accept.join(' ') || '-'} | ${moves || '-'}`);
    }
    if (name === 'run' && last?.run?.verdict) {
      const r = last.run;
      input.push(`run ${settings.op} ${r.word}`.trimEnd());
      expected.push(`${r.verdict} ${pairName(r.p, r.q)}`);
    }
    before = e.end;
  }
  return { input, expected };
}

export default productConstruction;
