/**
 * 2-SAT: is there a true/false value for every variable that makes each clause (a ∨ b) true?
 *
 * The run:
 *   1. Build the implication graph. A clause (a ∨ b) says "if not a then b" and "if not b
 *      then a": arcs ¬a → b and ¬b → a. Each variable x gives two vertices, x and ¬x.
 *   2. Find the strongly connected components, with Kosaraju's two searches (the default, as
 *      in CLRS) or Tarjan's one search (setting `algorithm`). This is the scc page's
 *      algorithm, rewritten here for literals instead of importing that page's code.
 *   3. If x and ¬x share a component, each implies the other: the formula is unsatisfiable.
 *   4. Otherwise set x = TRUE exactly when x's component comes after ¬x's in topological order
 *      of the component graph (equivalently: walk the components in reverse topological order
 *      and make every literal in them true when its variable is still unset).
 *
 * Literals are numbered 2i (x_i) and 2i + 1 (¬x_i), with the variables in name order; every
 * loop and neighbour list goes in that order, so the code tabs agree with the model.
 */
import type { Rng } from '../../engine/rng';
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { edgeId, vertexId } from '../../layouts/graph';
import { compareNames, listWords, plural } from '../_graph/graph';

export type Algorithm = 'kosaraju' | 'tarjan';
export type Layout = 'pairs' | 'circle' | 'force';

export interface SatSettings {
  [key: string]: Scalar;
  algorithm: Algorithm;
  layout: Layout;
}

export const defaults: SatSettings = { algorithm: 'kosaraju', layout: 'pairs' };

/** A literal: variable index and sign. */
export interface Lit {
  v: number;
  neg: boolean;
}

export interface SatState {
  vars: string[];
  clauses: [Lit, Lit][];
}

export const MAX_VARS = 8;
export const MAX_CLAUSES = 16;
export const NOT = '¬';

export const START_TEXT = 'a | !b, b | c, !a | !c, c | d, !d | !b';

const NAME = /^[A-Za-z0-9_]{1,3}$/;

/** Read "a | !b, b | c": clauses split by , ; & or ∧, literals by | ∨ or +; ! ~ - ¬ negate. */
export function parseFormula(raw: string): SatState | Error {
  const text = raw.trim();
  if (!text) return new Error('Type clauses such as a | !b, b | c.');
  const parts = text
    .split(/[,;&∧]+/)
    .map((c) => c.trim())
    .filter((c) => c !== '');
  if (parts.length > MAX_CLAUSES) return new Error(`Keep it to ${MAX_CLAUSES} clauses.`);
  const raws: { name: string; neg: boolean }[][] = [];
  for (const part of parts) {
    const body = part.replace(/^\(+|\)+$/g, '').trim();
    const lits = body
      .split(/\|\||[|∨+]/)
      .map((l) => l.trim())
      .filter((l) => l !== '');
    if (lits.length === 0) return new Error(`"${part.slice(0, 12)}" has no literals.`);
    if (lits.length > 2)
      return new Error(`"${part.slice(0, 16)}" has ${lits.length} literals; 2-SAT allows two.`);
    const clause: { name: string; neg: boolean }[] = [];
    for (const l of lits) {
      const m = /^([!~¬-]*)\s*(.*)$/.exec(l)!;
      const name = m[2]!;
      if (!NAME.test(name))
        return new Error(
          `"${l.slice(0, 8)}" is not a literal. Use names of up to 3 letters or digits, with ! for not.`,
        );
      clause.push({ name, neg: m[1]!.length % 2 === 1 });
    }
    raws.push(clause);
  }
  const vars = [...new Set(raws.flat().map((l) => l.name))].sort(compareNames);
  if (vars.length > MAX_VARS) return new Error(`Keep it to ${MAX_VARS} variables.`);
  const index = new Map(vars.map((v, i) => [v, i]));
  const clauses = raws.map((c) => {
    const lits = c.map((l) => ({ v: index.get(l.name)!, neg: l.neg }));
    return [lits[0]!, lits[1] ?? lits[0]!] as [Lit, Lit];
  });
  return { vars, clauses };
}

// Random formulas, for presets and practice.

export const VARS = 'abcdefgh';
const lit = (rng: Rng, n: number) => `${rng.int(0, 1) ? '!' : ''}${VARS[rng.int(0, n - 1)]}`;

