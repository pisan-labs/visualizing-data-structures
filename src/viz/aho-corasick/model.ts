/**
 * Aho-Corasick: many patterns at once. Put the patterns in a trie, then give every node a
 * failure link: the node for the longest proper suffix of its string that is also in the trie.
 * Failure links are set in breadth-first order, because a node's link is found from its parent's.
 * Scanning the text, follow trie edges while they exist and failure links when they do not, so
 * the scan never moves back in the text. Every pattern ending at the current node is a match.
 *
 * Patterns can end inside other patterns (he inside she), so a node also needs the patterns
 * that end at its suffixes. A setting chooses how: output links (the nearest node down the
 * failure chain that ends a pattern; follow them like a list) or output sets (each node keeps
 * the whole list, merged from its failure node's while building, as in the 1975 paper).
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { trieEdgeId, trieNodeId } from '../../layouts/trie';
import { andList, L, plural, q } from '../_strings/kit';

export const PATTERN_SETS = {
  'he she his hers': 'he, she, his, hers',
  'a ab bab bc bca c caa': 'a, ab, bab, bc, bca, c, caa',
  'ACC ATC CAT GCG': 'ACC, ATC, CAT, GCG (DNA)',
  'at art oars soar': 'at, art, oars, soar',
} as const;

export type PatternSet = keyof typeof PATTERN_SETS;

export interface AcSettings {
  [key: string]: Scalar;
  patterns: PatternSet;
  outputs: 'links' | 'sets';
}

export const defaults: AcSettings = { patterns: 'he she his hers', outputs: 'links' };

export const MAX_TEXT = 16;
export const MAX_PATTERN = 6;
export const MAX_PATTERNS = 8;
export const MAX_NODES = 24;

export interface AcNode {
  id: number;
  parent: number | null;
  ch: string;
  depth: number;
  /** Children by character, kept in alphabetical order. */
  kids: number[];
  /** The pattern that ends here. */
  word: string | null;
  fail: number | null;
  /** Output link: the nearest node down the failure chain that ends a pattern. */
  dict: number | null;
  /** Output set: every pattern that ends here or at a suffix (outputs = 'sets'). */
  out: string[];
}

export interface Match {
  word: string;
  /** Start in the text. */
  at: number;
}

export interface AcState {
  patterns: string[];
  nodes: AcNode[];
  built: boolean;
  text: string;
  /** Characters of the text read. */
  pos: number;
  cur: number;
  matches: Match[];
  /** Failure-link hops during the scan. */
  hops: number;
  scanning: boolean;
}

export interface AcExtra {
  /** Nodes on the path being spelled, while a pattern is added. */
  path?: number[];
  /** A failure link being tried, from → to (drawn even to the root). */
  link?: { from: number; to: number; kind: 'fail' | 'dict' };
}

export type AcStep = Step<AcState, AcExtra>;
type Op = OpSpec<AcState, AcSettings, AcExtra>;

export const ROOT = 0;
export const failId = (u: number) => `fail-${u}`;
export const dictId = (u: number) => `dict-${u}`;
export const textId = (i: number) => `t-${i}`;
export const matchId = (k: number) => `m-${k}`;

export const START_TEXT = 'ushers';

// ----- The trie -----

function newNode(id: number, parent: number | null, ch: string, depth: number): AcNode {
  return { id, parent, ch, depth, kids: [], word: null, fail: null, dict: null, out: [] };
}

export const child = (nodes: readonly AcNode[], u: number, c: string): number | undefined =>
  nodes[u]!.kids.find((k) => nodes[k]!.ch === c);

export function spell(nodes: readonly AcNode[], u: number): string {
  let s = '';
  for (let v: number | null = u; v !== null && v !== ROOT; v = nodes[v]!.parent)
    s = nodes[v]!.ch + s;
  return s;
}

export const nodeName = (nodes: readonly AcNode[], u: number) =>
  u === ROOT ? 'the root' : `node ${q(spell(nodes, u))}`;

/** The child of u by c, made when it is missing. */
function extend(nodes: AcNode[], u: number, c: string): number {
  const had = child(nodes, u, c);
  if (had !== undefined) return had;
  const v = nodes.length;
  nodes.push(newNode(v, u, c, nodes[u]!.depth + 1));
  nodes[u]!.kids = [...nodes[u]!.kids, v].sort((a, b) =>
    nodes[a]!.ch < nodes[b]!.ch ? -1 : nodes[a]!.ch > nodes[b]!.ch ? 1 : 0,
  );
  return v;
}

