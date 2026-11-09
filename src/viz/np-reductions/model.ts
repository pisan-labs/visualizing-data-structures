/**
 * NP-completeness reductions: a map of classic problems joined by reductions, and five of the
 * reductions walked through step by step on a tiny instance.
 *
 *   3-SAT → INDEPENDENT-SET   one triangle per clause (a vertex per literal), an edge between
 *                             every x and ¬x in different clauses, k = number of clauses.
 *   INDEPENDENT-SET → VERTEX-COVER   the same graph, k' = n - k (S independent ⇔ V - S covers).
 *   INDEPENDENT-SET → CLIQUE  the complement graph, the same k.
 *   CLIQUE → VERTEX-COVER     the complement graph, k' = n - k (the CLRS route).
 *   VERTEX-COVER → SET-COVER  one element per edge, one set per vertex (the edges it touches).
 *
 * A reduction builds the new instance without solving anything, in polynomial time. With the
 * `check` setting on (the default), the run then shows that the answer carries over: it takes a
 * certificate for the old instance (found by brute force when none is known, which is the
 * exponential part and not part of the reduction), maps it across, and checks it. For a
 * no-instance it shows by brute force that the new instance has no certificate either.
 *
 * The current instance is the state, so reductions chain: 3-SAT → IND-SET → V-COVER → SET-COVER.
 * Vertices of a 3-SAT graph are named by literal and clause: ¬b2 is the ¬b of clause 2.
 * Every list keeps a fixed order (clauses as typed, vertices and edges as built), so the code
 * tabs build exactly the same instances.
 */