/** A random formula with about 1.5 clauses per variable: usually satisfiable, not always. */
export function randomFormula(rng: Rng, n: number, ratio = 1.5): string {
  const m = Math.max(1, Math.min(16, Math.round(n * ratio)));
  return Array.from({ length: m }, () => `${lit(rng, n)} | ${lit(rng, n)}`).join(', ');
}

export const START_STATE = parseFormula(START_TEXT) as SatState;

export function init(): SatState {
  return {
    vars: [...START_STATE.vars],
    clauses: START_STATE.clauses.map((c) => [...c]) as [Lit, Lit][],
  };
}

// ---------------------------------------------------------------------------------------------
// Literals

export const litIndex = (l: Lit) => 2 * l.v + (l.neg ? 1 : 0);
export const litName = (s: SatState, k: number) => `${k % 2 ? NOT : ''}${s.vars[k >> 1]}`;
/** Literal names in index order: a, ¬a, b, ¬b, ... */
export const literals = (s: SatState) =>
  Array.from({ length: 2 * s.vars.length }, (_, k) => litName(s, k));

export function clauseText(s: SatState, [a, b]: [Lit, Lit]): string {
  const x = litName(s, litIndex(a));
  const y = litName(s, litIndex(b));
  return x === y ? x : `${x} ∨ ${y}`;
}

export const formulaText = (s: SatState) =>
  s.clauses.map((c) => `(${clauseText(s, c)})`).join(' ∧ ');

/** Text the load box (and the code tabs) can read back: "a | !b, b | c". */
export const formatFormula = (s: SatState) =>
  s.clauses
    .map(([a, b]) => {
      const t = (l: Lit) => `${l.neg ? '!' : ''}${s.vars[l.v]}`;
      return litIndex(a) === litIndex(b) ? t(a) : `${t(a)} | ${t(b)}`;
    })
    .join(', ');