/** Insert a word, returning the nodes it walked or made. */
function insert(nodes: AcNode[], word: string): number[] {
  const path = [ROOT];
  for (const c of word) path.push(extend(nodes, path[path.length - 1]!, c));
  nodes[path[path.length - 1]!]!.word = word;
  return path;
}

function trieOf(patterns: readonly string[]): AcNode[] {
  const nodes = [newNode(ROOT, null, '', 0)];
  for (const p of patterns) insert(nodes, p);
  return nodes;
}

export function init(settings: AcSettings): AcState {
  const patterns = settings.patterns.split(' ');
  return {
    patterns,
    nodes: trieOf(patterns),
    built: false,
    text: '',
    pos: 0,
    cur: ROOT,
    matches: [],
    hops: 0,
    scanning: false,
  };
}

/** Nodes in breadth-first order. */
export function bfs(nodes: readonly AcNode[]): number[] {
  const order = [ROOT];
  for (let k = 0; k < order.length; k++) order.push(...nodes[order[k]!]!.kids);
  return order;
}

// ----- Input -----

export function parseWord(
  raw: Value | undefined,
  max: number,
  what: string,
): string | { error: string } {
  const t = String(raw ?? '').trim();
  if (!t) return { error: `Type ${what}.` };
  if (/\s/.test(t)) return { error: `Type ${what} with no spaces.` };
  const bad = /[^A-Za-z0-9]/.exec(t);
  if (bad) return { error: `"${t}" has "${bad[0]}" in it. Use letters and digits only.` };
  if (t.length > max) return { error: `That has ${t.length} characters. Keep it to ${max}.` };
  return t;
}

export function parseInput(token: string): Value | Error {
  const r = parseWord(token, MAX_TEXT, 'a word');
  return typeof r === 'string' ? r : new Error(r.error);
}

// ----- Reference -----

/** Every occurrence of every pattern, by brute force, in the order the scan reports them. */
export function refMatches(patterns: readonly string[], text: string): Match[] {
  const out: (Match & { end: number })[] = [];
  for (const w of new Set(patterns))
    for (let s = text.indexOf(w); s >= 0; s = text.indexOf(w, s + 1))
      out.push({ word: w, at: s, end: s + w.length });
  return out
    .sort((a, b) => a.end - b.end || b.word.length - a.word.length)
    .map(({ word, at }) => ({ word, at }));
}

// ----- Steps -----

const mk = (id: string, role: Mark['role']): Mark => ({ id, role });

function vars(st: AcState, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return {
    ...more,
    patterns: st.patterns.length,
    nodes: st.nodes.length,
    ...(st.scanning || st.text
      ? {
          state: st.cur === ROOT ? 'root' : spell(st.nodes, st.cur),
          matches: st.matches.length,
          'fail hops': st.hops,
        }
      : {}),
  };
}

function step(
  st: AcState,
  say: string,
  lines: string[],
  level: 1 | 2 | 3,
  marks: Mark[] = [],
  more: Record<string, Scalar> = {},
  extra?: AcExtra,
): AcStep {
  return {
    state: structuredClone(st),
    marks,
    say,
    lines,
    level,
    vars: vars(st, more),
    ...(extra ? { extra } : {}),
  };
}

const clearLinks = (st: AcState) => {
  for (const n of st.nodes) {
    n.fail = null;
    n.dict = null;
    n.out = [];
  }
  st.built = false;
};

const add: Op = {
  label: 'Add pattern',
  arity: 1,
  *run(s, [arg]) {
    const w = parseWord(arg, MAX_PATTERN, 'a pattern');
    const fail = (msg: string): AcStep =>
      step(s, `Nothing added. ${msg}`, [], 1, [mk(trieNodeId(ROOT), 'error')]);
    if (typeof w !== 'string') {
      yield fail(w.error);
      return s;
    }
    if (s.patterns.includes(w)) {
      yield fail(`${q(w)} is already a pattern.`);
      return s;
    }
    if (s.patterns.length >= MAX_PATTERNS) {
      yield fail(`There are already ${MAX_PATTERNS} patterns, as many as the drawing holds.`);
      return s;
    }
    const trial = s.nodes.map((n) => ({ ...n, kids: [...n.kids] }));
    insert(trial, w);
    if (trial.length > MAX_NODES) {
      yield fail(`That would make ${trial.length} nodes; the drawing holds ${MAX_NODES}.`);
      return s;
    }
    const st = structuredClone(s);
    clearLinks(st);
    Object.assign(st, { text: '', pos: 0, cur: ROOT, matches: [], hops: 0, scanning: false });
    const path = [ROOT];
    for (const c of w) {
      const u = path[path.length - 1]!;
      const made = child(st.nodes, u, c) === undefined;
      const v = extend(st.nodes, u, c);
      path.push(v);
      yield step(
        st,
        made
          ? `No ${q(c)} edge from ${nodeName(st.nodes, u)}: make ${nodeName(st.nodes, v)}.`
          : `Follow the ${q(c)} edge to ${nodeName(st.nodes, v)}, already in the trie.`,
        made ? ['a.walk', 'a.make'] : ['a.walk'],
        3,
        [mk(trieNodeId(v), made ? 'new' : 'visit'), mk(trieEdgeId(v), 'active')],
        {},
        { path: [...path] },
      );
    }
    const end = path[path.length - 1]!;
    st.nodes[end]!.word = w;
    st.patterns.push(w);
    yield step(
      st,
      `${nodeName(st.nodes, end)} now ends the pattern ${q(w)}. The failure links are out of date, so they are cleared: Build links sets them again.`,
      ['a.end'],
      1,
      [mk(trieNodeId(end), 'new')],
    );
    return st;
  },
};

