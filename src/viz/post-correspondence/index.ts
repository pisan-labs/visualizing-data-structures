import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/pcp.hpp?raw';
import javaSource from './code/java/Pcp.java?raw';
import pythonSource from './code/python/pcp.py?raw';
import allDie from './examples/all-die.json';
import depthFirst from './examples/depth-first.json';
import longMatchCut from './examples/long-match-cut.json';
import longMatch from './examples/long-match.json';
import mustStartFirst from './examples/must-start-first.json';
import sameOverhang from './examples/same-overhang.json';
import shortMatch from './examples/short-match.json';
import topRunsAhead from './examples/top-runs-ahead.json';
import tryAMatch from './examples/try-a-match.json';
import explain from './explain.md?raw';
import {
  MAX_EXPAND,
  defaults,
  describe,
  formatInstance,
  init,
  initialSay,
  initialVars,
  ops,
  overhangText,
  parseInstance,
  pseudocode,
  seqText,
  type Domino,
  type PcpSettings,
  type PcpState,
} from './model';
import { pcpPractice } from './practice';
import { view } from './view';

/** The input box: dominoes such as b/ca a/ab for Load, or numbers such as 2 1 3 for Try. */
export function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type dominoes such as b/ca a/ab ca/a, or numbers such as 2 1 3.');
  if (t.includes('/')) {
    const d = parseInstance(t);
    return d instanceof Error ? d : t;
  }
  if (/^\d+([\s,]+\d+)*$/.test(t)) return t;
  return new Error(
    `"${t}" is neither dominoes (top/bottom, such as ab/a) nor domino numbers (such as 2 1 3).`,
  );
}

const word = (rng: Rng, lo: number, hi: number) =>
  Array.from({ length: rng.int(lo, hi) }, () => 'ab'[rng.int(0, 1)]).join('');

export function randomDominoes(rng: Rng, n: number): Domino[] {
  return Array.from({ length: n }, () => ({ top: word(rng, 1, 3), bottom: word(rng, 1, 3) }));
}

/** Every top longer than its bottom: no match can exist. */
export function longerTops(rng: Rng, n: number): Domino[] {
  return Array.from({ length: n }, () => {
    const bottom = word(rng, 1, 2);
    return { top: bottom + word(rng, 1, 2), bottom };
  });
}

/** The page's own search, with the default settings and a bound. */
export function searchResult(
  ds: Domino[],
  bound = defaults.bound,
  settings: Partial<PcpSettings> = {},
) {
  const t = new Timeline(pcpDef, { ...defaults, bound, ...settings } as PcpSettings, 1, [
    ['load', formatInstance(ds)],
    ['search'],
  ]);
  return t.endState().search!;
}

/** Random dominoes with a match of at most `bound` that the search finds (Sipser's if none turns up). */
export function solvable(rng: Rng, n: number, bound = 5): Domino[] {
  for (let i = 0; i < 200; i++) {
    const ds = randomDominoes(rng, n);
    const r = searchResult(ds, bound);
    if (r.found && r.found.length >= 2) return ds;
  }
  return parseInstance('b/ca a/ab ca/a abc/c') as Domino[];
}

const loadAnd = (ds: Domino[], ...more: OpCall[]): OpCall[] => [
  ['load', formatInstance(ds)],
  ...more,
];