/** The implication arcs in the order the run adds them, without repeats. */
export function implications(s: SatState): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const [a, b] of s.clauses) {
    const A = litIndex(a);
    const B = litIndex(b);
    for (const [x, y] of [
      [A ^ 1, B],
      [B ^ 1, A],
    ] as [number, number][]) {
      const k = `${x},${y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push([x, y]);
    }
  }
  return out;
}

/** Out-neighbours by index, ascending. */
function adjacencyOf(n: number, arcs: [number, number][]): number[][] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [x, y] of arcs) adj[x]!.push(y);
  for (const a of adj) a.sort((p, q) => p - q);
  return adj;
}

// ---------------------------------------------------------------------------------------------
// The run

export type Phase = 'build' | 'first' | 'transpose' | 'second' | 'tarjan' | 'check' | 'done';

export interface SatRun {
  algorithm: Algorithm;
  phase: Phase;
  /** Arcs built so far, as literal index pairs. */
  arcs: [number, number][];
  /** The clause being turned into arcs. */
  clause: number | null;
  color: ('white' | 'gray' | 'black')[];
  d: (number | null)[];
  f: (number | null)[];
  low: (number | null)[];
  time: number;
  finished: number[];
  stack: number[];
  comp: (number | null)[];
  /** Components in the order found, each as literal indices in index order. */
  comps: number[][];
  /** Tree arcs of the current search, as "x,y" in the graph being searched. */
  tree: Record<string, true>;
  u: number | null;
  w: number | null;
  /** Each variable's value once assigned. */
  value: (boolean | null)[];
  /** The variable being checked or assigned. */
  at: number | null;
  conflict: number | null;
  sat: boolean | null;
  checks: number;
}

export interface SatExtra {
  run?: SatRun;
}

type S = SatState;
type X = SatExtra;
type Op = OpSpec<S, SatSettings, X>;
type SatStep = Step<S, X>;

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/** Shape ids (see view.ts). */
export const litVx = (s: S, k: number) => vertexId(litName(s, k));
export const arcId = (s: S, x: number, y: number) => edgeId(`${litName(s, x)}-${litName(s, y)}`);
export const clauseId = (k: number) => `cl-${k}`;
export const compId = (k: number) => `scc-${k}`;
export const valueId = (s: S, v: number) => `as-val-${s.vars[v]}`;

/** Position of component k in topological order of the component graph (0 first). */
export const topoRank = (r: SatRun, k: number) =>
  r.algorithm === 'kosaraju' ? k : r.comps.length - 1 - k;

export const braces = (c: string[]) => (c.length === 1 ? `{ ${c[0]} }` : `{${c.join(', ')}}`);

function clone(r: SatRun): SatRun {
  return {
    ...r,
    arcs: r.arcs.map((a) => [...a] as [number, number]),
    color: [...r.color],
    d: [...r.d],
    f: [...r.f],
    low: [...r.low],
    finished: [...r.finished],
    stack: [...r.stack],
    comp: [...r.comp],
    comps: r.comps.map((c) => [...c]),
    tree: { ...r.tree },
    value: [...r.value],
  };
}

function runVars(s: S, r: SatRun): Record<string, Scalar> {
  return {
    variables: s.vars.length,
    clauses: s.clauses.length,
    arcs: r.arcs.length,
    u: r.u === null ? '–' : litName(s, r.u),
    w: r.w === null ? '–' : litName(s, r.w),
    time: r.time,
    SCCs: r.comps.length,
    checks: r.checks,
  };
}

type StepFn = (say: string, lines: string[], level: 1 | 2 | 3, marks?: Mark[]) => SatStep;

function* kosaraju(s: S, r: SatRun, adj: number[][], step: StepFn): Generator<SatStep, void, void> {
  const n = adj.length;
  const name = (k: number) => litName(s, k);
  const visit1 = function* (u: number): Generator<SatStep, void, void> {
    r.time++;
    r.d[u] = r.time;
    r.color[u] = 'gray';
    r.u = u;
    r.w = null;
    yield step(`Visit ${name(u)}: d = ${r.time}.`, ['k.visit'], 3, [mark(litVx(s, u), 'active')]);
    for (const w of adj[u]!) {
      r.checks++;
      if (r.color[w] !== 'white') continue;
      r.tree[`${u},${w}`] = true;
      r.u = u;
      r.w = w;
      yield step(
        `${name(u)} → ${name(w)}: ${name(w)} is new, so explore it.`,
        ['k.visit', 'k.edge'],
        3,
        [mark(litVx(s, u), 'active'), mark(arcId(s, u, w), 'active')],
      );
      yield* visit1(w);
    }
    r.time++;
    r.f[u] = r.time;
    r.color[u] = 'black';
    r.finished.push(u);
    r.u = u;
    r.w = null;
    yield step(
      `${name(u)} finishes: f = ${r.time}. It goes on top of the finished stack.`,
      ['k.finish'],
      2,
      [mark(litVx(s, u), 'done'), mark(`F-${u}`, 'new')],
    );
  };
  r.phase = 'first';
  yield step(
    `Kosaraju's algorithm, pass 1: run DFS on the implication graph and record when each literal finishes.`,
    ['k.p1'],
    2,
  );
  for (let x = 0; x < n; x++) if (r.color[x] === 'white') yield* visit1(x);
  r.u = null;
  r.w = null;
  r.phase = 'transpose';
  r.tree = {};
  yield step(
    `Pass 1 is done, and ${name(r.finished.at(-1)!)} finished last. Reverse every arc. Components stay the same, but the arcs between them now point the other way.`,
    ['k.tr'],
    2,
  );
  r.phase = 'second';
  const radj: number[][] = Array.from({ length: n }, () => []);
  for (let x = 0; x < n; x++) for (const y of adj[x]!) radj[y]!.push(x);
  for (let x = 0; x < n; x++) r.color[x] = 'white';
  const visit2 = function* (u: number, k: number): Generator<SatStep, void, void> {
    r.color[u] = 'gray';
    r.comp[u] = k;
    r.comps[k]!.push(u);
    r.comps[k]!.sort((a, b) => a - b);
    r.u = u;
    r.w = null;
    yield step(
      `Visit ${name(u)} in the reversed graph: it joins component ${k + 1}.`,
      ['k.p2'],
      3,
      [mark(litVx(s, u), 'active')],
    );
    for (const w of radj[u]!) {
      r.checks++;
      if (r.color[w] !== 'white') continue;
      r.tree[`${w},${u}`] = true;
      yield* visit2(w, k);
    }
    r.color[u] = 'black';
  };
  const byF = Array.from({ length: n }, (_, x) => x).sort((a, b) => r.f[b]! - r.f[a]!);
  for (const x of byF) {
    if (r.color[x] !== 'white') continue;
    const k = r.comps.length;
    r.comps.push([]);
    yield* visit2(x, k);
    r.u = null;
    r.w = null;
    yield step(
      `Start pass 2 at ${name(x)}, the latest finisher left. Its search in the reversed graph finds component ${k + 1}: ${braces(r.comps[k]!.map(name))}.`,
      ['k.p2', 'k.comp'],
      2,
      [...r.comps[k]!.map((y) => mark(litVx(s, y), 'found')), mark(compId(k), 'new')],
    );
  }
}

