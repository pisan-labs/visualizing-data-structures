/**
 * Combination sum: list every combination of the candidates that adds up to a target.
 *
 * The reuse setting says how often a candidate may be used:
 *
 * - again: as often as you like. Repeated candidates add nothing, so they are dropped first.
 * - once: each candidate once; a value typed twice may be used twice. Two equal values would
 *   find the same combinations, so at each depth only the first of them is tried.
 *
 * The pattern sorts the candidates and backtracks: search(start, left) tries each candidate
 * from c[start] on, chooses it, searches for the rest, and unchooses it. Because c is sorted,
 * the first candidate bigger than what is left ends the loop: every later one is bigger too.
 * Each combination comes out once, in sorted order, so there is nothing to throw away.
 *
 * The naive way generates every list and checks its sum: every subset of the candidates
 * (once), or every count of each candidate up to target / c (again), with no pruning. A list
 * found twice (from equal values) is skipped. The page stops it after MAX_NAIVE calls and says
 * how many it would take.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: a call is one call of the search.
 */
import type {
  Mark,
  MarkRole,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
  Value,
} from '../../engine/types';
import { callShapeId } from '../../layouts/calls';
import { approachOf, Work, workVars, type Approach, type Totals } from '../_patterns/kit';

export type Reuse = 'again' | 'once';

export const MAX_VALUES = 6;
export const MAX_TARGET = 30;
/** The most boxes the pattern's tree may have, so it stays readable. */
export const MAX_TREE = 80;
/** The naive way stops after this many calls. */
export const MAX_NAIVE = 400;

export const START = [7, 3, 5, 4];
export const START_TARGET = 10;

export interface CSSettings {
  [key: string]: Scalar;
  approach: Approach;
  reuse: Reuse;
}

export const defaults: CSSettings = { approach: 'pattern', reuse: 'again' };

export interface CSState {
  /** The candidates as typed. */
  values: number[];
}

/**
 * One box of the pattern's recursion tree, in call order: a call (it may output, or find no
 * way on), or a branch the loop does not take: pruned (the candidate is more than what is left,
 * so the loop stops) or a repeat (the same value as the candidate before, skipped).
 */
export interface CNode {
  id: number;
  parent: number | null;
  depth: number;
  chosen: number[];
  /** What is left to make up; for a branch not taken, what would be left. */
  left: number;
  /** The candidate's index in the sorted list (-1 for the first call). */
  i: number;
  kind: 'call' | 'leaf' | 'dead' | 'pruned' | 'dup';
}

/** One list the naive way builds: a count for each candidate, in order. */
export interface NaiveCall {
  /** How many of each candidate so far (undefined: not decided yet). */
  counts: number[];
  depth: number;
  sum: number;
  /** A leaf: every count decided. */
  leaf: boolean;
  /** A leaf whose sum is the target: new, or a repeat of a list found before. */
  hit?: 'new' | 'repeat';
}

export interface CSExtra {
  target: number;
  reuse: Reuse;
  /** The sorted candidates the search uses. */
  c: number[];
  /** The pattern: the whole tree, and what each box is at this step. */
  nodes?: CNode[];
  status?: Record<number, 'open' | 'done' | 'cut'>;
  stack?: number[];
  /** The naive way: the list being built or checked. */
  naive?: NaiveCall;
  /** The naive way: calls so far, and in all. */
  callsDone?: number;
  callsAll?: number;
  chosen: number[];
  found: number[][];
  /** Fixed for the operation: how many combinations it finds. */
  finds: number;
  done: boolean;
}

export type CSStep = Step<CSState, CSExtra>;
type Op = OpSpec<CSState, CSSettings, CSExtra>;

export const init = (): CSState => ({ values: [...START] });

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

// ----- Text -----

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "a", "a and b", "a, b and c". */
export const and = (xs: string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

export const listText = (xs: readonly number[]) => `[${xs.join(', ')}]`;

/** A big count for narration: 4,096. */
export const big = (n: number) => n.toLocaleString('en-US');

const sumOf = (xs: readonly number[]) => {
  let t = 0;
  for (const x of xs) t += x;
  return t;
};

// ----- Input -----

/** For the input box: one number is the target; several are candidates to load. */
export function parseInput(token: string): Value | Error {
  const tokens = token.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 0) return new Error('Type a target, such as 10, or candidates to load.');
  for (const t of tokens) if (!/^\d+$/.test(t)) return new Error(`"${t}" is not a whole number.`);
  if (tokens.length === 1) {
    const v = Number(tokens[0]);
    if (v < 1 || v > MAX_TARGET) return new Error(`Use a target from 1 to ${MAX_TARGET}.`);
    return v;
  }
  return tokens.join(' ');
}

