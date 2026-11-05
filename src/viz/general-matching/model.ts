/**
 * Maximum matching in a general (not necessarily bipartite) undirected graph: Edmonds' blossom
 * algorithm.
 *
 * Each phase grows an alternating forest. Every free vertex is the root of a tree and is even
 * (outer, +). From an even vertex v, an edge to w:
 *   - w is in no tree: w is matched, so w becomes odd (inner, −) with parent v, and w's mate
 *     becomes even and joins the queue. The tree grows by two vertices.
 *   - w is even in another tree: root ... v, w ... root is an augmenting path. Flip it and the
 *     matching grows by one; the forest is thrown away and the next phase starts.
 *   - w is even in the same tree: the tree path from v to w plus the edge v-w is an odd cycle,
 *     a blossom. Contract it: every vertex of the cycle takes the base (the cycle's vertex
 *     closest to the root) as its base, and the odd ones become even and join the queue.
 *   - w is odd, or has the same base as v: nothing to do.
 * A phase that ends without an augmenting path proves the matching is maximum.
 *
 * The bookkeeping follows the usual array implementation (Gabow's, as popularized on
 * e-maxx): `base` holds each vertex's blossom base, and `p` is rewritten around a blossom so that
 * walking an augmenting path through it goes round the even way: that is the expansion. The
 * view draws each blossom as a dashed ring around its vertices.
 *
 * The queue and every neighbour list go in name order, so the code tabs agree with the model.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { edgeId, vertexId } from '../../layouts/graph';
import {
  describeGraph,
  edgeKey,
  listWords,
  makeGraph,
  neighbours,
  plural,
  sortNames,
  type Graph,
} from '../_graph/graph';
import { graphVars, loadOp, type GraphState } from '../_graph/kit';
import { parseGraph } from '../_graph/parse';

export type BlState = GraphState;
export type Label = 'even' | 'odd' | null;

export interface BlSettings {
  [key: string]: Scalar;
  layout: 'force' | 'circle' | 'grid' | 'layered';
}

export const defaults: BlSettings = { layout: 'force' };

/** Eight vertices with a perfect matching; the search contracts two blossoms on the way. */
export const BLOSSOM_TEXT = 'A-B, A-C, A-H, B-D, B-E, C-H, D-F, D-G, E-H, F-G';

/** One run's bookkeeping at a step. */
export interface BlRun {
  phase: number;
  mate: Record<string, string | null>;
  label: Record<string, Label>;
  p: Record<string, string | null>;
  base: Record<string, string>;
  root: Record<string, string | null>;
  queue: string[];
  /** The vertex being scanned and the neighbour being looked at. */
  v?: string;
  w?: string;
  /** Edges that joined the forest this phase (an odd vertex and its parent). */
  tree: Record<string, string>;
  /** Edges looked at this phase. */
  seen: Record<string, true>;
  /** The augmenting path being flipped, in the original graph. */
  path: string[];
  augmentations: number;
  blossoms: number;
  checks: number;
  done: boolean;
}

export interface BlExtra {
  run?: BlRun;
}

type S = BlState;
type X = BlExtra;
type Op = OpSpec<S, BlSettings, X>;
type BlStep = Step<S, X>;

/** Undirected, unweighted, no loops, each pair once. */
export function simple(g: Graph): Graph {
  const seen = new Set<string>();
  const edges: Graph['edges'] = [];
  for (const e of g.edges) {
    if (e.u === e.v) continue;
    const [u, v] = sortNames([e.u, e.v]) as [string, string];
    const k = `${u}-${v}`;
    if (seen.has(k)) continue;
    seen.add(k);
    edges.push({ u, v, w: 1 });
  }
  return makeGraph({ directed: false, weighted: false, vertices: g.vertices, edges });
}

export const BLOSSOM_GRAPH = simple(parseGraph(BLOSSOM_TEXT) as Graph);