function* tarjan(s: S, r: SatRun, adj: number[][], step: StepFn): Generator<SatStep, void, void> {
  const n = adj.length;
  const name = (k: number) => litName(s, k);
  const on = new Set<number>();
  r.phase = 'tarjan';
  const connect = function* (u: number): Generator<SatStep, void, void> {
    r.time++;
    r.d[u] = r.low[u] = r.time;
    r.stack.push(u);
    on.add(u);
    r.u = u;
    r.w = null;
    yield step(`Visit ${name(u)}: d = low = ${r.time}. Push it on the stack.`, ['t.visit'], 3, [
      mark(litVx(s, u), 'active'),
      mark(`S-${u}`, 'new'),
    ]);
    for (const w of adj[u]!) {
      r.checks++;
      if (r.d[w] === null) {
        r.tree[`${u},${w}`] = true;
        yield* connect(w);
        r.low[u] = Math.min(r.low[u]!, r.low[w]!);
      } else if (on.has(w)) {
        r.low[u] = Math.min(r.low[u]!, r.d[w]!);
      } else continue;
      r.u = u;
      r.w = w;
      yield step(
        `Back at ${name(u)} after ${name(u)} → ${name(w)}: low = ${r.low[u]}.`,
        ['t.low'],
        3,
        [mark(litVx(s, u), 'active'), mark(arcId(s, u, w), 'active')],
      );
    }
    r.u = u;
    r.w = null;
    if (r.low[u] !== r.d[u]) return;
    const k = r.comps.length;
    const c: number[] = [];
    for (;;) {
      const x = r.stack.pop()!;
      on.delete(x);
      c.push(x);
      r.comp[x] = k;
      if (x === u) break;
    }
    r.comps.push(c.sort((a, b) => a - b));
    yield step(
      `${name(u)}.low = ${name(u)}.d, so ${name(u)} roots a component. Pop the stack down to it: component ${k + 1} is ${braces(r.comps[k]!.map(name))}.`,
      ['t.root', 't.pop'],
      2,
      [...c.map((y) => mark(litVx(s, y), 'found')), mark(compId(k), 'new')],
    );
  };
  yield step(
    `Tarjan's algorithm: one DFS with an index d and a low-link for each literal, and a stack.`,
    ['t.sig'],
    2,
  );
  for (let x = 0; x < n; x++) if (r.d[x] === null) yield* connect(x);
  r.u = null;
  r.w = null;
}