/** Candidates to load, or why they cannot be. */
export function readValues(arg: Value | undefined): number[] | string {
  const tokens = String(arg ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (tokens.length < 2) return 'Type 2 or more candidates, such as 7 3 5 4.';
  if (tokens.length > MAX_VALUES)
    return `That is ${tokens.length} candidates. Use at most ${MAX_VALUES}.`;
  const out: number[] = [];
  for (const t of tokens) {
    if (!/^\d+$/.test(t)) return `"${t}" is not a whole number.`;
    const v = Number(t);
    if (v < 1 || v > 9) return `${t} is out of range. Candidates go from 1 to 9.`;
    out.push(v);
  }
  return out;
}

export function readTarget(arg: Value | undefined): number | string {
  const t = String(arg ?? '').trim();
  if (!/^\d+$/.test(t)) return 'Type the target as one whole number, such as 10.';
  const v = Number(t);
  if (v < 1 || v > MAX_TARGET) return `Use a target from 1 to ${MAX_TARGET}, not ${v}.`;
  return v;
}

/** The sorted candidates the search uses: repeats dropped when each can be used again. */
export const candidates = (values: readonly number[], reuse: Reuse): number[] =>
  (reuse === 'again' ? [...new Set(values)] : [...values]).sort((a, b) => a - b);

// ----- The pattern's tree, worked out first so the drawing never moves -----

export function plan(c: readonly number[], target: number, reuse: Reuse): CNode[] {
  const nodes: CNode[] = [];
  const add = (
    parent: number | null,
    depth: number,
    chosen: number[],
    left: number,
    i: number,
    start: number,
  ) => {
    const id = nodes.length;
    const node: CNode = { id, parent, depth, chosen, left, i, kind: 'call' };
    nodes.push(node);
    if (left === 0) {
      node.kind = 'leaf';
      return;
    }
    let children = 0;
    for (let j = start; j < c.length; j++) {
      if (reuse === 'once' && j > start && c[j] === c[j - 1]) {
        nodes.push({
          id: nodes.length,
          parent: id,
          depth: depth + 1,
          chosen: [...chosen, c[j]!],
          left: left - c[j]!,
          i: j,
          kind: 'dup',
        });
        children++;
        continue;
      }
      if (c[j]! > left) {
        nodes.push({
          id: nodes.length,
          parent: id,
          depth: depth + 1,
          chosen: [...chosen, c[j]!],
          left: left - c[j]!,
          i: j,
          kind: 'pruned',
        });
        children++;
        break;
      }
      add(id, depth + 1, [...chosen, c[j]!], left - c[j]!, j, reuse === 'again' ? j : j + 1);
      children++;
    }
    if (children === 0) node.kind = 'dead';
  };
  add(null, 0, [], target, -1, 0);
  return nodes;
}

/** Every combination, the pattern's way, in the order it finds them. */
export function combinations(c: readonly number[], target: number, reuse: Reuse): number[][] {
  return plan(c, target, reuse)
    .filter((n) => n.kind === 'leaf')
    .map((n) => n.chosen);
}

/** The pattern's calls: every box that is a real call. */
export const patternCalls = (nodes: readonly CNode[]) =>
  nodes.filter((n) => n.kind === 'call' || n.kind === 'leaf' || n.kind === 'dead').length;

/** How many of each candidate the naive way tries: 0 or 1 (once), 0 to target / c (again). */
export const most = (c: readonly number[], target: number, reuse: Reuse) =>
  c.map((v) => (reuse === 'once' ? 1 : Math.floor(target / v)));

/** The naive way's calls to the end: one per partial list, 1 + m₀ + m₀m₁ + … */
export function naiveCalls(c: readonly number[], target: number, reuse: Reuse): number {
  let total = 1;
  let layer = 1;
  for (const m of most(c, target, reuse)) {
    layer *= m + 1;
    total += layer;
  }
  return total;
}

export function totals(c: readonly number[], target: number, reuse: Reuse): Totals {
  return { naive: naiveCalls(c, target, reuse), pattern: patternCalls(plan(c, target, reuse)) };
}

// ----- Steps -----

/** "Done: 3 combinations make 10: [3, 3, 4], [3, 7] and [5, 5]." */
function doneText(found: number[][], target: number): string {
  if (found.length === 0) return `Done: no combination makes ${target}.`;
  const outputs = found.map(listText);
  const list =
    outputs.length <= 6
      ? and(outputs)
      : `${outputs.slice(0, 5).join(', ')} and ${found.length - 5} more`;
  return `Done: ${plural(found.length, 'combination')} ${found.length === 1 ? 'makes' : 'make'} ${target}: ${list}.`;
}

function refuse(s: CSState, why: string): CSStep {
  return { state: s, marks: [], say: `Nothing to do. ${why}`, lines: [], level: 1, vars: {} };
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const vs = readValues(arg);
    if (typeof vs === 'string') {
      yield refuse(s, `${vs} The candidates stay as they were.`);
      return s;
    }
    const next = { values: vs };
    yield {
      state: next,
      marks: [],
      say: `The candidates are ${vs.join(', ')}. Type a target and press Search.`,
      lines: [],
      level: 1,
      vars: {},
    };
    return next;
  },
};