export function init(): S {
  return { graph: makeGraph(BLOSSOM_GRAPH) };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/** Panel ids (see view.ts). */
export const cellId = (row: 'lab' | 'base' | 'mate', v: string) => `tbl-${row}-${v}`;
export const blossomId = (b: string) => `bl-${b}`;

function clone(r: BlRun): BlRun {
  return {
    ...r,
    mate: { ...r.mate },
    label: { ...r.label },
    p: { ...r.p },
    base: { ...r.base },
    root: { ...r.root },
    queue: [...r.queue],
    tree: { ...r.tree },
    seen: { ...r.seen },
    path: [...r.path],
  };
}

export const matchedPairs = (g: Graph, mate: Record<string, string | null>): [string, string][] =>
  g.vertices.flatMap((v) => {
    const m = mate[v];
    return m && sortNames([v, m])[0] === v ? [[v, m] as [string, string]] : [];
  });

export const matchingSize = (g: Graph, mate: Record<string, string | null>) =>
  matchedPairs(g, mate).length;

export const pairsText = (g: Graph, mate: Record<string, string | null>) =>
  matchedPairs(g, mate)
    .map(([a, b]) => `${a}-${b}`)
    .join(', ');

/** The blossoms standing at a step: base -> members (in name order), for bases with company. */
export function blossomsOf(g: Graph, r: BlRun): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const v of g.vertices) {
    const b = r.base[v]!;
    out.set(b, [...(out.get(b) ?? []), v]);
  }
  for (const [b, vs] of out) if (vs.length < 2) out.delete(b);
  return out;
}

function runVars(g: Graph, r: BlRun): Record<string, Scalar> {
  return {
    ...graphVars(g),
    phase: r.phase,
    v: r.v ?? '–',
    w: r.w ?? '–',
    matched: matchingSize(g, r.mate),
    augmentations: r.augmentations,
    blossoms: r.blossoms,
    checks: r.checks,
  };
}

export const braces = (c: string[]) => (c.length === 1 ? `{ ${c[0]} }` : `{${c.join(', ')}}`);

/** The path from even vertex e to its root, following mate then p (through blossoms). */
function toRoot(r: BlRun, e: string): string[] {
  const out = [e];
  let m = r.mate[e] ?? null;
  while (m) {
    out.push(m);
    const pm = r.p[m]!;
    out.push(pm);
    m = r.mate[pm] ?? null;
  }
  return out;
}

function flip(r: BlRun, e: string) {
  let m = r.mate[e] ?? null;
  while (m) {
    const pm = r.p[m]!;
    const nm = r.mate[pm] ?? null;
    r.mate[m] = pm;
    r.mate[pm] = m;
    m = nm;
  }
}

function lca(r: BlRun, x: string, y: string): string {
  const seen = new Set<string>();
  let a = x;
  for (;;) {
    a = r.base[a]!;
    seen.add(a);
    const m = r.mate[a];
    if (!m) break;
    a = r.p[m]!;
  }
  let b = y;
  for (;;) {
    b = r.base[b]!;
    if (seen.has(b)) return b;
    b = r.p[r.mate[b]!]!;
  }
}

/** Walk from v up to base b, pointing p across the new blossom; collect the bases passed. */
function markPath(r: BlRun, v0: string, b: string, child0: string, inB: Set<string>) {
  let v = v0;
  let child = child0;
  while (r.base[v] !== b) {
    const m = r.mate[v]!;
    inB.add(r.base[v]!);
    inB.add(r.base[m]!);
    r.p[v] = child;
    child = m;
    v = r.p[m]!;
  }
}

type StepFn = (say: string, lines: string[], level: 1 | 2 | 3, marks?: Mark[]) => BlStep;