const run: Op = {
  label: 'Solve',
  arity: 0,
  *run(s, _args, { settings }) {
    const n = 2 * s.vars.length;
    const name = (k: number) => litName(s, k);
    const r: SatRun = {
      algorithm: settings.algorithm,
      phase: 'build',
      arcs: [],
      clause: null,
      color: Array(n).fill('white'),
      d: Array(n).fill(null),
      f: Array(n).fill(null),
      low: Array(n).fill(null),
      time: 0,
      finished: [],
      stack: [],
      comp: Array(n).fill(null),
      comps: [],
      tree: {},
      u: null,
      w: null,
      value: Array(s.vars.length).fill(null),
      at: null,
      conflict: null,
      sat: null,
      checks: 0,
    };
    const step: StepFn = (say, lines, level, marks = []) => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(s, r),
      extra: { run: clone(r) },
    });
    // ----- 1. The implication graph.
    yield step(
      `${plural(s.clauses.length, 'clause')} over ${plural(s.vars.length, 'variable')}. Each variable x gets two vertices, x and ${NOT}x. Each clause a ∨ b becomes two implications: if a is false, b must be true, and if b is false, a must be.`,
      ['sig', 'build'],
      2,
    );
    const seen = new Set<string>();
    for (let k = 0; k < s.clauses.length; k++) {
      const c = s.clauses[k]!;
      r.clause = k;
      const A = litIndex(c[0]);
      const B = litIndex(c[1]);
      const added: [number, number][] = [];
      for (const [x, y] of [
        [A ^ 1, B],
        [B ^ 1, A],
      ] as [number, number][]) {
        const key = `${x},${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        r.arcs.push([x, y]);
        added.push([x, y]);
      }
      const arcs = added.map(([x, y]) => `${name(x)} → ${name(y)}`);
      yield step(
        A === B
          ? `Clause ${k + 1}, ${name(A)}: ${name(A)} must be true. As an implication, ${name(A ^ 1)} → ${name(A)}: if ${name(A ^ 1)} held, ${name(A)} would have to as well, a contradiction.`
          : added.length === 0
            ? `Clause ${k + 1}, ${clauseText(s, c)}: its arcs are already there.`
            : `Clause ${k + 1}, ${clauseText(s, c)}: add ${listWords(arcs)}.`,
        ['for.c', 'arcs'],
        2,
        [mark(clauseId(k), 'active'), ...added.map(([x, y]) => mark(arcId(s, x, y), 'new'))],
      );
    }
    r.clause = null;
    // ----- 2. Components.
    const adj = adjacencyOf(n, r.arcs);
    if (r.algorithm === 'kosaraju') yield* kosaraju(s, r, adj, step);
    else yield* tarjan(s, r, adj, step);
    const order =
      r.algorithm === 'kosaraju'
        ? 'Kosaraju finds the components in topological order'
        : 'Tarjan finds the components in reverse topological order';
    r.phase = 'check';
    yield step(
      `${plural(r.comps.length, 'component')}. ${order}: an arc between two components always goes from an earlier one to a later one in that order.`,
      ['scc'],
      2,
    );
    // ----- 3. x and ¬x apart?
    for (let v = 0; v < s.vars.length; v++) {
      r.at = v;
      const x = 2 * v;
      if (r.comp[x] === r.comp[x + 1]) {
        r.conflict = v;
        r.sat = false;
        r.phase = 'done';
        yield step(
          `${name(x)} and ${name(x + 1)} are both in component ${r.comp[x]! + 1}. So ${name(x)} implies ${name(x + 1)} and ${name(x + 1)} implies ${name(x)}: whichever value ${s.vars[v]} takes, it forces the opposite. The formula is unsatisfiable.`,
          ['chk', 'unsat'],
          1,
          [mark(litVx(s, x), 'error'), mark(litVx(s, x + 1), 'error')],
        );
        return s;
      }
      yield step(
        `${name(x)} is in component ${r.comp[x]! + 1} and ${name(x + 1)} in component ${r.comp[x + 1]! + 1}: different, good.`,
        ['chk'],
        3,
        [mark(litVx(s, x), 'compare'), mark(litVx(s, x + 1), 'compare')],
      );
    }
    // ----- 4. Assign.
    for (let v = 0; v < s.vars.length; v++) {
      r.at = v;
      const x = 2 * v;
      const tx = topoRank(r, r.comp[x]!);
      const tn = topoRank(r, r.comp[x + 1]!);
      r.value[v] = tx > tn;
      const t = r.value[v] ? name(x) : name(x + 1);
      const f = r.value[v] ? name(x + 1) : name(x);
      yield step(
        `${s.vars[v]}: ${t}'s component comes later in topological order than ${f}'s (position ${Math.max(tx, tn) + 1} against ${Math.min(tx, tn) + 1}). Make ${t} true, so ${s.vars[v]} = ${r.value[v] ? 'TRUE' : 'FALSE'}. Nothing later can lead back to ${f}.`,
        ['asg', 'asg.set'],
        2,
        [mark(litVx(s, r.value[v] ? x : x + 1), 'found'), mark(valueId(s, v), 'new')],
      );
    }
    r.at = null;
    r.sat = true;
    r.phase = 'done';
    const values = s.vars.map((v, i) => `${v} = ${r.value[i] ? 'T' : 'F'}`);
    yield step(
      `Satisfiable: ${values.join(', ')}. Every clause has a true literal.`,
      ['ret'],
      1,
      s.clauses.map((_, k) => mark(clauseId(k), 'found')),
    );
    return s;
  },
};

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]: Value[]) {
    const f = parseFormula(String(arg ?? ''));
    if (f instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: `Nothing loaded. ${f.message} The formula stays as it was.`,
        lines: [],
        level: 1,
        vars: { variables: s.vars.length, clauses: s.clauses.length },
      } satisfies SatStep;
      return s;
    }
    yield {
      state: f,
      marks: [],
      say: `Loaded ${plural(f.clauses.length, 'clause')} over ${plural(f.vars.length, 'variable')}: ${formulaText(f)}. Press Solve.`,
      lines: [],
      level: 1,
      vars: { variables: f.vars.length, clauses: f.clauses.length },
    } satisfies SatStep;
    return f;
  },
};

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: SatSettings): PseudoBlock[] {
  const scc =
    settings.algorithm === 'kosaraju'
      ? [
          L('k.p1', 1, 'DFS(G): record finish times', 'Search the graph, noting finish times.'),
          L('k.visit', 2, 'visit u; explore new v', 'Explore from each new literal'),
          L('k.edge', 3, 'for u → v, v white: visit v', 'along arcs to literals not seen yet;'),
          L('k.finish', 2, 'u.f = time; push u on F', 'a literal finishes when it is done.'),
          L('k.tr', 1, 'compute G^T', 'Reverse every arc.'),
          L('k.p2', 1, 'DFS(G^T), by decreasing f', 'Search again, latest finisher first:'),
          L('k.comp', 2, 'each tree is one SCC', 'each search finds one component.'),
        ]
      : [
          L('t.sig', 1, 'TARJAN(G)', 'One search with low-links:'),
          L('t.visit', 2, 'u.d = u.low = time; push u', 'number u and put it on the stack,'),
          L('t.low', 2, 'u.low = min(u.low, ...)', 'take the smallest index u can reach;'),
          L('t.root', 2, 'if u.low == u.d', 'if u reaches nothing above it,'),
          L('t.pop', 3, 'pop down to u: one SCC', 'pop the stack down to u: one component.'),
        ];
  return [
    {
      op: 'run',
      lines: [
        L('sig', 0, '2-SAT(clauses)', 'Solve a 2-SAT formula:'),
        L('build', 1, 'G = vertices x, ¬x for each x', 'Make a vertex for every literal.'),
        L('for.c', 1, 'for each clause (a ∨ b)', 'For each clause "a or b":'),
        L('arcs', 2, 'add ¬a → b and ¬b → a', 'not a forces b, and not b forces a.'),
        L('scc', 1, 'find the SCCs of G', 'Find the strongly connected components:'),
        ...scc,
        L('chk', 1, 'for each variable x', 'For each variable x:'),
        L('unsat', 2, 'if comp(x) == comp(¬x): UNSAT', 'x and not x together: impossible.'),
        L('asg', 1, 'for each variable x', 'Then for each variable x:'),
        L('asg.set', 2, 'x = comp(x) after comp(¬x)', 'x is true if its group comes later.'),
        L('ret', 1, 'return the assignment', 'Every clause is now true.'),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  return `${plural(s.clauses.length, 'clause')} over ${plural(s.vars.length, 'variable')}: ${formulaText(s)}. Press Solve to build the implication graph and find out whether every clause can be true at once.`;
}

export function initialVars(s: S) {
  return { variables: s.vars.length, clauses: s.clauses.length };
}

export function describe(s: S): string {
  return `A 2-SAT formula with ${plural(s.vars.length, 'variable')} and ${plural(s.clauses.length, 'clause')}: ${formulaText(s)}.`;
}

export function describeRun(s: S, r: SatRun): string {
  const comps = r.comps.length
    ? ` Components: ${r.comps.map((c) => braces(c.map((k) => litName(s, k)))).join(', ')}.`
    : '';
  const verdict =
    r.sat === true
      ? ` Satisfiable: ${s.vars.map((v, i) => `${v} = ${r.value[i] ? 'TRUE' : 'FALSE'}`).join(', ')}.`
      : r.sat === false
        ? ` Unsatisfiable: ${s.vars[r.conflict!]} and its negation share a component.`
        : '';
  return `Implication graph with ${plural(r.arcs.length, 'arc')}.${comps}${verdict}`;
}

/** Does this assignment make every clause true? */
export function satisfies(s: S, value: boolean[]): boolean {
  return s.clauses.every(([a, b]) => value[a.v] !== a.neg || value[b.v] !== b.neg);
}