const node = (n: CNode) => callShapeId(String(n.id));

function* pattern(
  s: CSState,
  target: number,
  settings: CSSettings,
  c: number[],
  nodes: CNode[],
): Generator<CSStep, CSState, void> {
  const reuse = settings.reuse;
  const tot = totals(c, target, reuse);
  const work = new Work(['calls']);
  const kids = new Map<number, CNode[]>();
  for (const n of nodes)
    if (n.parent !== null) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]);
  const status: Record<number, 'open' | 'done' | 'cut'> = {};
  const stack: number[] = [];
  let chosen: number[] = [];
  const found: number[][] = [];
  const finds = nodes.filter((n) => n.kind === 'leaf').length;
  let pruned = 0;
  let skipped = 0;
  const extra = (done = false): CSExtra => ({
    target,
    reuse,
    c,
    nodes,
    status: { ...status },
    stack: [...stack],
    chosen: [...chosen],
    found: found.map((f) => [...f]),
    finds,
    done,
  });
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    ms: [string, MarkRole][] = [],
  ): CSStep => ({
    state: s,
    marks: ms.map(([id, role]) => mark(id, role)),
    say,
    lines,
    level,
    vars: {
      target,
      left: target - sumOf(chosen),
      found: found.length,
      pruned,
      ...(reuse === 'once' ? { skipped } : {}),
      ...workVars(work, tot),
    },
    extra: extra(),
  });

  function* visit(x: CNode, say: string): Generator<CSStep, void, void> {
    work.add('calls');
    status[x.id] = 'open';
    stack.push(x.id);
    if (x.kind === 'leaf') {
      found.push([...chosen]);
      yield step(
        `${say} Nothing is left: output ${listText(chosen)}, combination ${found.length}.`,
        ['choose', 'leaf'],
        2,
        [
          [node(x), 'found'],
          [`found-${found.length - 1}`, 'new'],
        ],
      );
    } else {
      yield step(say, x.parent === null ? ['ret', 'sig'] : ['choose', 'loop'], 2, [
        [node(x), 'active'],
      ]);
      const children = kids.get(x.id) ?? [];
      for (const ch of children) {
        const v = c[ch.i]!;
        if (ch.kind === 'dup') {
          skipped++;
          status[ch.id] = 'cut';
          yield step(
            `c[${ch.i}] = ${v} is the same as c[${ch.i - 1}], just tried at this depth: it would find the same combinations again. Skip it.`,
            ['dup'],
            2,
            [[node(ch), 'remove']],
          );
          continue;
        }
        if (ch.kind === 'pruned') {
          pruned++;
          status[ch.id] = 'cut';
          const later = c.length - 1 - ch.i;
          yield step(
            `The next candidate, ${v}, is more than the ${x.left} left. The list is sorted, so ${later > 0 ? `the ${plural(later, 'candidate')} after it ${later === 1 ? 'is' : 'are'} bigger too` : 'nothing after it is smaller'}: stop this loop. Pruned.`,
            ['prune'],
            2,
            [[node(ch), 'remove']],
          );
          break;
        }
        chosen = [...chosen, v];
        const next = reuse === 'again' ? ch.i : ch.i + 1;
        yield* visit(
          ch,
          `Choose ${v}: chosen is ${listText(chosen)}, ${x.left} − ${v} = ${ch.left} left. Search ${next < c.length ? `from c[${next}] = ${c[next]}` : 'with no candidates left'}${reuse === 'again' && ch.left > 0 ? `, ${v} included, since it can be used again` : ''}.`,
        );
        chosen = chosen.slice(0, -1);
        yield step(
          `Back at ${listText(chosen)} with ${x.left} left: unchoose ${v} and try the next candidate.`,
          ['unchoose'],
          3,
          [[node(x), 'active']],
        );
      }
      if (x.kind === 'dead')
        yield step(
          `No candidates are left to try, and ${x.left} is still needed: a dead end.`,
          ['loop'],
          2,
          [[node(x), 'remove']],
        );
    }
    stack.pop();
    status[x.id] = 'done';
  }

  yield* visit(
    nodes[0]!,
    `Sort the candidates: ${c.join(', ')}${reuse === 'again' && c.length < s.values.length ? ' (repeats dropped: each can be used again anyway)' : ''}. search(0, ${target}): ${target} to make up, from c[0] on.`,
  );
  const d: CSStep = step(
    `${doneText(found, target)} ${plural(work.get('calls'), 'call')}, ${plural(pruned, 'branch', 'branches')} pruned${reuse === 'once' && skipped ? `, ${plural(skipped, 'repeat')} skipped` : ''}. Every list without pruning takes ${big(tot.naive)} calls.`,
    ['ret'],
    1,
  );
  yield { ...d, extra: extra(true) };
  return s;
}

