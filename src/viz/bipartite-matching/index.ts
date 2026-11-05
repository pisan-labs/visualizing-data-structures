import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { MAX_INPUT } from '../_graph/kit';
import cppSource from './code/cpp/matching.hpp?raw';
import javaSource from './code/java/Matching.java?raw';
import pythonSource from './code/python/matching.py?raw';
import longerAndLonger from './examples/longer-and-longer.json';
import perfect from './examples/perfect.json';
import phases from './examples/phases.json';
import rematch from './examples/rematch.json';
import tooFewJobs from './examples/too-few-jobs.json';
import twoColours from './examples/two-colours.json';
import twoPhases from './examples/two-phases.json';
import explain from './explain.md?raw';
import {
  chainBipartite,
  hallBipartite,
  loadCall,
  perfectBipartite,
  randomBipartite,
  starBipartite,
} from './graphs';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseBipartite,
  pseudocode,
  runSummary,
  type BmExtra,
  type BmSettings,
  type BmState,
} from './model';
import { matchingPractice } from './practice';
import { view } from './view';

const preset = (label: string, make: (rng: Rng, n: number) => string): Preset => ({
  label,
  make: (rng, n) => [loadCall(make(rng, n)), ['run']],
});

export const bipartiteMatching: VizDef<BmState, BmSettings, BmExtra> = {
  id: 'bipartite-matching',
  title: 'Bipartite matching',
  family: 'Flow and matching',
  blurb:
    'Pair workers with jobs, each at most once. An augmenting path from a free worker to a free job, flipped, makes the matching one larger.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'How to find augmenting paths',
      options: [
        { value: 'kuhn', label: "Kuhn's algorithm: one search per left vertex" },
        { value: 'hopcroft-karp', label: 'Hopcroft-Karp: all shortest paths per phase' },
      ],
      help: 'Both end with a maximum matching, maybe a different one. Hopcroft-Karp needs only O(√V) phases.',
    },
    {
      kind: 'choice',
      key: 'layout',
      label: 'Layout',
      options: [
        { value: 'columns', label: 'Columns: left side on the left' },
        { value: 'rows', label: 'Rows: left side on top' },
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
      label: 'Bipartite graph',
      placeholder: 'e.g. A-1, A-2, B-2, C-3',
      maxLength: MAX_INPUT,
      sample: 'A-1, A-2, B-1, C-2, C-3',
      parse(token: string): Value | Error {
        const t = token.trim();
        if (!t) return new Error('Type a bipartite graph, such as A-1, A-2, B-1.');
        const r = parseBipartite(t);
        return r instanceof Error ? r : t;
      },
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Find a maximum matching', usesInput: false },
    ],
    random: {
      label: 'Random graph',
      make: (rng) => [loadCall(randomBipartite(rng, rng.int(8, 10))), ['run']],
    },
    presets: [
      preset('Random', (rng, n) => randomBipartite(rng, n)),
      preset('Dense random', (rng, n) => randomBipartite(rng, n, 0.7)),
      preset('Sparse random', (rng, n) => randomBipartite(rng, n, 0.15)),
      preset('A perfect matching exists', perfectBipartite),
      preset('Long augmenting paths (Kuhn’s worst order)', (_rng, n) => chainBipartite(n)),
      preset('Too few jobs for a group (Hall)', hallBipartite),
      preset('Everyone wants job 1', (_rng, n) => starBipartite(n)),
    ],
    sizes: [6, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: "Kuhn's algorithm",
      best: {
        cost: 'O(V + E)',
        why: 'Every left vertex finds a free partner on its first edge.',
        example: 'phases',
      },
      average: {
        cost: 'O(VE)',
        why: 'One depth-first search per left vertex, each O(V + E), though most stop early.',
        example: 'rematch',
      },
      worst: {
        cost: 'O(VE)',
        why: 'Every search can visit every edge before it finds its path.',
        example: 'longer-and-longer',
      },
    },
    {
      op: 'Hopcroft-Karp',
      best: {
        cost: 'O(E)',
        why: 'One phase finds every match, and a second search shows nothing is left.',
        example: 'phases',
      },
      average: {
        cost: 'O(E√V)',
        why: 'Each phase is O(E), and there are O(√V) phases.',
        example: 'two-phases',
      },
      worst: {
        cost: 'O(E√V)',
        why: 'After √V phases the shortest path has more than √V edges, so at most √V more paths remain.',
        example: 'perfect',
      },
    },
    {
      op: 'Checking a matching is maximum',
      best: {
        cost: 'O(V + E)',
        why: 'One search for an augmenting path from all free left vertices at once.',
        example: 'too-few-jobs',
      },
      average: {
        cost: 'O(V + E)',
        why: 'Berge: no augmenting path means maximum, and one search finds any that exists.',
        example: 'two-colours',
      },
      worst: {
        cost: 'O(V + E)',
        why: 'The search looks at each edge once.',
        example: 'rematch',
      },
    },
    {
      op: 'Extra space',
      best: { cost: 'Θ(V)', why: 'A partner per vertex, plus a visited mark.', example: 'perfect' },
      average: {
        cost: 'Θ(V)',
        why: 'The search stack holds at most one path, alternating left and right.',
        example: 'rematch',
      },
      worst: {
        cost: 'Θ(V)',
        why: 'A path visits each vertex at most once.',
        example: 'longer-and-longer',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BmSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    rematch,
    longerAndLonger,
    phases,
    twoPhases,
    tooFewJobs,
    perfect,
    twoColours,
  ] as unknown as SavedExample[],
  practice: matchingPractice(() => bipartiteMatching),
};

const lines = (s: BmState) => {
  const leftSet = new Set(s.left);
  return [
    `left ${s.left.join(' ')}`.trimEnd(),
    `right ${s.right.join(' ')}`.trimEnd(),
    ...s.graph.edges.map((e) => (leftSet.has(e.u) ? `edge ${e.u} ${e.v}` : `edge ${e.v} ${e.u}`)),
  ];
};

/**
 * Driver protocol for the code tabs. "left <names>" and "right <names>" start a graph (the code
 * numbers each side 0..n-1 in that order) and "edge u v" joins left u to right v; none prints.
 * "match" prints "<size> | <u-v for each matched left vertex>". The code is Kuhn's algorithm,
 * so the model uses it here too.
 */
function codeScript(calls: OpCall[], settings: BmSettings) {
  const t = new Timeline(bipartiteMatching, { ...settings, method: 'kuhn' }, 1, calls);
  const input = lines(t.initial.state);
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    const s = e.end;
    if (s !== before) input.push(...lines(s));
    before = s;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] === 'run' && r) {
      input.push('match');
      expected.push(runSummary(s, r));
    }
  }
  return { input, expected };
}

export default bipartiteMatching;