import type { Mark, MarkRole, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { layoutGraph } from '../../layouts/graph';
import { readGraph } from '../_graph/parse';

export type Problem = '3sat' | 'is' | 'vc' | 'clique' | 'sc';

export const NAMES: Record<Problem, string> = {
  '3sat': '3-SAT',
  is: 'INDEPENDENT-SET',
  vc: 'VERTEX-COVER',
  clique: 'CLIQUE',
  sc: 'SET-COVER',
};

/** What a certificate of each problem is called. */
const THING: Record<Problem, string> = {
  '3sat': 'satisfying assignment',
  is: 'independent set',
  vc: 'vertex cover',
  clique: 'clique',
  sc: 'set cover',
};

export interface Lit {
  v: number;
  neg: boolean;
}

export interface Formula {
  vars: string[];
  clauses: Lit[][];
}

export interface Pt {
  x: number;
  y: number;
}

export interface UGraph {
  vertices: string[];
  edges: [string, string][];
  pos: Record<string, Pt>;
}

export interface Family {
  /** The universe is 1..m. */
  m: number;
  sets: { name: string; items: number[] }[];
}

export interface Inst {
  problem: Problem;
  formula: Formula | null;
  /** The graph (for SET-COVER, the graph its sets came from, kept for the picture). */
  graph: UGraph | null;
  family: Family | null;
  k: number;
  /** A certificate when one is known: true variables, vertices, or set names. */
  witness: string[] | null;
  answer: 'yes' | 'no' | null;
}

export interface NpState {
  inst: Inst;
  show: 'map' | 'instance';
}

export interface NpSettings {
  [key: string]: Scalar;
  check: 'witness' | 'none';
}

export const defaults: NpSettings = { check: 'witness' };

export interface NpExtra {
  /** 3-SAT → IND-SET: the formula being read, and the clause being turned into a triangle. */
  formula?: Formula;
  clause?: number;
  /** An assignment to show, by variable. */
  assign?: boolean[];
  /** Vertices (or set names) chosen so far. */
  chosen?: string[];
  /** Edges of the old graph that the complement drops, drawn dashed. */
  gone?: [string, string][];
  /** The instance this one came from. */
  from?: { problem: Problem; k: number };
  /** Edges (by number, from 1) or edge keys already checked as covered. */
  covered?: string[];
  /** Map: the reduction being walked. */
  route?: [string, string];
}

type S = NpState;
type X = NpExtra;
type Op = OpSpec<S, NpSettings, X>;
type NpStep = Step<S, X>;
type Gen<R = S> = Generator<NpStep, R, void>;

export const MAX_CLAUSES = 4;
export const MAX_VARS = 4;
export const MAX_GRAPH = 8;
/** A complement with more edges than this is too dense to read. */
export const MAX_COMPLEMENT = 36;
export const NOT = '¬';

export const START_TEXT = 'a | !b | c, !a | b | c, a | b | !c';

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const listWords = (xs: readonly string[]) =>
  xs.length === 0
    ? 'none'
    : xs.length === 1
      ? xs[0]!
      : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
/** Spaced braces, so a one-element set never reads like a template token. */
export const setText = (xs: readonly (string | number)[]) =>
  xs.length ? `{ ${xs.join(', ')} }` : 'the empty set';

// ---------------------------------------------------------------------------------------------
// Shape ids (the view draws these)

export const vxId = (v: string) => `vx-${v}`;
export const edgeKey = (e: [string, string]) => `${e[0]}-${e[1]}`;
export const eId = (e: [string, string]) => `e-${edgeKey(e)}`;
export const boxId = (p: string) => `p-${p}`;
export const arcId = (a: string, b: string) => `r-${a}-${b}`;
export const clauseId = (j: number) => `cl-${j}`;
export const setId = (name: string) => `sets-${name}`;

// ---------------------------------------------------------------------------------------------
// The map

export interface MapProblem {
  id: string;
  name: string;
  col: number;
  row: number;
}

export const MAP: MapProblem[] = [
  { id: 'sat', name: 'SAT', col: 0, row: 0 },
  { id: '3sat', name: '3-SAT', col: 0, row: 1 },
  { id: '3col', name: '3-COLOR', col: 1, row: 0 },
  { id: 'is', name: 'IND-SET', col: 1, row: 1 },
  { id: 'ssum', name: 'SUBSET-SUM', col: 1, row: 2 },
  { id: 'clique', name: 'CLIQUE', col: 2, row: 0 },
  { id: 'vc', name: 'V-COVER', col: 2, row: 1 },
  { id: 'tsp', name: 'TSP', col: 2, row: 2 },
  { id: 'sc', name: 'SET-COVER', col: 3, row: 1 },
  { id: 'ham', name: 'HAM-CYCLE', col: 3, row: 2 },
];

/** Reductions on the map: A → B means B is at least as hard as A. `walk` ones run here. */
export const ARCS: { from: string; to: string; walk: boolean; how: string }[] = [
  { from: 'sat', to: '3sat', walk: false, how: 'split long clauses with new variables' },
  { from: '3sat', to: 'is', walk: true, how: 'a triangle per clause' },
  { from: '3sat', to: 'ssum', walk: false, how: 'a digit per variable and per clause' },
  { from: '3sat', to: '3col', walk: false, how: 'a palette triangle and clause gadgets' },
  { from: 'is', to: 'clique', walk: true, how: 'the complement graph' },
  { from: 'is', to: 'vc', walk: true, how: 'k becomes n - k' },
  { from: 'clique', to: 'vc', walk: true, how: 'the complement, and n - k' },
  { from: 'vc', to: 'sc', walk: true, how: 'a set per vertex' },
  { from: 'vc', to: 'ham', walk: false, how: 'a 12-vertex widget per edge' },
  { from: 'ham', to: 'tsp', walk: false, how: 'cost 0 on edges, 1 off them' },
];

/** Where each problem on this page can be reduced to here. */
export const NEXT: Record<Problem, Problem[]> = {
  '3sat': ['is'],
  is: ['vc', 'clique'],
  clique: ['vc'],
  vc: ['sc'],
  sc: [],
};

// ---------------------------------------------------------------------------------------------
// Reading input

const VAR = /^[a-z]$/;

export const litName = (f: Formula, l: Lit) => `${l.neg ? NOT : ''}${f.vars[l.v]}`;
export const clauseText = (f: Formula, c: Lit[]) => c.map((l) => litName(f, l)).join(' ∨ ');
export const formulaText = (f: Formula) =>
  f.clauses.map((c) => `(${clauseText(f, c)})`).join(' ∧ ');
/** The vertex for literal l of clause j. */
export const litVertex = (f: Formula, l: Lit, j: number) => `${litName(f, l)}${j + 1}`;

/** Read "a | !b | c, !a | b": clauses split by , ; & or ∧, literals by | or ∨; ! ~ ¬ negate. */
export function parseFormula(raw: string): Formula | Error {
  const text = raw.trim();
  if (!text) return new Error('Type clauses such as a | !b | c, !a | b.');
  const parts = text
    .split(/[,;&∧]+/)
    .map((c) => c.trim())
    .filter((c) => c !== '');
  if (parts.length > MAX_CLAUSES)
    return new Error(
      `That is ${parts.length} clauses. Keep it to ${MAX_CLAUSES}, so the graph fits.`,
    );
  const raws: { name: string; neg: boolean }[][] = [];
  for (const part of parts) {
    const body = part.replace(/^\(+|\)+$/g, '').trim();
    const lits = body
      .split(/\|\||[|∨]/)
      .map((l) => l.trim())
      .filter((l) => l !== '');
    if (lits.length === 0) return new Error(`"${part.slice(0, 12)}" has no literals.`);
    if (lits.length > 3)
      return new Error(`"${part.slice(0, 16)}" has ${lits.length} literals; 3-SAT allows three.`);
    const clause: { name: string; neg: boolean }[] = [];
    for (const l of lits) {
      const m = /^([!~¬]*)\s*(.*)$/.exec(l)!;
      const name = m[2]!.toLowerCase();
      if (!VAR.test(name))
        return new Error(
          `"${l.slice(0, 8)}" is not a literal. Use one letter per variable, with ! for not: a | !b.`,
        );
      const neg = m[1]!.length % 2 === 1;
      if (clause.some((c) => c.name === name && c.neg === neg))
        return new Error(`"${l}" appears twice in one clause. Use each literal once.`);
      clause.push({ name, neg });
    }
    raws.push(clause);
  }
  const vars = [...new Set(raws.flat().map((l) => l.name))].sort();
  if (vars.length > MAX_VARS) return new Error(`Keep it to ${MAX_VARS} variables.`);
  const index = new Map(vars.map((v, i) => [v, i]));
  return { vars, clauses: raws.map((c) => c.map((l) => ({ v: index.get(l.name)!, neg: l.neg }))) };
}

const PREFIX = /^\s*(is|ind-set|independent-set|vc|v-cover|vertex-cover|clique)\s*:\s*/i;
const KPART = /\bk\s*=\s*(-?\d+)\s*$/i;

/** A graph instance: "A-B, B-C k=2", optionally after "vc:" or "clique:". */
export function parseGraphInstance(
  raw: string,
): { problem: Problem; graph: UGraph; k: number | null } | Error {
  let text = raw.trim();
  let problem: Problem = 'is';
  const p = PREFIX.exec(text);
  if (p) {
    const w = p[1]!.toLowerCase();
    problem = w.startsWith('v') ? 'vc' : w === 'clique' ? 'clique' : 'is';
    text = text.slice(p[0].length);
  }
  let k: number | null = null;
  const km = KPART.exec(text);
  if (km) {
    k = Number(km[1]);
    text = text
      .slice(0, km.index)
      .trim()
      .replace(/[,;]\s*$/, '');
  }
  const r = readGraph(text);
  if (r instanceof Error) return r;
  const g = r.graph;
  if (g.directed)
    return new Error(
      'Use undirected edges, such as A-B: these problems are about undirected graphs.',
    );
  if (g.vertices.length > MAX_GRAPH)
    return new Error(
      `That graph has ${g.vertices.length} vertices. Keep it to ${MAX_GRAPH}, so brute force stays quick.`,
    );
  if (k !== null && (k < 0 || k > g.vertices.length))
    return new Error(
      `k = ${k} is out of range: pick k from 0 to ${g.vertices.length}, the number of vertices.`,
    );
  const like = {
    directed: false,
    weighted: false,
    vertices: g.vertices,
    edges: g.edges.map((e) => ({ ...e, w: 1 })),
  };
  const pos: Record<string, Pt> = {};
  const lay = layoutGraph(like, 'circle');
  for (const v of g.vertices) pos[v] = { ...lay.pos[v]! };
  return {
    problem,
    graph: {
      vertices: [...g.vertices],
      edges: g.edges.map((e) => [e.u, e.v] as [string, string]),
      pos,
    },
    k,
  };
}

const looksLikeFormula = (t: string) => /[|∨!¬~()]/.test(t);

export function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (!t)
    return new Error('Type a formula such as a | !b | c, !a | b, or a graph such as A-B, B-C k=2.');
  const r = looksLikeFormula(t) ? parseFormula(t) : parseGraphInstance(t);
  return r instanceof Error ? r : t;
}