/** The naive way: build every list (a count per candidate), then check its sum. */
function* naive(
  s: CSState,
  target: number,
  settings: CSSettings,
  c: number[],
  nodes: CNode[],
): Generator<CSStep, CSState, void> {
  const reuse = settings.reuse;
  const tot = totals(c, target, reuse);
  const work = new Work(['calls']);
  const m = most(c, target, reuse);
  const found: number[][] = [];
  const seen = new Set<string>();
  const finds = combinations(c, target, reuse).length;
  const all = naiveCalls(c, target, reuse);
  let current: NaiveCall = { counts: [], depth: 0, sum: 0, leaf: false };
  const extra = (done = false): CSExtra => ({
    target,
    reuse,
    c,
    naive: { ...current, counts: [...current.counts] },
    callsDone: work.get('calls'),
    callsAll: all,
    chosen: listOf(current.counts),
    found: found.map((f) => [...f]),
    finds,
    done,
  });
  const listOf = (counts: number[]) => counts.flatMap((k, i) => Array(k).fill(c[i]!) as number[]);
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    ms: [string, MarkRole][] = [],
  ): CSStep => ({
    state: s,
    marks: ms.map(([id, role]) => mark(id, role)),
    say,
    lines,
    level,
    vars: {
      target,
      sum: current.sum,
      found: found.length,
      ...workVars(work, tot),
    },
    extra: extra(),
  });
  let stopped = false;

  function* call(counts: number[], sum: number): Generator<CSStep, void, void> {
    if (stopped) return;
    if (work.get('calls') >= MAX_NAIVE) {
      stopped = true;
      return;
    }
    work.add('calls');
    const depth = counts.length;
    if (depth === c.length) {
      const list = listOf(counts);
      let hit: NaiveCall['hit'];
      let say: string;
      if (sum === target) {
        const key = list.join(',');
        hit = seen.has(key) ? 'repeat' : 'new';
        if (hit === 'new') {
          seen.add(key);
          found.push(list);
          say = `Every count is chosen: ${listText(list)} sums to ${sum}, the target. Output it, combination ${found.length}.`;
        } else
          say = `Every count is chosen: ${listText(list)} sums to ${target}, but it was found before (from an equal candidate). Skip it.`;
      } else say = `Every count is chosen: ${listText(list)} sums to ${sum}, not ${target}.`;
      current = { counts: [...counts], depth, sum, leaf: true, ...(hit ? { hit } : {}) };
      yield step(
        say,
        hit === 'new' ? ['check', 'out'] : ['check'],
        2,
        hit === 'new'
          ? [
              [`found-${found.length - 1}`, 'new'],
              ['sum', 'found'],
            ]
          : [['sum', sum === target ? 'found' : 'remove']],
      );
      return;
    }
    current = { counts: [...counts], depth, sum, leaf: false };
    const v = c[depth]!;
    yield step(
      depth === 0
        ? `Build every list: for each candidate in turn, try every count of it, ${reuse === 'once' ? 'taken or not' : `from ${m[0]} down to 0 (no more than ${target} / ${v} = ${m[0]} fit)`}. No sum is checked until every count is chosen.`
        : `Counts so far: ${counts.map((k, i) => `${k} × ${c[i]}`).join(', ')}, sum ${sum}. Next, c[${depth}] = ${v}: try ${reuse === 'once' ? 'taking it, then not' : `${m[depth]} down to 0 of it`}.`,
      depth === 0 ? ['ret', 'sig', 'loop'] : ['rec', 'loop'],
      2,
      [[`n-${depth}`, 'active']],
    );
    for (let k = m[depth]!; k >= 0; k--) yield* call([...counts, k], sum + k * v);
  }

  yield* call([], 0);
  const pat = patternCalls(nodes);
  const say = stopped
    ? `Stop here: ${big(MAX_NAIVE)} calls of the ${big(all)} it takes to build every list. ${plural(found.length, 'combination')} found so far. Sorted, pruned backtracking finds all ${finds} in ${plural(pat, 'call')}.`
    : `${doneText(found, target)} Building every list took ${big(work.get('calls'))} calls; sorted, pruned backtracking takes ${plural(pat, 'call')}.`;
  current = { counts: [], depth: 0, sum: 0, leaf: false };
  const d = step(say, ['ret'], 1);
  yield { ...d, vars: { ...d.vars, sum: null }, extra: extra(true) };
  return s;
}

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [arg], { settings }) {
    const target = readTarget(arg);
    if (typeof target === 'string') {
      yield refuse(s, target);
      return s;
    }
    const c = candidates(s.values, settings.reuse);
    const nodes = plan(c, target, settings.reuse);
    if (nodes.length > MAX_TREE) {
      yield refuse(
        s,
        `That search has ${nodes.length} branches, too many to draw. Use a smaller target, fewer candidates or bigger ones.`,
      );
      return s;
    }
    return approachOf(settings) === 'naive'
      ? yield* naive(s, target, settings, c, nodes)
      : yield* pattern(s, target, settings, c, nodes);
  },
};