function* buildSteps(st: AcState, settings: AcSettings): Generator<AcStep, void, void> {
  const nodes = st.nodes;
  const sets = settings.outputs === 'sets';
  clearLinks(st);
  const root = nodes[ROOT]!;
  root.fail = ROOT;
  for (const n of nodes) n.out = sets && n.word ? [n.word] : [];
  for (const k of root.kids) {
    nodes[k]!.fail = ROOT;
  }
  yield step(
    st,
    `Set the failure links in breadth-first order, so a node's parent always has its link already. The root's children fail to the root: a single character has no shorter suffix but the empty one.${sets ? ' Each node starts its output set with its own pattern, if any.' : ''}`,
    ['b.root', 'b.depth1'],
    2,
    root.kids.map((k) => mk(trieNodeId(k), 'done')),
  );
  const order = bfs(nodes);
  for (const v of order) {
    if (v === ROOT || nodes[v]!.depth === 1) continue;
    const u = nodes[v]!.parent!;
    const c = nodes[v]!.ch;
    let f = nodes[u]!.fail!;
    while (f !== ROOT && child(nodes, f, c) === undefined) {
      yield step(
        st,
        `${nodeName(nodes, v)}: its parent's failure link goes to ${nodeName(nodes, f)}, which has no ${q(c)} edge. Follow ${nodeName(nodes, f)}'s own failure link.`,
        ['b.loop', 'b.up'],
        3,
        [mk(trieNodeId(v), 'active'), mk(trieNodeId(f), 'compare')],
        {},
        { link: { from: f, to: nodes[f]!.fail!, kind: 'fail' } },
      );
      f = nodes[f]!.fail!;
    }
    const g = child(nodes, f, c);
    const target = g !== undefined && g !== v ? g : ROOT;
    const node = nodes[v]!;
    node.fail = target;
    const t = nodes[target]!;
    node.dict = t.word ? target : t.dict;
    if (sets) node.out = [...(node.word ? [node.word] : []), ...t.out];
    const name = spell(nodes, v);
    const why =
      target === ROOT
        ? `no proper suffix of ${q(name)} is in the trie, so it fails to the root`
        : `${q(spell(nodes, target))} is the longest proper suffix of ${q(name)} in the trie: ${nodeName(nodes, f)} has a ${q(c)} edge`;
    const outputs = sets
      ? node.out.length
        ? ` Its output set: ${andList(node.out.map(q))}.`
        : ''
      : node.dict !== null
        ? ` Output link to ${nodeName(nodes, node.dict)}: ${q(nodes[node.dict]!.word!)} ends here too.`
        : '';
    yield step(
      st,
      `${nodeName(nodes, v)}: ${why}.${outputs}`,
      ['b.loop', 'b.set', sets ? 'b.out' : 'b.dict'],
      2,
      [
        mk(trieNodeId(v), 'active'),
        mk(failId(v), 'active'),
        ...(node.dict !== null && !sets ? [mk(dictId(v), 'found')] : []),
      ],
    );
  }
  st.built = true;
}

const build: Op = {
  label: 'Build links',
  arity: 0,
  *run(s, _a, { settings }) {
    const st = structuredClone(s);
    Object.assign(st, { text: '', pos: 0, cur: ROOT, matches: [], hops: 0, scanning: false });
    yield* buildSteps(st, settings);
    const links = st.nodes.filter((n) => n.id !== ROOT && n.fail !== ROOT).length;
    yield step(
      st,
      `Done. Every node has its failure link; ${plural(links, 'of them goes', 'of them go')} somewhere other than the root (links to the root are not drawn). Press Search to scan a text.`,
      ['b.ret'],
      1,
    );
    return st;
  },
};