// ---------------------------------------------------------------------------------------------
// Brute force (the check, never the reduction)

export const satisfies = (f: Formula, a: boolean[]) =>
  f.clauses.every((c) => c.some((l) => a[l.v] !== l.neg));

/** The first satisfying assignment, trying 000…, 100…, 010… (variable i is bit i). */
export function solveSat(f: Formula): boolean[] | null {
  const n = f.vars.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const a = f.vars.map((_, i) => ((mask >> i) & 1) === 1);
    if (satisfies(f, a)) return a;
  }
  return null;
}

export function adjacent(g: UGraph, u: string, v: string): boolean {
  return g.edges.some(([a, b]) => (a === u && b === v) || (a === v && b === u));
}

export function isCertificate(g: UGraph, problem: 'is' | 'vc' | 'clique', set: string[]): boolean {
  const inS = new Set(set);
  if (problem === 'vc') return g.edges.every(([a, b]) => inS.has(a) || inS.has(b));
  for (let i = 0; i < set.length; i++)
    for (let j = i + 1; j < set.length; j++) {
      const e = adjacent(g, set[i]!, set[j]!);
      if (problem === 'is' ? e : !e) return false;
    }
  return true;
}

/** Subsets of size k of xs, in lexicographic order of positions. */
function* combinations<T>(xs: T[], k: number): Generator<T[]> {
  const n = xs.length;
  if (k > n || k < 0) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    yield idx.map((i) => xs[i]!);
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]!++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1]! + 1;
  }
}

/** The first certificate of size exactly k (for IS and CLIQUE, at least k is the same). */
export function solveGraph(g: UGraph, problem: 'is' | 'vc' | 'clique', k: number): string[] | null {
  for (const c of combinations(g.vertices, k)) if (isCertificate(g, problem, c)) return c;
  return null;
}

/** The size of a best certificate: largest independent set or clique, smallest cover. */
export function optimum(g: UGraph, problem: 'is' | 'vc' | 'clique'): number {
  const n = g.vertices.length;
  if (problem === 'vc') {
    for (let k = 0; k <= n; k++) if (solveGraph(g, 'vc', k)) return k;
    return n;
  }
  for (let k = n; k >= 0; k--) if (solveGraph(g, problem, k)) return k;
  return 0;
}

export function covers(f: Family, names: string[]): boolean {
  const got = new Set(f.sets.filter((s) => names.includes(s.name)).flatMap((s) => s.items));
  return Array.from({ length: f.m }, (_, i) => i + 1).every((x) => got.has(x));
}

export function solveCover(f: Family, k: number): string[] | null {
  for (const c of combinations(
    f.sets.map((s) => s.name),
    Math.min(k, f.sets.length),
  ))
    if (covers(f, c)) return c;
  return null;
}

export function smallestCover(f: Family): number {
  for (let k = 0; k <= f.sets.length; k++) if (solveCover(f, k)) return k;
  return f.sets.length;
}

// ---------------------------------------------------------------------------------------------
// The reductions themselves (pure, polynomial; the code tabs implement exactly these)

/**
 * Positions of the clause gadgets: the triangles sit around a circle, each with one corner
 * pointing out, so the edges between clauses cross the empty middle instead of running along
 * a row of vertices.
 */
function gadgetPos(f: Formula): Record<string, Pt> {
  const m = f.clauses.length;
  const ring = m === 1 ? 0 : m === 2 ? 84 : m === 3 ? 104 : 124;
  const r = 40;
  const pos: Record<string, Pt> = {};
  const round = (x: number) => Math.round(x * 10) / 10;
  f.clauses.forEach((c, j) => {
    const t = -Math.PI / 2 + (2 * Math.PI * j) / m;
    const cx = ring * Math.cos(t);
    const cy = ring * Math.sin(t);
    const at = (a: number, d = r) => ({
      x: round(cx + d * Math.cos(a)),
      y: round(cy + d * Math.sin(a)),
    });
    const spots =
      c.length === 3
        ? [0, 1, 2].map((i) => at(t + (2 * Math.PI * i) / 3))
        : c.length === 2
          ? [at(t - Math.PI / 2, 36), at(t + Math.PI / 2, 36)]
          : [at(0, 0)];
    c.forEach((l, i) => (pos[litVertex(f, l, j)] = spots[i]!));
  });
  return pos;
}

export function satToIs(f: Formula): { graph: UGraph; k: number } {
  const vertices: string[] = [];
  const edges: [string, string][] = [];
  f.clauses.forEach((c, j) => {
    const vs = c.map((l) => litVertex(f, l, j));
    vertices.push(...vs);
    for (let a = 0; a < vs.length; a++)
      for (let b = a + 1; b < vs.length; b++) edges.push([vs[a]!, vs[b]!]);
  });
  edges.push(...conflicts(f));
  return { graph: { vertices, edges, pos: gadgetPos(f) }, k: f.clauses.length };
}

/** Edges between x in one clause and ¬x in a later one. */
export function conflicts(f: Formula, onlyVar?: number): [string, string][] {
  const out: [string, string][] = [];
  const m = f.clauses.length;
  for (let i = 0; i < m; i++)
    for (let j = i + 1; j < m; j++)
      for (const a of f.clauses[i]!)
        for (const b of f.clauses[j]!)
          if (a.v === b.v && a.neg !== b.neg && (onlyVar === undefined || a.v === onlyVar))
            out.push([litVertex(f, a, i), litVertex(f, b, j)]);
  return out;
}

export function complement(g: UGraph): UGraph {
  const edges: [string, string][] = [];
  const vs = g.vertices;
  for (let i = 0; i < vs.length; i++)
    for (let j = i + 1; j < vs.length; j++)
      if (!adjacent(g, vs[i]!, vs[j]!)) edges.push([vs[i]!, vs[j]!]);
  return { vertices: [...vs], edges, pos: g.pos };
}