export const ops: Record<string, Op> = { search, load };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: CSSettings): PseudoBlock[] {
  const once = settings.reuse === 'once';
  const loadBlock: PseudoBlock = {
    op: 'load',
    lines: [L('load', 0, 'values = the candidates', 'Remember the candidates.')],
  };
  if (approachOf(settings) === 'naive') {
    return [
      {
        op: 'search',
        lines: [
          L(
            'sig',
            0,
            once ? 'every(i, list)   // every subset' : 'every(i, list)   // every count of each',
            once
              ? 'To build every subset of the candidates from c[i] on:'
              : 'To build every list of the candidates from c[i] on:',
          ),
          L(
            'check',
            1,
            'if i == n: if sum(list) == target',
            'Once every candidate is decided, check the sum;',
          ),
          L('out', 2, 'output list unless it was output before', 'output the list if it is new.'),
          L(
            'loop',
            1,
            once ? 'for k in 1, 0' : 'for k = target / c[i] down to 0',
            once
              ? 'Otherwise take c[i] or leave it,'
              : 'Otherwise try every count of c[i] that could fit,',
          ),
          L('rec', 2, 'every(i + 1, list + k copies of c[i])', 'and build the rest of the list.'),
          L('ret', 0, 'every(0, [])', 'Start with nothing chosen.'),
        ],
      },
      loadBlock,
    ];
  }
  return [
    {
      op: 'search',
      lines: [
        L(
          'sig',
          0,
          'search(start, left)',
          'To find the combinations that make up left, from c[start] on (c sorted):',
        ),
        L(
          'leaf',
          1,
          'if left == 0: output chosen; return',
          'If nothing is left, chosen is a combination.',
        ),
        L('loop', 1, 'for i = start to n − 1', 'Try each candidate from c[start] on:'),
        ...(once
          ? [
              L(
                'dup',
                2,
                'if i > start and c[i] == c[i − 1]: continue',
                'skip a value just tried at this depth,',
              ),
            ]
          : []),
        L(
          'prune',
          2,
          'if c[i] > left: break',
          'stop at the first one bigger than what is left: the rest are bigger too;',
        ),
        L(
          'choose',
          2,
          once
            ? 'chosen.add(c[i]); search(i + 1, left − c[i])'
            : 'chosen.add(c[i]); search(i, left − c[i])',
          once
            ? 'choose it and search for the rest from the next one,'
            : 'choose it and search for the rest, it included,',
        ),
        L('unchoose', 2, 'chosen.removeLast()', 'then unchoose it.'),
        L(
          'ret',
          0,
          'sort c; search(0, target)',
          'Sort the candidates and start with all of the target left.',
        ),
      ],
    },
    loadBlock,
  ];
}

// ----- Start -----

export function describe(s: CSState): string {
  return `Candidates: ${s.values.join(', ')}.`;
}

export function initialSay(s: CSState, settings: CSSettings): string {
  return `The candidates are ${s.values.join(', ')}. Type a target, such as ${START_TARGET}, and press Search to list every combination that adds up to it, each candidate ${settings.reuse === 'once' ? 'used at most once' : 'used as often as you like'}.`;
}

export const initialVars = (): Record<string, Scalar> => ({});