/** One phase. Returns true when it augmented. */
function* phase(g: Graph, r: BlRun, step: StepFn): Generator<BlStep, boolean, void> {
  r.phase++;
  for (const v of g.vertices) {
    r.label[v] = null;
    r.p[v] = null;
    r.base[v] = v;
    r.root[v] = null;
  }
  r.tree = {};
  r.seen = {};
  r.path = [];
  r.queue = [];
  r.v = undefined;
  r.w = undefined;
  const free = g.vertices.filter((v) => !r.mate[v]);
  for (const v of free) {
    r.label[v] = 'even';
    r.root[v] = v;
    r.queue.push(v);
  }
  yield step(
    free.length === 0
      ? `Phase ${r.phase}: every vertex is matched.`
      : `Phase ${r.phase}: the matching has ${plural(matchingSize(g, r.mate), 'edge')}. Each free vertex (${listWords(free)}) roots its own tree and is even (+). Grow the forest from the even vertices in the queue.`,
    ['phase', 'roots'],
    2,
    free.map((v) => mark(vertexId(v), 'active')),
  );
  while (r.queue.length) {
    const v = r.queue.shift()!;
    r.v = v;
    r.w = undefined;
    yield step(`Take ${v} from the queue and look at its edges.`, ['loop'], 3, [
      mark(vertexId(v), 'active'),
    ]);
    for (const w of neighbours(g, v)) {
      r.v = v;
      r.w = w;
      r.checks++;
      const key = edgeKey(g, v, w);
      const marks = [
        mark(vertexId(v), 'active'),
        mark(vertexId(w), 'compare'),
        mark(edgeId(key), 'active'),
      ];
      if (r.base[v] === r.base[w] || r.mate[v] === w || r.label[w] === 'odd') {
        if (!r.tree[key] && r.mate[v] !== w) r.seen[key] = true;
        yield step(
          r.mate[v] === w
            ? `${v}-${w} is ${v}'s own matched edge. Skip it.`
            : r.label[w] === 'odd'
              ? `${w} is odd (−). An edge from even to odd closes an even cycle, which tells us nothing. Skip it.`
              : `${v} and ${w} are already in the same blossom. Skip the edge.`,
          ['for', 'skip'],
          3,
          marks,
        );
        continue;
      }
      if (r.label[w] === null) {
        const m = r.mate[w]!;
        r.label[w] = 'odd';
        r.p[w] = v;
        r.root[w] = r.root[v]!;
        r.label[m] = 'even';
        r.root[m] = r.root[v]!;
        r.queue.push(m);
        r.tree[key] = v;
        yield step(
          `${w} is matched and in no tree. ${w} joins ${r.root[v]}'s tree as odd (−), with parent ${v}, and its mate ${m} joins as even (+). Queue ${m}.`,
          ['for', 'grow', 'grow.odd', 'grow.even'],
          2,
          [...marks, mark(vertexId(m), 'new')],
        );
        continue;
      }
      if (r.root[w] !== r.root[v]) {
        // Augmenting path: root(v) ... v, w ... root(w).
        const pv = toRoot(r, v);
        const pw = toRoot(r, w);
        const path = [...pv.reverse(), ...pw];
        r.path = path;
        const bases = path.map((x) => r.base[x]!);
        const contracted = bases.filter((b, k) => k === 0 || b !== bases[k - 1]);
        const through = contracted.length < path.length;
        const pathMarks = [
          ...path.map((x) => mark(vertexId(x), 'active')),
          ...path.slice(1).map((x, k) => mark(edgeId(edgeKey(g, path[k]!, x)), 'active')),
        ];
        yield step(
          `${w} is even in another tree, rooted at ${r.root[w]}. Root to ${v}, the edge ${v}-${w}, then ${w} to its root: an augmenting path${through ? `. In the contracted graph it is ${contracted.map((b) => (blossomsOf(g, r).has(b) ? `B(${b})` : b)).join(' – ')}` : ''}.`,
          ['for', 'aug'],
          2,
          marks,
        );
        if (through) {
          yield step(
            `Expand the blossoms on it: inside each one the path goes round the side that alternates properly. In the original graph the path is ${path.join(' – ')}.`,
            ['aug', 'expand'],
            2,
            pathMarks,
          );
        } else {
          yield step(
            `The path is ${path.join(' – ')}: it starts and ends at a free vertex and alternates unmatched and matched edges.`,
            ['aug'],
            3,
            pathMarks,
          );
        }
        flip(r, v);
        flip(r, w);
        r.mate[v] = w;
        r.mate[w] = v;
        r.augmentations++;
        yield step(
          `Flip the path: its ${path.length / 2} unmatched edges join the matching and its ${(path.length - 2) / 2} matched edges leave. The matching now has ${plural(matchingSize(g, r.mate), 'edge')}.`,
          ['flip'],
          2,
          path.slice(1).map((x, k) => mark(edgeId(edgeKey(g, path[k]!, x)), 'active')),
        );
        return true;
      }
      // Same tree: a blossom.
      const b = lca(r, v, w);
      const old = blossomsOf(g, r);
      const name = (x: string) => (old.has(x) ? `B(${x})` : x);
      const cycle = [...basesUp(r, v, b).reverse(), ...basesUp(r, w, b)].map(name);
      const inB = new Set<string>();
      markPath(r, v, b, w, inB);
      markPath(r, w, b, v, inB);
      const members = g.vertices.filter((x) => inB.has(r.base[x]!));
      const odd: string[] = [];
      for (const x of g.vertices) {
        if (!inB.has(r.base[x]!)) continue;
        r.base[x] = b;
        if (r.label[x] !== 'even') {
          r.label[x] = 'even';
          r.queue.push(x);
          odd.push(x);
        }
      }
      r.blossoms++;
      if (!r.tree[key]) r.seen[key] = true;
      yield step(
        `${v} and ${w} are both even in ${r.root[v]}'s tree. The tree path between them plus ${v}-${w} is an odd cycle: a blossom, ${cycle.join(' – ')}. Its base is ${b}, the vertex nearest the root.`,
        ['for', 'bl', 'bl.base'],
        2,
        [...marks, mark(vertexId(b), 'found')],
      );
      yield step(
        `Contract the blossom ${braces(members)} into one even vertex with base ${b}. ${odd.length ? `${listWords(odd)} ${odd.length === 1 ? 'was' : 'were'} odd and ${odd.length === 1 ? 'is' : 'are'} now even: queue ${odd.length === 1 ? 'it' : 'them'}.` : ''} Inside a blossom every vertex can be reached by an even path from the base.`,
        ['bl.shrink', 'bl.queue'],
        2,
        [mark(blossomId(b), 'found'), ...odd.map((x) => mark(vertexId(x), 'new'))],
      );
    }
  }
  r.v = undefined;
  r.w = undefined;
  return false;
}

