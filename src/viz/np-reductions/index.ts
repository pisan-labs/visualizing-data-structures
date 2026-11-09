import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { formatGraph } from '../_graph/parse';
import { randomGraph } from '../_graph/presets';
import cppSource from './code/cpp/reductions.hpp?raw';
import javaSource from './code/java/Reductions.java?raw';
import pythonSource from './code/python/reductions.py?raw';
import bruteForce from './examples/brute-force.json';
import chain from './examples/chain.json';
import cliqueRoute from './examples/clique-route.json';
import complement from './examples/complement.json';
import noCover from './examples/no-cover.json';
import triangles from './examples/triangles.json';
import unsat from './examples/unsat.json';
import explain from './explain.md?raw';
import {
  NOT,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseFormula,
  parseInput,
  pseudocode,
  solveSat,
  type Inst,
  type NpExtra,
  type NpSettings,
  type NpState,
} from './model';

import { npPractice } from './practice';
import { view } from './view';

/** A random 3-SAT formula: each clause three different variables with random signs. */
export function randomFormula(rng: Rng, clauses: number, nvars = 3): string {
  const vs = 'abcd'.slice(0, nvars);
  return Array.from({ length: clauses }, () => {
    // Three different variables (all of them when there are three).
    const pick = [...vs];
    while (pick.length > 3) pick.splice(rng.int(0, pick.length - 1), 1);
    return pick.map((v) => `${rng.int(0, 1) ? '!' : ''}${v}`).join(' | ');
  }).join(', ');
}

export function satisfiableFormula(rng: Rng, clauses: number, nvars = 3): string {
  for (;;) {
    const t = randomFormula(rng, clauses, nvars);
    const f = parseFormula(t);
    if (!(f instanceof Error) && solveSat(f)) return t;
  }
}

const clausesFor = (size: number) => (size <= 3 ? 2 : size <= 5 ? 3 : 4);
const graphText = (rng: Rng, n: number) =>
  formatGraph(randomGraph(rng, Math.min(n, 8), { density: 0.3 }));

export const npReductions: VizDef<NpState, NpSettings, NpExtra> = {
  id: 'np-reductions',
  title: 'NP-completeness reductions map',
  family: 'Hard problems',
  blurb:
    'A map of NP-complete problems joined by reductions. Walk 3-SAT to INDEPENDENT-SET, then on to VERTEX-COVER, CLIQUE and SET-COVER, and watch a yes-answer carry across.',
  settings: [
    {
      kind: 'choice',
      key: 'check',
      label: 'After each reduction',
      options: [
        { value: 'witness', label: 'Check that the answer carries over (brute force)' },
        { value: 'none', label: 'Stop when the new instance is built' },
      ],
      help: 'The reduction itself is polynomial and never solves anything. The check finds a certificate by brute force, which takes exponential time, and maps it across.',
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
      label: 'Formula or graph',
      placeholder: 'e.g. a | !b | c, !a | b or A-B, B-C k=2',
      maxLength: 120,
      sample: 'a | !b | c, !a | b',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'toIs', label: 'To IND-SET', usesInput: false },
      { op: 'toVc', label: 'To V-COVER', usesInput: false, more: true },
      { op: 'toClique', label: 'To CLIQUE', usesInput: false },
      { op: 'toSc', label: 'To SET-COVER', usesInput: false, more: true },
      { op: 'check', label: 'Solve by brute force', usesInput: false, more: true },
      { op: 'map', label: 'Show the map', usesInput: false, more: true },
    ],
    random: {
      label: 'Random formula',
      make: (rng) => [['load', satisfiableFormula(rng, 3)], ['toIs']],
    },
    presets: [
      {
        label: 'A satisfiable formula, to IND-SET',
        make: (rng, size) => [['load', satisfiableFormula(rng, clausesFor(size))], ['toIs']],
      },
      {
        label: 'An unsatisfiable formula (no maps to no)',
        make: () => [['load', '(a), (!a | b), (!b | c), (!c)'], ['toIs']],
      },
      {
        label: 'The whole chain: 3-SAT to SET-COVER',
        make: (rng, size) => [
          ['load', satisfiableFormula(rng, Math.min(clausesFor(size), 3))],
          ['toIs'],
          ['toVc'],
          ['toSc'],
        ],
      },
      {
        label: 'A random graph, to CLIQUE',
        make: (rng, size) => [
          ['load', graphText(rng, Math.max(4, Math.min(size, 7)))],
          ['toClique'],
        ],
      },
      {
        label: 'A random graph, to V-COVER',
        make: (rng, size) => [['load', graphText(rng, size)], ['toVc']],
      },
    ],
    sizes: [3, 5, 8],
  },
  explain,
  complexity: [
    {
      op: '3-SAT → IND-SET, m clauses',
      best: {
        cost: 'O(m²)',
        why: 'Every pair of clauses is compared for x and ¬x, even when none clash.',
        example: 'triangles',
      },
      average: {
        cost: 'O(m²)',
        why: 'Up to 9 literal pairs for each of the m(m - 1)/2 pairs of clauses.',
        example: 'chain',
      },
      worst: {
        cost: 'O(m²)',
        why: 'The output alone can have about 4.5m² conflict edges: still polynomial.',
        example: 'unsat',
      },
      note: 'The graph has at most 3m vertices: the new instance is polynomial in the size of the formula.',
    },
    {
      op: 'IND-SET → V-COVER',
      best: { cost: 'O(n + m)', why: 'Copy the graph and compute n - k.', example: 'chain' },
      average: { cost: 'O(n + m)', why: 'Nothing else changes.', example: 'no-cover' },
      worst: {
        cost: 'O(n + m)',
        why: 'O(1) if the new instance may share the graph.',
        example: 'chain',
      },
    },
    {
      op: 'IND-SET → CLIQUE, CLIQUE → V-COVER',
      best: {
        cost: 'O(n²)',
        why: 'The complement looks at all n(n - 1)/2 pairs.',
        example: 'complement',
      },
      average: { cost: 'O(n²)', why: 'Each pair is checked once.', example: 'clique-route' },
      worst: {
        cost: 'O(n²)',
        why: 'A graph with no edges becomes the complete graph: n(n - 1)/2 edges out.',
        example: 'complement',
      },
    },
    {
      op: 'V-COVER → SET-COVER',
      best: {
        cost: 'O(n·m)',
        why: 'As written, each vertex scans every edge for its set.',
        example: 'chain',
      },
      average: { cost: 'O(n·m)', why: 'The same scan, whatever the graph.', example: 'chain' },
      worst: {
        cost: 'O(n·m)',
        why: 'With adjacency lists it is O(n + m): the output holds each edge twice.',
        example: 'chain',
      },
    },
    {
      op: 'The check: brute force',
      best: {
        cost: 'O(size)',
        why: 'The first candidate (all false, or the first k vertices) already works.',
        example: 'brute-force',
      },
      average: {
        cost: 'O(2ⁿ · size)',
        why: 'In general the search is exponential in the number of variables or vertices.',
        example: 'triangles',
      },
      worst: {
        cost: 'O(2ⁿ · size)',
        why: 'A no-instance must try every candidate before it can say no.',
        example: 'unsat',
      },
      note: 'This is why the check is not part of a reduction: reductions must run in polynomial time.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as NpSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    triangles,
    unsat,
    chain,
    complement,
    cliqueRoute,
    noCover,
    bruteForce,
  ] as unknown as SavedExample[],
  practice: npPractice(() => npReductions),
  preview: { example: 'chain', level: 2 },
};