const search: Op = {
  label: 'Search text',
  arity: 1,
  *run(s, [arg], { settings }) {
    const w = parseWord(arg, MAX_TEXT, 'a text');
    if (typeof w !== 'string') {
      yield step(s, `Nothing searched. ${w.error}`, [], 1, [mk(trieNodeId(ROOT), 'error')]);
      return s;
    }
    const st = structuredClone(s);
    const sets = settings.outputs === 'sets';
    Object.assign(st, { text: w, pos: 0, cur: ROOT, matches: [], hops: 0, scanning: false });
    if (!st.built) yield* buildSteps(st, settings);
    st.scanning = true;
    const nodes = st.nodes;
    yield step(
      st,
      `Scan T = ${q(w)} from the root, one character at a time. The text pointer never moves back.`,
      ['s.init'],
      2,
    );
    for (let i = 0; i < w.length; i++) {
      const c = w[i]!;
      while (st.cur !== ROOT && child(nodes, st.cur, c) === undefined) {
        const f = nodes[st.cur]!.fail!;
        st.hops++;
        const from = st.cur;
        yield step(
          st,
          `T[${i}] = ${q(c)}: ${nodeName(nodes, from)} has no ${q(c)} edge. Follow its failure link to ${nodeName(nodes, f)}.`,
          ['s.loop', 's.fail'],
          3,
          [mk(trieNodeId(from), 'compare'), mk(failId(from), 'active'), mk(textId(i), 'active')],
          {},
          { link: { from, to: f, kind: 'fail' } },
        );
        st.cur = f;
      }
      const g = child(nodes, st.cur, c);
      st.cur = g ?? ROOT;
      st.pos = i + 1;
      const node = nodes[st.cur]!;
      const found: Match[] = [];
      if (sets) for (const word of node.out) found.push({ word, at: i - word.length + 1 });
      else if (node.word) found.push({ word: node.word, at: i - node.word.length + 1 });
      st.matches.push(...found);
      const moved =
        g !== undefined
          ? `T[${i}] = ${q(c)}: take the ${q(c)} edge to ${nodeName(nodes, st.cur)}.`
          : `T[${i}] = ${q(c)}: the root has no ${q(c)} edge either, so stay at the root.`;
      const report = found.length
        ? ` Match: ${andList(found.map((m) => `${q(m.word)} at ${m.at}`))}.`
        : '';
      yield step(st, moved + report, ['s.loop', 's.go', ...(found.length ? ['s.out'] : [])], 2, [
        mk(trieNodeId(st.cur), found.length ? 'found' : 'active'),
        mk(textId(i), 'active'),
        ...(g !== undefined ? [mk(trieEdgeId(st.cur), 'active')] : []),
        ...found.map((_, k) => mk(matchId(st.matches.length - found.length + k), 'new')),
      ]);
      if (!sets) {
        let prev = st.cur;
        for (let d = node.dict; d !== null; d = nodes[d]!.dict) {
          const word = nodes[d]!.word!;
          const m = { word, at: i - word.length + 1 };
          st.matches.push(m);
          yield step(
            st,
            `Follow the output link to ${nodeName(nodes, d)}: ${q(word)} ends here too, at ${m.at}.`,
            ['s.dict'],
            2,
            [mk(trieNodeId(d), 'found'), mk(matchId(st.matches.length - 1), 'new')],
            {},
            { link: { from: prev, to: d, kind: 'dict' } },
          );
          prev = d;
        }
      }
    }
    st.scanning = false;
    yield step(
      st,
      `Done. ${st.matches.length ? `${plural(st.matches.length, 'match', 'matches')}: ${andList(st.matches.map((m) => `${q(m.word)} at ${m.at}`))}` : 'No pattern occurs in the text'}. ${w.length} characters read and ${plural(st.hops, 'failure-link hop')}, never more hops than characters read.`,
      ['s.ret'],
      1,
      st.matches.map((_, k) => mk(matchId(k), 'found')),
    );
    return st;
  },
};

export const ops: Record<string, Op> = { search, build, add };