export const pcpDef: VizDef<PcpState, PcpSettings, unknown> = {
  id: 'post-correspondence',
  title: 'Post correspondence problem',
  family: 'Automata and computability',
  blurb:
    'Line up dominoes so the tops spell the same string as the bottoms. Search for a match within a bound and watch the branches die, then see why no program can decide it in general.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'Search',
      options: [
        { value: 'bfs', label: 'Breadth first: finds a shortest match' },
        { value: 'dfs', label: 'Depth first: follows one sequence as far as it goes' },
      ],
      help: 'Both look at sequences of at most the bound. Breadth first tries all short sequences before longer ones; depth first goes deep first and backs up when a branch dies.',
    },
    {
      kind: 'number',
      key: 'bound',
      label: 'Bound: most dominoes in a sequence',
      min: 1,
      max: 12,
      help: 'A partial match that reaches the bound is cut off, not dead: a longer match may still exist.',
    },
    {
      kind: 'boolean',
      key: 'memo',
      label: 'Skip a partial match whose overhang was seen before',
      help: 'What the longer string has left over decides everything that can follow, so two partial matches with the same overhang have the same futures. Skipping repeats can turn an endless search into a proof that no match exists.',
    },
    {
      kind: 'choice',
      key: 'first',
      label: 'Problem',
      options: [
        { value: 'any', label: 'PCP: a match may start with any domino' },
        { value: 'first', label: 'Modified PCP: it must start with domino 1 (Sipser)' },
      ],
      help: 'Sipser proves the modified problem undecidable first, then reduces it to PCP. The same dominoes can have a match in one and not the other.',
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
      label: 'Dominoes or numbers',
      placeholder: 'e.g. b/ca a/ab ca/a abc/c, or 2 1 3',
      maxLength: 60,
      sample: '2 1 3 2 4',
      parse: parseInput,
    },
    buttons: [
      { op: 'search', label: 'Search', usesInput: false },
      { op: 'try', label: 'Try', usesInput: true, primary: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    presets: [
      {
        label: 'Random dominoes with a match',
        make: (rng, size) => loadAnd(solvable(rng, size), ['search']),
      },
      {
        label: 'Random dominoes',
        make: (rng, size) => loadAnd(randomDominoes(rng, size), ['search']),
      },
      {
        label: 'Every top longer than its bottom: no match',
        make: (rng, size) => loadAnd(longerTops(rng, size), ['search']),
      },
      {
        label: 'A shortest match of 12 dominoes',
        make: () => [['load', 'aa/baa ab/aaa aba/a'], ['search']],
      },
      {
        label: 'The bottom stays one b ahead',
        make: () => [['load', 'a/ab ba/ab'], ['search']],
      },
    ],
    sizes: [2, 3, 4],
  },
  explain,
  complexity: [
    {
      op: 'Try a sequence of k dominoes, L symbols in all',
      best: {
        cost: 'Θ(1)',
        why: 'The first domino disagrees with itself in its first symbol: b over ca.',
        example: 'try-a-match',
      },
      average: {
        cost: 'O(L)',
        why: 'Compare the two strings symbol by symbol until they disagree.',
        example: 'try-a-match',
      },
      worst: {
        cost: 'Θ(L)',
        why: 'A match agrees all the way, so every symbol is compared.',
        example: 'try-a-match',
      },
    },
    {
      op: 'Search n dominoes up to bound b',
      best: {
        cost: 'O(n)',
        why: 'Every first domino disagrees with itself, or one of them is already a match.',
        example: 'all-die',
      },
      average: {
        cost: 'far below nᵇ',
        why: 'Most extensions die at once, so only a few branches stay alive at each depth.',
        example: 'short-match',
      },
      worst: {
        cost: 'O(nᵇ)',
        why: 'If every extension stays alive, there are n sequences of one domino, n² of two, and so on.',
        example: 'long-match',
      },
      note: `The page stops after extending ${MAX_EXPAND} partial matches. Skipping repeated overhangs helps when the overhangs repeat, and not at all when they grow.`,
    },
    {
      op: 'Decide whether a match exists',
      best: {
        cost: 'undecidable',
        why: 'Some instances are easy: here every branch dies, which proves there is no match.',
        example: 'all-die',
      },
      average: {
        cost: 'undecidable',
        why: 'Searching finds a match if there is one, so PCP is recognizable; it just may never stop when there isn’t.',
        example: 'long-match-cut',
      },
      worst: {
        cost: 'undecidable',
        why: 'A decider for PCP would decide whether a Turing machine accepts its input.',
        example: 'top-runs-ahead',
      },
      note: 'Undecidable even with only 5 dominoes. With 2 it is decidable; 3 and 4 are still open.',
    },
  ],
  practice: pcpPractice(() => pcpDef),
  preview: { example: 'long-match', level: 3, hide: ['fr-', 'status'] },
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as PcpSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    shortMatch,
    tryAMatch,
    depthFirst,
    allDie,
    topRunsAhead,
    longMatch,
    longMatchCut,
    sameOverhang,
    mustStartFirst,
  ] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs: "dominoes t1/b1 t2/b2 ..." (prints nothing) loads an
 * instance; "search <bound>" prints "match 2 1 3 2 4", "no match" (every branch died), "none up
 * to <bound>" (some were cut off) or "gave up" (after 60 partial matches); "try 2 1 3" prints
 * "match", "dead at column <c>" or "alive top +ca" (the longer side and what it has left over).
 * The code searches breadth first from any domino, without skipping repeats (the default
 * settings), so the model runs that way here, with the page's bound.
 */
function codeScript(calls: OpCall[], settings: PcpSettings) {
  const bound = settings.bound ?? defaults.bound;
  const t = new Timeline(pcpDef, { ...defaults, bound }, 1, calls);
  let ds = t.initial.state.dominoes;
  const input = [`dominoes ${formatInstance(ds)}`];
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    const [op, arg] = e.call;
    const end = e.end;
    const changed = end !== before;
    before = end;
    if (!changed) continue;
    if (op === 'load' && end.dominoes !== ds) {
      ds = end.dominoes;
      input.push(`dominoes ${formatInstance(ds)}`);
    } else if (op === 'search' && end.search) {
      const r = end.search;
      input.push(`search ${r.bound}`);
      expected.push(
        r.over === 'match'
          ? `match ${seqText(r.found!)}`
          : r.over === 'limit'
            ? 'gave up'
            : r.cut
              ? `none up to ${r.bound}`
              : 'no match',
      );
    } else if (op === 'try' && end.check) {
      const c = end.check;
      input.push(
        `try ${String(arg)
          .trim()
          .split(/[\s,]+/)
          .join(' ')}`,
      );
      expected.push(
        c.verdict === 'match'
          ? 'match'
          : c.verdict === 'dead'
            ? `dead at column ${c.at! + 1}`
            : `alive ${overhangText(c)}`,
      );
    }
  }
  return { input, expected };
}

export default pcpDef;