// ----- Driver protocol for the code tabs -----

const ascii = (s: string) => s.replaceAll(NOT, '!');

function graphLine(i: Inst): string {
  const g = i.graph!;
  return `k=${i.k} V=${g.vertices.map(ascii).join(',')} E=${g.edges.map((e) => ascii(`${e[0]}-${e[1]}`)).join(',')}`;
}

function formulaLine(i: Inst): string {
  const f = i.formula!;
  return f.clauses
    .map((c) => c.map((l) => `${l.neg ? '!' : ''}${f.vars[l.v]}`).join('|'))
    .join(',');
}

const OPS: Record<string, string> = {
  '3sat>is': 'sat2is',
  'is>vc': 'is2vc',
  'is>clique': 'is2clique',
  'clique>vc': 'clique2vc',
  'vc>sc': 'vc2sc',
};

/**
 * One line per reduction that ran, given the instance it started from:
 *   "sat2is a|!b|c,!a|b"            prints "k=2 V=a1,!b1,c1,!a2,b2 E=a1-!b1,..."
 *   "is2vc k=2 V=A,B,C E=A-B,B-C"   (and is2clique, clique2vc) print the new graph the same way
 *   "vc2sc k=1 V=A,B,C E=A-B,B-C"   prints "k=1 U=2 A={1} B={1,2} C={2}"
 * ¬ is written ! and vertices and edges keep the order the reduction builds them in.
 */
function codeScript(calls: OpCall[], settings: NpSettings) {
  const t = new Timeline(npReductions, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let prev = t.initial.state;
  for (const e of t.entries) {
    const a = prev.inst;
    const b = e.end.inst;
    prev = e.end;
    const op = OPS[`${a.problem}>${b.problem}`];
    if (!op || e.call[0] === 'load') continue;
    input.push(`${op} ${a.problem === '3sat' ? formulaLine(a) : graphLine(a)}`);
    if (b.problem === 'sc') {
      const fam = b.family!;
      expected.push(
        `k=${b.k} U=${fam.m} ${fam.sets.map((s) => `${ascii(s.name)}={${s.items.join(',')}}`).join(' ')}`,
      );
    } else expected.push(graphLine(b));
  }
  return { input, expected };
}

export default npReductions;