export function pseudocode(settings: AcSettings): PseudoBlock[] {
  const sets = settings.outputs === 'sets';
  const buildLines = [
    L('b.sig', 0, 'buildLinks(trie)', 'To set every failure link:'),
    L('b.root', 1, 'root.fail = root', 'The root fails to itself.'),
    L(
      'b.depth1',
      1,
      'for each child v of root: v.fail = root',
      'Single characters fail to the root.',
    ),
    L(
      'b.loop',
      1,
      'for each node v = u.child[c] in BFS order',
      'Then, level by level, for each node v reached from u by c:',
    ),
    L(
      'b.up',
      2,
      'f = u.fail; while f ≠ root and f has no c edge: f = f.fail',
      'walk down u’s failure chain until some node has a c edge,',
    ),
    L(
      'b.set',
      2,
      'v.fail = f.child[c] if it exists and ≠ v, else root',
      'and link v to that child (or to the root).',
    ),
    sets
      ? L(
          'b.out',
          2,
          'v.out = v.out ∪ v.fail.out',
          'Patterns ending at the failure node end at v too.',
        )
      : L(
          'b.dict',
          2,
          'v.dict = v.fail if v.fail ends a pattern, else v.fail.dict',
          'The output link skips to the nearest node down the chain that ends a pattern.',
        ),
    L('b.ret', 1, 'return', 'Every node is linked.'),
  ];
  const searchLines = [
    L('s.sig', 0, 'search(T)', 'To find every pattern in T:'),
    L('s.init', 1, 'v = root', 'Start at the root.'),
    L('s.loop', 1, 'for i = 0 to n − 1', 'For each character of the text,'),
    L(
      's.fail',
      2,
      'while v ≠ root and v has no T[i] edge: v = v.fail',
      'follow failure links until the character can be read,',
    ),
    L('s.go', 2, 'v = v.child[T[i]] if it exists, else root', 'then take its edge.'),
    sets
      ? L('s.out', 2, 'report every word in v.out', 'Every pattern in the node’s set ends here.')
      : L('s.out', 2, 'if v ends a word: report it', 'If the node ends a pattern, report it,'),
    ...(sets
      ? []
      : [
          L(
            's.dict',
            2,
            'for d = v.dict; d ≠ null; d = d.dict: report d.word',
            'and every pattern down the output links.',
          ),
        ]),
    L('s.ret', 1, 'return the matches', 'Hand back every match.'),
  ];
  const addLines = [
    L('a.sig', 0, 'insert(P)', 'To add a pattern:'),
    L('a.walk', 1, 'for each character c of P: follow the c edge', 'walk down its letters,'),
    L('a.make', 2, 'making a node when it is missing', 'making nodes where the trie stops,'),
    L('a.end', 1, 'mark the last node as ending P', 'and mark the end. The links must be rebuilt.'),
  ];
  return [
    { op: 'search', lines: [...buildLines, ...searchLines] },
    { op: 'build', lines: buildLines },
    { op: 'add', lines: addLines },
  ];
}

export function initialSay(st: AcState): string {
  return `The patterns ${andList(st.patterns.map(q))} are in a trie. Press Build links to add the failure links, or type a text and press Search text to scan it for every pattern at once.`;
}

export const initialVars = (st: AcState) => ({
  patterns: st.patterns.length,
  nodes: st.nodes.length,
});

export function describe(st: AcState): string {
  const head = `Patterns ${st.patterns.join(', ')}; a trie of ${st.nodes.length} nodes.`;
  const links = st.built
    ? ` Failure links: ${
        st.nodes
          .filter((n) => n.id !== ROOT && n.fail !== null && n.fail !== ROOT)
          .map((n) => `${spell(st.nodes, n.id)} to ${spell(st.nodes, n.fail!)}`)
          .join(', ') || 'all to the root'
      }.`
    : ' Failure links not built.';
  const scan = st.text
    ? ` Text ${st.text}, ${st.pos} read, at ${st.cur === ROOT ? 'the root' : spell(st.nodes, st.cur)}. Matches: ${st.matches.map((m) => `${m.word} at ${m.at}`).join(', ') || 'none'}.`
    : '';
  return head + links + scan;
}

/** The finished links for these nodes, without steps: what the view sizes its labels for. */
export function linksOf(nodes: readonly AcNode[]): { fail: number[]; out: string[][] } {
  const fail = nodes.map(() => ROOT);
  const out = nodes.map((n) => (n.word ? [n.word] : []));
  for (const v of bfs(nodes)) {
    const n = nodes[v]!;
    if (v === ROOT || n.depth === 1) continue;
    let f = fail[n.parent!]!;
    while (f !== ROOT && child(nodes, f, n.ch) === undefined) f = fail[f]!;
    const g = child(nodes, f, n.ch);
    fail[v] = g !== undefined && g !== v ? g : ROOT;
    out[v] = [...out[v]!, ...out[fail[v]!]!];
  }
  return { fail, out };
}