export function vcToSc(g: UGraph): Family {
  return {
    m: g.edges.length,
    sets: g.vertices.map((v) => ({
      name: v,
      items: g.edges.flatMap((e, i) => (e[0] === v || e[1] === v ? [i + 1] : [])),
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// State helpers

const blank = (problem: Problem): Inst => ({
  problem,
  formula: null,
  graph: null,
  family: null,
  k: 0,
  witness: null,
  answer: null,
});

export function formulaInst(f: Formula): Inst {
  return { ...blank('3sat'), formula: f, k: f.clauses.length };
}

export function init(): S {
  return { inst: formulaInst(parseFormula(START_TEXT) as Formula), show: 'map' };
}

/** The instance as one sentence. */
export function instText(i: Inst): string {
  switch (i.problem) {
    case '3sat':
      return `3-SAT: ${formulaText(i.formula!)}. Is there an assignment that makes every clause true?`;
    case 'sc':
      return `SET-COVER: universe {1, …, ${i.family!.m}} and ${plural(i.family!.sets.length, 'set')}. Do ${i.k} of them cover the universe?`;
    default: {
      const g = i.graph!;
      return `${NAMES[i.problem]}: a graph with ${plural(g.vertices.length, 'vertex', 'vertices')} and ${plural(g.edges.length, 'edge')}. Is there ${i.problem === 'is' ? 'an' : 'a'} ${THING[i.problem]} of size ${i.k}?`;
    }
  }
}

/** The size of an instance, as the reduction's input or output. */
function sizeOf(i: Inst): number {
  if (i.problem === '3sat') return i.formula!.clauses.reduce((a, c) => a + c.length, 0);
  if (i.problem === 'sc')
    return i.family!.sets.reduce((a, s) => a + s.items.length, 0) + i.family!.m;
  return i.graph!.vertices.length + i.graph!.edges.length;
}

function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  const i = s.inst;
  const base: Record<string, Scalar> = { problem: NAMES[i.problem] };
  if (i.problem === '3sat') {
    base.variables = i.formula!.vars.length;
    base.clauses = i.formula!.clauses.length;
  } else if (i.problem === 'sc') {
    base.U = i.family!.m;
    base.sets = i.family!.sets.length;
    base.k = i.k;
  } else {
    base.V = i.graph!.vertices.length;
    base.E = i.graph!.edges.length;
    base.k = i.k;
  }
  base.size = sizeOf(i);
  base.answer = i.answer ?? '?';
  return { ...base, ...more };
}

// ---------------------------------------------------------------------------------------------
// Operations

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const t = String(arg ?? '').trim();
    const r = !t
      ? new Error('Type a formula or a graph.')
      : looksLikeFormula(t)
        ? parseFormula(t)
        : parseGraphInstance(t);
    if (r instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: `Nothing loaded. ${r.message} The instance stays as it was.`,
        lines: [],
        level: 1,
        vars: vars(s),
      };
      return s;
    }
    let inst: Inst;
    let note = '';
    if ('clauses' in r) {
      inst = formulaInst(r);
    } else {
      const p = r.problem as 'is' | 'vc' | 'clique';
      const k = r.k ?? optimum(r.graph, p);
      if (r.k === null)
        note = ` No k given, so k = ${k}, the ${p === 'vc' ? 'smallest' : 'largest'} size there is: the answer is yes.`;
      inst = { ...blank(p), graph: r.graph, k };
    }
    const next: S = { inst, show: 'instance' };
    const to = NEXT[inst.problem].map((p) => NAMES[p]);
    yield {
      state: next,
      marks: [],
      say: `Loaded ${instText(inst)}${note} From here you can reduce it to ${listWords(to)}.`,
      lines: [],
      level: 1,
      vars: vars(next),
    };
    return next;
  },
};

const mapOp: Op = {
  label: 'Show the map',
  arity: 0,
  *run(s) {
    const next: S = { ...s, show: 'map' };
    const here = s.inst.problem;
    const walks = ARCS.filter((a) => a.walk).length;
    yield {
      state: next,
      marks: [mark(boxId(here), 'active')],
      say: `The map: an arrow A → B is a polynomial-time reduction, so B is at least as hard as A. Everything here is NP-complete, all from SAT (Cook and Levin). The ${walks} solid arrows can be stepped through on this page; you are at ${NAMES[here]}.`,
      lines: [],
      level: 1,
      vars: vars(next),
      extra: {},
    };
    return next;
  },
};

/** The first step of a reduction: the arrow on the map. */
function mapStep(s: S, from: Problem, to: Problem, how: string): NpStep {
  return {
    state: { ...s, show: 'map' },
    marks: [mark(arcId(from, to), 'active'), mark(boxId(from), 'active'), mark(boxId(to), 'new')],
    say: `Reduce ${NAMES[from]} to ${NAMES[to]}: ${how}. If ${NAMES[to]} had a fast algorithm, ${NAMES[from]} would too: translate, then solve.`,
    lines: [],
    level: 2,
    vars: vars(s),
    extra: { route: [from, to] },
  };
}

/** Says why a reduction cannot start from here. */
function* wrongStart(s: S, to: Problem): Gen {
  const here = s.inst.problem;
  const from = (Object.keys(NEXT) as Problem[]).filter((p) => NEXT[p].includes(to));
  const can = NEXT[here].map((p) => NAMES[p]);
  yield {
    state: s,
    marks: [],
    say:
      here === to
        ? `This is already ${to === 'is' ? 'an' : 'a'} ${NAMES[to]} instance. ${can.length ? `From here you can reduce it to ${listWords(can)}.` : 'Load a formula or a graph to start again.'}`
        : `The reduction to ${NAMES[to]} on this page starts from ${listWords(from.map((p) => NAMES[p]))}, and this is a ${NAMES[here]} instance. ${can.length ? `From here you can reduce it to ${listWords(can)}.` : 'SET-COVER is the end of the line here: load a formula or a graph to start again.'}`,
    lines: [],
    level: 1,
    vars: vars(s),
  };
  return s;
}

/** Brute-force a certificate for the source when none is known (only with the check on). */
function knownWitness(i: Inst): string[] | null {
  if (i.witness) return i.witness;
  if (i.answer === 'no') return null;
  if (i.problem === '3sat') {
    const a = solveSat(i.formula!);
    return a && i.formula!.vars.filter((_, k) => a[k]);
  }
  if (i.problem === 'sc') return solveCover(i.family!, i.k);
  return solveGraph(i.graph!, i.problem, i.k);
}

const assignmentOf = (f: Formula, trueVars: string[]) => f.vars.map((v) => trueVars.includes(v));
const assignText = (f: Formula, a: boolean[]) =>
  f.vars.map((v, k) => `${v} = ${a[k] ? 'T' : 'F'}`).join(', ');

// ----- 3-SAT → INDEPENDENT-SET -----

const toIs: Op = {
  label: 'Reduce to IND-SET',
  arity: 0,
  *run(s0, _args, { settings }) {
    if (s0.inst.problem !== '3sat') return yield* wrongStart(s0, 'is');
    const src = s0.inst;
    const f = src.formula!;
    const m = f.clauses.length;
    yield mapStep(s0, '3sat', 'is', 'one triangle per clause');
    const full = satToIs(f);
    const from = { problem: '3sat' as Problem, k: m };
    // Grow the graph clause by clause, then add the conflict edges variable by variable.
    const vertices: string[] = [];
    const edges: [string, string][] = [];
    const partial = (k: number): S => ({
      inst: {
        ...blank('is'),
        graph: { vertices: [...vertices], edges: [...edges], pos: full.graph.pos },
        k,
      },
      show: 'instance',
    });
    for (let j = 0; j < m; j++) {
      const c = f.clauses[j]!;
      const vs = c.map((l) => litVertex(f, l, j));
      vertices.push(...vs);
      const fresh: [string, string][] = [];
      for (let a = 0; a < vs.length; a++)
        for (let b = a + 1; b < vs.length; b++) fresh.push([vs[a]!, vs[b]!]);
      edges.push(...fresh);
      const s = partial(0);
      const shape = c.length === 3 ? 'a triangle' : c.length === 2 ? 'an edge' : 'a lone vertex';
      yield {
        state: s,
        marks: [
          ...vs.map((v) => mark(vxId(v), 'new')),
          ...fresh.map((e) => mark(eId(e), 'new')),
          mark(clauseId(j), 'active'),
        ],
        say: `Clause ${j + 1}, (${clauseText(f, c)}): one vertex per literal, joined into ${shape}. An independent set can take at most one vertex of it, so it picks at most one literal per clause.`,
        lines: ['i.for', 'i.tri'],
        level: 2,
        vars: vars(s, { clause: j + 1 }),
        extra: { formula: f, clause: j, from },
      };
    }
    const lonely: string[] = [];
    for (let v = 0; v < f.vars.length; v++) {
      const name = f.vars[v]!;
      const add = conflicts(f, v);
      if (add.length === 0) {
        lonely.push(name);
        continue;
      }
      edges.push(...add);
      const s = partial(0);
      yield {
        state: s,
        marks: add.map((e) => mark(eId(e), 'new')),
        say: `Join every ${name} to every ${NOT}${name} in another clause: ${plural(add.length, 'edge')}. An independent set never holds both ends of an edge, so the literals it picks never contradict each other.`,
        lines: ['i.conf'],
        level: 2,
        vars: vars(s),
        extra: { formula: f, from },
      };
    }
    const built: S = { inst: { ...blank('is'), graph: full.graph, k: m }, show: 'instance' };
    const g = full.graph;
    yield {
      state: built,
      marks: [],
      say: `${lonely.length ? `${listWords(lonely)} never ${lonely.length === 1 ? 'appears' : 'appear'} both plain and negated, so no edges for ${lonely.length === 1 ? 'it' : 'them'}. ` : ''}Set k = ${m}, the number of clauses. The new instance has ${plural(g.vertices.length, 'vertex', 'vertices')} (3 per clause at most) and ${plural(g.edges.length, 'edge')}: polynomial in the size of the formula, and built without solving anything.`,
      lines: ['i.k', 'i.ret'],
      level: 2,
      vars: vars(built),
      extra: { formula: f, from },
    };
    return yield* finishFromSat(built, src, settings);
  },
};

function* finishFromSat(built: S, src: Inst, settings: NpSettings): Gen {
  const f = src.formula!;
  const g = built.inst.graph!;
  const m = f.clauses.length;
  const from = { problem: '3sat' as Problem, k: m };
  const canSolve = settings.check === 'witness';
  const w = src.witness ?? (canSolve ? knownWitness(src) : null);
  if (w) {
    const a = assignmentOf(f, w);
    if (!src.witness)
      yield {
        state: built,
        marks: f.clauses.map((_, j) => mark(clauseId(j), 'found')),
        say: `Now check that yes maps to yes. This part is not the reduction: try all ${1 << f.vars.length} assignments by brute force. ${assignText(f, a)} makes every clause true.`,
        lines: ['i.solve'],
        level: 2,
        vars: vars(built),
        extra: { formula: f, assign: a, from },
      };
    const chosen = f.clauses.map((c, j) =>
      litVertex(
        f,
        c.find((l) => a[l.v] !== l.neg)!,
        j,
      ),
    );
    const done: S = { inst: { ...built.inst, witness: chosen, answer: 'yes' }, show: 'instance' };
    yield {
      state: done,
      marks: chosen.map((v) => mark(vxId(v), 'found')),
      say: `In each triangle, take a vertex whose literal is true: ${listWords(chosen)}. That is ${plural(m, 'vertex', 'vertices')}, one per triangle, and no edge joins two of them: not inside a triangle, and not x to ${NOT}x, since x cannot be both true and false. An independent set of size k = ${m}, so the answer is yes on both sides. (Back the other way: an independent set of size k has one vertex per triangle; make those literals true.)`,
      lines: ['i.map', 'i.ok'],
      level: 1,
      vars: vars(done),
      extra: { formula: f, assign: a, chosen, from },
    };
    return done;
  }
  if (canSolve || src.answer === 'no') {
    const best = optimum(g, 'is');
    const done: S = { inst: { ...built.inst, answer: 'no' }, show: 'instance' };
    yield {
      state: done,
      marks: [],
      say: `Now check that no maps to no: all ${1 << f.vars.length} assignments fail, so the formula is unsatisfiable. And G has no independent set of size ${m}: brute force finds ${best} at most. If it had one, its vertices would pick a true literal in every clause without contradiction, and the formula would be satisfiable.`,
      lines: canSolve ? ['i.solve', 'i.ok'] : ['i.ok'],
      level: 1,
      vars: vars(done),
      extra: { formula: f, from },
    };
    return done;
  }
  yield {
    state: built,
    marks: [],
    say: `Built. G has an independent set of size ${m} exactly when the formula is satisfiable. (Turn on the check in Options to see a certificate carried across.)`,
    lines: ['i.ret'],
    level: 1,
    vars: vars(built),
    extra: { from },
  };
  return built;
}

// ----- Graph to graph: complement and n - k -----

interface GraphWay {
  from: 'is' | 'clique';
  to: 'vc' | 'clique';
  flip: boolean;
  nMinusK: boolean;
  p: string;
}

const WAYS: GraphWay[] = [
  { from: 'is', to: 'vc', flip: false, nMinusK: true, p: 'v' },
  { from: 'clique', to: 'vc', flip: true, nMinusK: true, p: 'v' },
  { from: 'is', to: 'clique', flip: true, nMinusK: false, p: 'c' },
];

function* graphReduction(s0: S, way: GraphWay, settings: NpSettings): Gen {
  const src = s0.inst;
  const g0 = src.graph!;
  const n = g0.vertices.length;
  const { p } = way;
  const how = way.flip
    ? way.nMinusK
      ? 'the complement graph, and k becomes n - k'
      : 'the complement graph, with the same k'
    : 'the same graph, and k becomes n - k';
  if (way.flip) {
    const c = complement(g0);
    if (c.edges.length > MAX_COMPLEMENT) {
      yield {
        state: s0,
        marks: [],
        say: `The complement of this graph would have ${c.edges.length} edges, too many to draw clearly here. The reduction still works; try it on a smaller instance, such as one loaded as a graph.`,
        lines: [],
        level: 1,
        vars: vars(s0),
      };
      return s0;
    }
  }
  yield mapStep(s0, way.from, way.to, how);
  const from = { problem: way.from as Problem, k: src.k };
  let g = g0;
  if (way.flip) {
    const before: S = { inst: { ...src }, show: 'instance' };
    yield {
      state: before,
      marks: g0.edges.map((e) => mark(eId(e), 'remove')),
      say: `Take the complement of G: the same ${plural(n, 'vertex', 'vertices')}, with an edge exactly where G has none. These ${plural(g0.edges.length, 'edge')} go.`,
      lines: [`${p}.comp`],
      level: 2,
      vars: vars(before),
      extra: { from },
    };
    g = complement(g0);
    const mid: S = { inst: { ...blank(way.to), graph: g, k: src.k }, show: 'instance' };
    yield {
      state: mid,
      marks: g.edges.map((e) => mark(eId(e), 'new')),
      say: `And every missing pair gets an edge: ${plural(g.edges.length, 'edge')} in the complement. ${plural(n, 'vertex', 'vertices')} ${n === 1 ? 'has' : 'have'} ${plural((n * (n - 1)) / 2, 'pair')}, so this takes O(n²) time.`,
      lines: [`${p}.comp`],
      level: 2,
      vars: vars(mid),
      extra: { from, gone: g0.edges },
    };
  }
  const k = way.nMinusK ? n - src.k : src.k;
  const built: S = { inst: { ...blank(way.to), graph: g, k }, show: 'instance' };
  yield {
    state: built,
    marks: [],
    say: way.nMinusK
      ? `Set k' = n - k = ${n} - ${src.k} = ${k}. ${way.from === 'is' ? 'S is independent exactly when V - S touches every edge: an edge with no end in V - S would have both ends in S.' : 'S is a clique in G exactly when V - S covers every edge of the complement: such an edge joins two vertices that are not joined in G, so they cannot both be in S.'}`
      : `k stays ${k}. S is independent in G exactly when every pair in S is joined in the complement: S is a clique there.`,
    lines: [`${p}.k`, `${p}.ret`],
    level: 2,
    vars: vars(built),
    extra: { from },
  };
  return yield* carryGraph(built, src, way, settings);
}

function* carryGraph(built: S, src: Inst, way: GraphWay, settings: NpSettings): Gen {
  const { p } = way;
  const g = built.inst.graph!;
  const from = { problem: way.from as Problem, k: src.k };
  const canSolve = settings.check === 'witness';
  const w = src.witness ?? (canSolve ? knownWitness(src) : null);
  const target = built.inst.problem as 'vc' | 'clique';
  if (w) {
    if (!src.witness) {
      yield {
        state: built,
        marks: w.map((v) => mark(vxId(v), 'found')),
        say: `Now check that yes maps to yes. Not part of the reduction: brute force over every set of ${plural(src.k, 'vertex', 'vertices')} finds ${THING[way.from] === 'clique' ? 'a clique' : 'an independent set'} in the old graph, ${setText(w)}.`,
        lines: [`${p}.solve`],
        level: 2,
        vars: vars(built),
        extra: { from, chosen: w },
      };
    }
    const mapped = way.nMinusK ? g.vertices.filter((v) => !w.includes(v)) : [...w];
    const done: S = { inst: { ...built.inst, witness: mapped, answer: 'yes' }, show: 'instance' };
    if (target === 'vc') {
      const seen: string[] = [];
      for (const e of g.edges) {
        seen.push(edgeKey(e));
        const end = mapped.includes(e[0]) ? e[0] : e[1];
        yield {
          state: built,
          marks: [mark(eId(e), 'found')],
          say: `Edge ${e[0]}-${e[1]}: ${end} is in ${setText(mapped)}, so it is covered.`,
          lines: [`${p}.ok`],
          level: 3,
          vars: vars(built),
          extra: { from, chosen: mapped, covered: [...seen] },
        };
      }
    }
    yield {
      state: done,
      marks: mapped.map((v) => mark(vxId(v), 'found')),
      say: way.nMinusK
        ? `Map it across: C = V - S = ${setText(mapped)}, ${plural(mapped.length, 'vertex', 'vertices')}. Every edge has an end in C, so C is a vertex cover of size k' = ${built.inst.k}. Yes maps to yes.`
        : `Map it across: the same set, ${setText(mapped)}. No two of its vertices were joined in G, so every two are joined in the complement: a clique of size ${built.inst.k}. Yes maps to yes.`,
      lines: [`${p}.map`, `${p}.ok`],
      level: 1,
      vars: vars(done),
      extra: { from, chosen: mapped },
    };
    return done;
  }
  if (canSolve || src.answer === 'no') {
    const old = optimum(src.graph!, way.from);
    const now = optimum(g, target);
    const done: S = { inst: { ...built.inst, answer: 'no' }, show: 'instance' };
    yield {
      state: done,
      marks: [],
      say: `Now check that no maps to no. Brute force: the largest ${THING[way.from]} in the old graph has size ${old}, less than k = ${src.k}. ${target === 'vc' ? `And the smallest vertex cover here has size ${now}, more than k' = ${built.inst.k}.` : `And the largest clique here has size ${now}, less than k = ${built.inst.k}.`} No on both sides.`,
      lines: canSolve ? [`${p}.solve`, `${p}.ok`] : [`${p}.ok`],
      level: 1,
      vars: vars(done),
      extra: { from },
    };
    return done;
  }
  yield {
    state: built,
    marks: [],
    say: `Built. The answers match: the new graph has a ${THING[target]} of size ${built.inst.k} exactly when the old one has a ${THING[way.from]} of size ${src.k}.`,
    lines: [`${p}.ret`],
    level: 1,
    vars: vars(built),
    extra: { from },
  };
  return built;
}

const toVc: Op = {
  label: 'Reduce to V-COVER',
  arity: 0,
  *run(s, _args, { settings }) {
    const way = WAYS.find((w) => w.to === 'vc' && w.from === s.inst.problem);
    if (!way) return yield* wrongStart(s, 'vc');
    return yield* graphReduction(s, way, settings);
  },
};

const toClique: Op = {
  label: 'Reduce to CLIQUE',
  arity: 0,
  *run(s, _args, { settings }) {
    const way = WAYS.find((w) => w.to === 'clique' && w.from === s.inst.problem);
    if (!way) return yield* wrongStart(s, 'clique');
    return yield* graphReduction(s, way, settings);
  },
};

// ----- VERTEX-COVER → SET-COVER -----

const toSc: Op = {
  label: 'Reduce to SET-COVER',
  arity: 0,
  *run(s0, _args, { settings }) {
    if (s0.inst.problem !== 'vc') return yield* wrongStart(s0, 'sc');
    const src = s0.inst;
    const g = src.graph!;
    const from = { problem: 'vc' as Problem, k: src.k };
    yield mapStep(s0, 'vc', 'sc', 'one element per edge, one set per vertex');
    const fam = vcToSc(g);
    const partial = (sets: number): S => ({
      inst: {
        ...blank('sc'),
        graph: g,
        family: { m: fam.m, sets: fam.sets.slice(0, sets) },
        k: src.k,
      },
      show: 'instance',
    });
    let s = partial(0);
    yield {
      state: s,
      marks: g.edges.map((e) => mark(eId(e), 'active')),
      say: `The universe U has one element per edge: ${fam.m === 1 ? 'number the one edge 1' : `number the edges 1 to ${fam.m}`}. Covering U will mean covering every edge.`,
      lines: ['s.U'],
      level: 2,
      vars: vars(s),
      extra: { from },
    };
    for (let i = 0; i < fam.sets.length; i++) {
      const set = fam.sets[i]!;
      s = partial(i + 1);
      yield {
        state: s,
        marks: [
          mark(vxId(set.name), 'active'),
          mark(setId(set.name), 'new'),
          ...g.edges.filter((e) => e.includes(set.name)).map((e) => mark(eId(e), 'compare')),
        ],
        say: `Vertex ${set.name} becomes the set S${set.name} = ${setText(set.items)}: the edges it touches.${set.items.length === 0 ? ' It touches none, so its set is empty.' : ''}`,
        lines: ['s.for', 's.set'],
        level: 2,
        vars: vars(s),
        extra: { from },
      };
    }
    const built = partial(fam.sets.length);
    yield {
      state: built,
      marks: [],
      say: `k stays ${src.k}. Picking set S_v is picking vertex v, and a set covers element e exactly when v touches edge e. The new instance has ${plural(fam.sets.length, 'set')} with ${2 * fam.m} entries in all (each edge goes into two sets): O(n + m).`,
      lines: ['s.k', 's.ret'],
      level: 2,
      vars: vars(built),
      extra: { from },
    };
    const canSolve = settings.check === 'witness';
    const w = src.witness ?? (canSolve ? knownWitness(src) : null);
    if (w) {
      if (!src.witness)
        yield {
          state: built,
          marks: w.map((v) => mark(vxId(v), 'found')),
          say: `Now check that yes maps to yes. Not part of the reduction: brute force finds a vertex cover of size ${src.k}, ${setText(w)}.`,
          lines: ['s.solve'],
          level: 2,
          vars: vars(built),
          extra: { from, chosen: w },
        };
      const covered: string[] = [];
      for (let e = 1; e <= fam.m; e++) {
        covered.push(String(e));
        const by = w.find((v) => fam.sets.find((x) => x.name === v)!.items.includes(e))!;
        yield {
          state: built,
          marks: [mark(eId(g.edges[e - 1]!), 'found')],
          say: `Element ${e} (edge ${g.edges[e - 1]!.join('-')}) is in S${by}.`,
          lines: ['s.ok'],
          level: 3,
          vars: vars(built),
          extra: { from, chosen: w, covered: [...covered] },
        };
      }
      const done: S = { inst: { ...built.inst, witness: [...w], answer: 'yes' }, show: 'instance' };
      yield {
        state: done,
        marks: w.map((v) => mark(setId(v), 'found')),
        say: `Map it across: the sets of the cover's vertices, ${w.map((v) => `S${v}`).join(', ')}. Every element of U is in one of them, so ${plural(src.k, 'set')} cover${src.k === 1 ? 's' : ''} U. Yes maps to yes.`,
        lines: ['s.map', 's.ok'],
        level: 1,
        vars: vars(done),
        extra: { from, chosen: w },
      };
      return done;
    }
    if (canSolve || src.answer === 'no') {
      const done: S = { inst: { ...built.inst, answer: 'no' }, show: 'instance' };
      yield {
        state: done,
        marks: [],
        say: `Now check that no maps to no. Brute force: the smallest vertex cover has ${plural(optimum(g, 'vc'), 'vertex', 'vertices')}, and the smallest set cover needs ${plural(smallestCover(fam), 'set')}, both more than k = ${src.k}.`,
        lines: canSolve ? ['s.solve', 's.ok'] : ['s.ok'],
        level: 1,
        vars: vars(done),
        extra: { from },
      };
      return done;
    }
    yield {
      state: built,
      marks: [],
      say: `Built. ${plural(src.k, 'set')} cover${src.k === 1 ? 's' : ''} U exactly when ${plural(src.k, 'vertex', 'vertices')} cover${src.k === 1 ? 's' : ''} every edge.`,
      lines: ['s.ret'],
      level: 1,
      vars: vars(built),
      extra: { from },
    };
    return built;
  },
};

// ----- Brute force on the current instance -----

const check: Op = {
  label: 'Solve by brute force',
  arity: 0,
  *run(s0) {
    const i = s0.inst;
    const s: S = { ...s0, show: 'instance' };
    const tries =
      i.problem === '3sat'
        ? `all ${1 << i.formula!.vars.length} assignments`
        : i.problem === 'sc'
          ? `every choice of ${plural(i.k, 'set')} out of ${i.family!.sets.length}`
          : `every set of ${plural(i.k, 'vertex', 'vertices')} out of ${i.graph!.vertices.length}`;
    yield {
      state: s,
      marks: [],
      say: `Solve ${NAMES[i.problem]} by brute force: try ${tries}. Nobody knows a way that is polynomial in the worst case, and finding one would show P = NP.`,
      lines: ['b.sig', 'b.for'],
      level: 2,
      vars: vars(s),
    };
    const w = knownWitness({ ...i, witness: null, answer: null });
    if (!w) {
      const done: S = { ...s, inst: { ...i, witness: null, answer: 'no' } };
      const best =
        i.problem === '3sat'
          ? 'No assignment makes every clause true.'
          : i.problem === 'sc'
            ? `The smallest cover needs ${plural(smallestCover(i.family!), 'set')}.`
            : `The ${i.problem === 'vc' ? 'smallest' : 'largest'} ${THING[i.problem]} has size ${optimum(i.graph!, i.problem)}.`;
      yield {
        state: done,
        marks: [],
        say: `None works: the answer is no. ${best}`,
        lines: ['b.no'],
        level: 1,
        vars: vars(done),
      };
      return done;
    }
    const done: S = { ...s, inst: { ...i, witness: w, answer: 'yes' } };
    const marks =
      i.problem === '3sat'
        ? i.formula!.clauses.map((_, j) => mark(clauseId(j), 'found'))
        : i.problem === 'sc'
          ? w.map((v) => mark(setId(v), 'found'))
          : w.map((v) => mark(vxId(v), 'found'));
    const what =
      i.problem === '3sat'
        ? assignText(i.formula!, assignmentOf(i.formula!, w))
        : i.problem === 'sc'
          ? w.map((v) => `S${v}`).join(', ')
          : setText(w);
    yield {
      state: done,
      marks,
      say: `Found one: ${what}. The answer is yes. Checking it took polynomial time; finding it took the search. That gap is what NP is about.`,
      lines: ['b.test'],
      level: 1,
      vars: vars(done),
      extra: i.problem === '3sat' ? { assign: assignmentOf(i.formula!, w) } : { chosen: w },
    };
    return done;
  },
};

export const ops = { load, map: mapOp, toIs, toVc, toClique, toSc, check };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: NpSettings): PseudoBlock[] {
  const on = settings.check === 'witness';
  // Finding a certificate is the exponential check; carrying a known one across is polynomial.
  const checks = (p: string, solve: string, map: string, ok: string) => [
    ...(on
      ? [
          L(
            `${p}.solve`,
            0,
            `// check: ${solve}`,
            'Check (not part of it): find a certificate by brute force,',
          ),
        ]
      : []),
    L(`${p}.map`, 0, `// known certificate: ${map}`, 'carry a known certificate across,'),
    L(`${p}.ok`, 0, `// check: ${ok}`, 'and confirm it works there.'),
  ];
  return [
    {
      op: 'toIs',
      lines: [
        L('i.sig', 0, '3SAT-TO-IS(φ)', 'Turn a formula into a graph:'),
        L('i.for', 1, 'for each clause C_j', 'For each clause,'),
        L(
          'i.tri',
          2,
          'add a vertex per literal, all joined',
          'add one vertex per literal, joined in a triangle.',
        ),
        L(
          'i.conf',
          1,
          'join x in C_i to ¬x in C_j, i ≠ j',
          'Join every literal to its opposite elsewhere.',
        ),
        L('i.k', 1, 'k = number of clauses', 'Ask for one vertex per clause.'),
        L('i.ret', 1, 'return (G, k)', 'That is the new instance.'),
        ...checks(
          'i',
          'a satisfying assignment',
          'one true literal per clause',
          'independent, size k',
        ),
      ],
    },
    {
      op: 'toVc',
      lines: [
        L('v.sig', 0, 'TO-VC(G, k)', 'Turn it into a vertex cover question:'),
        L('v.comp', 1, 'from CLIQUE: G = complement of G', 'from CLIQUE, flip every pair first;'),
        L('v.k', 1, "k' = n - k", 'ask for the vertices left over.'),
        L('v.ret', 1, "return (G, k')", 'That is the new instance.'),
        ...checks('v', 'a set S of size k', 'C = V - S', 'C touches every edge'),
      ],
    },
    {
      op: 'toClique',
      lines: [
        L('c.sig', 0, 'IS-TO-CLIQUE(G, k)', 'Turn it into a clique question:'),
        L('c.comp', 1, 'G = complement of G', 'flip every pair: joined becomes not joined;'),
        L('c.k', 1, 'k stays', 'ask for the same size.'),
        L('c.ret', 1, 'return (G, k)', 'That is the new instance.'),
        ...checks('c', 'an independent set S', 'the same S', 'every pair in S joined'),
      ],
    },
    {
      op: 'toSc',
      lines: [
        L('s.sig', 0, 'VC-TO-SC(G, k)', 'Turn it into a set cover question:'),
        L('s.U', 1, 'U = {1, ..., m}, one per edge', 'one element per edge;'),
        L('s.for', 1, 'for each vertex v', 'for each vertex,'),
        L('s.set', 2, 'S_v = edges touching v', 'a set of the edges it touches.'),
        L('s.k', 1, 'k stays', 'Ask for the same number.'),
        L('s.ret', 1, 'return (U, {S_v}, k)', 'That is the new instance.'),
        ...checks('s', 'a vertex cover C', '{S_v : v in C}', 'they cover U'),
      ],
    },
    {
      op: 'check',
      lines: [
        L('b.sig', 0, 'BRUTE-FORCE(instance)', 'Solve it the slow way:'),
        L('b.for', 1, 'for each candidate certificate', 'try every possible answer;'),
        L('b.test', 2, 'if it checks out: return yes', 'stop at one that works.'),
        L('b.no', 1, 'return no', 'If none works, the answer is no.'),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  return `The reductions map. Each arrow is a polynomial-time translation between problems. Start from the formula ${formulaText(s.inst.formula!)}: press To IND-SET to walk the first solid arrow, or load your own formula or graph.`;
}

export const initialVars = (s: S) => vars(s);

export function describe(s: S): string {
  const i = s.inst;
  const head =
    s.show === 'map' ? `Map of reductions between NP-complete problems. Current instance: ` : '';
  const w = i.witness ? ` Certificate: ${i.witness.join(' ') || 'all variables false'}.` : '';
  return `${head}${instText(i)}${i.answer ? ` Answer: ${i.answer}.` : ''}${w}`;
}