/** The bases from x up to base b, along the tree (b included). */
function basesUp(r: BlRun, x: string, b: string): string[] {
  let a = r.base[x]!;
  const out = [a];
  while (a !== b) {
    a = r.base[r.p[r.mate[a]!]!]!;
    out.push(a);
  }
  return out;
}

const run: Op = {
  label: 'Find a maximum matching',
  arity: 0,
  *run(s) {
    const g = s.graph;
    const none = <T>(x: T) => Object.fromEntries(g.vertices.map((v) => [v, x]));
    const r: BlRun = {
      phase: 0,
      mate: none<string | null>(null),
      label: none<Label>(null),
      p: none<string | null>(null),
      base: Object.fromEntries(g.vertices.map((v) => [v, v])),
      root: none<string | null>(null),
      queue: [],
      tree: {},
      seen: {},
      path: [],
      augmentations: 0,
      blossoms: 0,
      checks: 0,
      done: false,
    };
    const step: StepFn = (say, lines, level, marks = []) => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    yield step(
      g.vertices.length === 0
        ? 'There are no vertices, so the matching is empty.'
        : `Edmonds' blossom algorithm. Start with an empty matching and grow it one augmenting path at a time.`,
      ['sig', 'init'],
      2,
    );
    while (g.vertices.length > 0 && (yield* phase(g, r, step))) {
      /* another phase */
    }
    r.done = true;
    r.v = undefined;
    r.w = undefined;
    r.tree = {};
    r.seen = {};
    r.path = [];
    for (const v of g.vertices) {
      r.label[v] = null;
      r.base[v] = v;
    }
    const k = matchingSize(g, r.mate);
    const unmatched = g.vertices.filter((v) => !r.mate[v]);
    yield step(
      g.vertices.length === 0
        ? 'Done: nothing to match.'
        : `Done: no augmenting path is left, so the matching is maximum. ${plural(k, 'edge')}${k ? `: ${pairsText(g, r.mate)}` : ''}. ${unmatched.length === 0 ? 'Every vertex is matched: a perfect matching.' : `${listWords(unmatched)} ${unmatched.length === 1 ? 'stays' : 'stay'} free.`} ${plural(r.blossoms, 'blossom')} contracted along the way.`,
      ['ret'],
      1,
      matchedPairs(g, r.mate).map(([a, b]) => mark(edgeId(edgeKey(g, a, b)), 'active')),
    );
    return s;
  },
};

