import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/two_sat.hpp?raw';
import javaSource from './code/java/TwoSat.java?raw';
import pythonSource from './code/python/two_sat.py?raw';
import chain from './examples/chain.json';
import contradiction from './examples/contradiction.json';
import forced from './examples/forced.json';
import threeClauses from './examples/three-clauses.json';
import threeClausesTarjan from './examples/three-clauses-tarjan.json';
import explain from './explain.md?raw';
import {
  MAX_VARS,
  START_TEXT,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseFormula,
  pseudocode,
  randomFormula,
  VARS,
  type SatExtra,
  type SatSettings,
  type SatState,
} from './model';
import { satPractice } from './practice';
import { view } from './view';

export function parseFormulaInput(token: string): Value | Error {
  const f = parseFormula(token);
  return f instanceof Error ? f : token.trim();
}

/** a → b → c → ... → ¬a and back: every variable is forced, and the last clause decides. */
function chainFormula(n: number, closed: boolean): string {
  const v = VARS.slice(0, n).split('');
  const cs = v.slice(0, -1).map((x, i) => `!${x} | ${v[i + 1]}`);
  cs.push(`!${v[n - 1]} | !${v[0]}`);
  if (closed) cs.push(`${v[0]} | ${v[n - 1]}`, `${v[0]} | !${v[n - 1]}`);
  return cs.join(', ');
}

const preset = (label: string, make: (rng: Rng, n: number) => string): Preset => ({
  label,
  make: (rng, size) => [['load', make(rng, Math.max(2, Math.min(MAX_VARS, size)))], ['run']],
});

export const twoSat: VizDef<SatState, SatSettings, SatExtra> = {
  id: 'two-sat',
  title: '2-SAT',
  family: 'Graphs',
  blurb:
    'Can every clause (a ∨ b) be true at once? Turn each clause into two implications, find the strongly connected components, and read off an answer.',
  settings: [
    {
      kind: 'choice',
      key: 'algorithm',
      label: 'Components by',
      options: [
        { value: 'kosaraju', label: 'Kosaraju: two searches (CLRS)' },
        { value: 'tarjan', label: 'Tarjan: one search with low-links' },
      ],
      help: 'Both find the same components in Θ(V + E). The assignment can differ when several work.',
    },
    {
      kind: 'choice',
      key: 'layout',
      label: 'Layout',
      options: [
        { value: 'pairs', label: 'Pairs: x above ¬x' },
        { value: 'circle', label: 'Circle' },
        { value: 'force', label: 'Spring' },
      ],
      help: 'Only the picture changes.',
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
      label: 'Clauses',
      placeholder: 'e.g. a | !b, b | c, !a | !c',
      maxLength: 200,
      sample: START_TEXT,
      parse: parseFormulaInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Solve', usesInput: false },
    ],
    random: {
      label: 'Random formula',
      make: (rng) => [['load', randomFormula(rng, rng.int(3, 5))]],
    },
    presets: [
      preset('Random, few clauses', (rng, n) => randomFormula(rng, n)),
      preset('Random, many clauses', (rng, n) => randomFormula(rng, n, 2.5)),
      preset('A chain of implications', (_rng, n) => chainFormula(n, false)),
      preset('A chain, contradicting itself', (_rng, n) => chainFormula(n, true)),
      preset('Only single literals', (rng, n) =>
        VARS.slice(0, n)
          .split('')
          .map((x) => `${rng.int(0, 1) ? '!' : ''}${x}`)
          .join(', '),
      ),
    ],
    sizes: [3, 4, 6, 8],
  },
  explain,
  complexity: [
    {
      op: '2-SAT, n variables and m clauses',
      best: {
        cost: 'Θ(n + m)',
        why: 'The graph has 2n vertices and up to 2m arcs, and each step touches each once.',
        example: 'three-clauses',
      },
      average: {
        cost: 'Θ(n + m)',
        why: 'Building, one SCC search (or two) and one pass over the variables.',
        example: 'chain',
      },
      worst: {
        cost: 'Θ(n + m)',
        why: 'Even a contradiction is found by the same passes; nothing backtracks.',
        example: 'contradiction',
      },
    },
    {
      op: 'Building the implication graph',
      best: { cost: 'Θ(m)', why: 'Two arcs per clause.', example: 'forced' },
      average: { cost: 'Θ(m)', why: 'Repeated arcs are skipped in O(1) with a set.' },
      worst: { cost: 'Θ(m)', why: 'Still two per clause.', example: 'chain' },
      note: 'Space: Θ(n + m) for the graph and its transpose.',
    },
    {
      op: 'Trying every assignment instead',
      best: {
        cost: 'O(m)',
        why: 'The first assignment tried may happen to work.',
        example: 'three-clauses-tarjan',
      },
      average: {
        cost: 'O(2ⁿ · m)',
        why: 'Each of the 2ⁿ assignments is checked against m clauses.',
      },
      worst: {
        cost: 'Θ(2ⁿ · m)',
        why: 'An unsatisfiable formula makes it try all of them.',
        example: 'contradiction',
      },
      note: 'With three literals per clause (3-SAT) no polynomial algorithm is known: it is NP-complete.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as SatSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    threeClauses,
    threeClausesTarjan,
    chain,
    contradiction,
    forced,
  ] as unknown as SavedExample[],
  practice: satPractice(() => twoSat),
};

const formulaLines = (s: SatState) => [
  `vars ${s.vars.join(' ')}`,
  ...s.clauses.map(
    ([a, b]) => `clause ${a.neg ? '!' : ''}${s.vars[a.v]} ${b.neg ? '!' : ''}${s.vars[b.v]}`,
  ),
];

/**
 * Driver protocol for the code tabs: "vars <names>" starts a formula (the names numbered in that
 * order), "clause a b" adds (a ∨ b) with ! for not, and "solve" prints "UNSAT" or "a=T b=F ...".
 * The code is Kosaraju's (the default), so the model runs it here whatever the setting.
 */
function codeScript(calls: OpCall[], settings: SatSettings) {
  const same: SatSettings = { ...settings, algorithm: 'kosaraju' };
  const t = new Timeline(twoSat, same, 1, calls);
  const input = formulaLines(t.initial.state);
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    const s = e.end;
    if (s !== before) input.push(...formulaLines(s));
    before = s;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] === 'run' && r) {
      input.push('solve');
      expected.push(
        r.sat ? s.vars.map((v, i) => `${v}=${r.value[i] ? 'T' : 'F'}`).join(' ') : 'UNSAT',
      );
    }
  }
  return { input, expected };
}

export default twoSat;