const load = loadOp<S, BlSettings, X>({
  make: (graph) => ({ graph: simple(graph) }),
  ready: (g) =>
    g.directed
      ? 'Matching ignores direction, so every arc is read as an edge. Press Find a maximum matching.'
      : 'Press Find a maximum matching.',
});

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode. Lines stay short for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'run',
      lines: [
        L('sig', 0, 'BLOSSOM(G)', 'Find a maximum matching:'),
        L('init', 1, 'M = empty', 'Start with no matched edges.'),
        L('phase', 1, 'repeat', 'Repeat:'),
        L('roots', 2, 'each free v: root, even', 'every free vertex roots a tree.'),
        L('loop', 2, 'for each even v in queue', 'Take an even vertex v'),
        L('for', 3, 'for each edge v-w', 'and look at each of its edges:'),
        L('skip', 4, 'if w odd or same blossom: skip', 'odd or same blossom: skip.'),
        L('grow', 4, 'elseif w not in forest', 'If w is in no tree,'),
        L('grow.odd', 5, 'w.odd; w.p = v', 'w hangs off v as odd'),
        L('grow.even', 5, 'mate(w).even; enqueue', 'and its mate is even.'),
        L('aug', 4, 'elseif w even, other tree', 'If w is even in another tree,'),
        L('expand', 5, 'expand blossoms on path', 'unfold the blossoms on the path,'),
        L('flip', 5, 'flip path; next phase', 'flip it and start again.'),
        L('bl', 4, 'else (w even, same tree)', 'If w is even in the same tree,'),
        L('bl.base', 5, 'b = LCA(v, w)', 'the odd cycle is a blossom with base b;'),
        L('bl.shrink', 5, 'contract cycle into b', 'shrink it to one vertex,'),
        L('bl.queue', 5, 'odd vertices: even, enqueue', 'its odd vertices become even.'),
        L('ret', 1, 'until no path; return M', 'No path left: M is maximum.'),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Press Find a maximum matching to pair up as many vertices as possible, odd cycles and all.`;
}

export function initialVars(s: S) {
  return graphVars(s.graph);
}

export function describe(s: S): string {
  return describeGraph(s.graph);
}

export function describeRun(g: Graph, r: BlRun): string {
  const pairs = pairsText(g, r.mate);
  const bl = [...blossomsOf(g, r)].map(([b, vs]) => `blossom ${braces(vs)} with base ${b}`);
  return `Blossom algorithm${r.done ? ', done' : `, phase ${r.phase}`}. Matched: ${pairs || 'none yet'}.${bl.length ? ` ${bl.join('; ')}.` : ''}`;
}
