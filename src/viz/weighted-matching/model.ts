/**
 * Weighted bipartite matching, the assignment problem: n rows (workers A, B, ...) and n columns
 * (jobs 1, 2, ...), a cost for every pair, and the cheapest way to give every row its own
 * column. The Hungarian algorithm (Kuhn and Munkres), in its potentials form.
 *
 * Potentials: a number u[i] for each row and v[j] for each column with u[i] + v[j] <= c[i][j]
 * everywhere. The reduced cost c[i][j] - u[i] - v[j] is never negative, and a cell with reduced
 * cost 0 is tight. A perfect matching made only of tight cells costs sum(u) + sum(v), and no
 * assignment can cost less, so it is optimal.
 *
 * The run:
 *   1. Row reduction u[i] = min of row i, column reduction v[j] = min over i of c[i][j] - u[i].
 *   2. For each row r in order (the root), grow an alternating tree: S holds rows, T columns.
 *      Scan the rows of S in the order they joined; a tight cell (i, j) with j outside T puts j
 *      in T (prev[j] = i). A free j ends the phase with an augmenting path; a matched j brings
 *      its row into S. When no tight cell leaves the tree, take
 *      delta = min reduced cost over rows in S and columns outside T, add delta to u of every
 *      row in S and subtract it from v of every column in T, and scan S again from the start.
 *   3. Augment: flip the path from the free column back to r. The matching grows by one.
 *
 * Setting `goal`: 'min' (the default) or 'max'. To maximize, the run minimizes M - c[i][j],
 * where M is the largest entry; the same assignment maximizes the original total.
 *
 * Ties go to the earlier row and then the smaller column, so the code tabs agree with the model.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';

export type Goal = 'min' | 'max';

export interface HmSettings {
  [key: string]: Scalar;
  goal: Goal;
}

export interface HmState {
  /** n x n, n from 1 to MAX_N. */
  cost: number[][];
}

export type Phase = 'start' | 'reduce' | 'search' | 'done';

/** A run's bookkeeping at one step. */
export interface HmRun {
  goal: Goal;
  phase: Phase;
  /** The matrix being minimized: cost, or M - cost when maximizing. */
  work: number[][];
  big: number;
  u: (number | null)[];
  v: (number | null)[];
  rowMate: number[];
  colMate: number[];
  /** The current tree: rows in S in the order they joined, and which columns are in T. */
  S: number[];
  T: boolean[];
  prev: number[];
  root: number | null;
  /** The row being scanned. */
  scan: number | null;
  delta: number | null;
  /** The cell where delta was found. */
  argmin: [number, number] | null;
  /** Cells of the augmenting path, from the root's cell to the free column. */
  path: [number, number][];
  updates: number;
  augmentations: number;
  /** Reduced costs looked at. */
  checks: number;
}

export interface HmExtra {
  run?: HmRun;
}

type S = HmState;
type X = HmExtra;
type Op = OpSpec<S, HmSettings, X>;
type HmStep = Step<S, X>;

export const MAX_N = 6;
export const MIN_COST = -99;
export const MAX_COST = 999;

export const defaults: HmSettings = { goal: 'min' };

/** Four workers and four jobs; the cheapest assignment costs 9, after two potential updates. */
export const START_TEXT = '4 2 6 7; 6 2 9 1; 7 8 4 1; 2 2 3 5';

export const rowName = (i: number) => String.fromCharCode(65 + i);
export const colName = (j: number) => String(j + 1);

/** Read "9 2 7; 6 4 3; 5 8 1": rows split by ; or /, entries by spaces or commas. */
export function parseMatrix(raw: string): number[][] | Error {
  const text = raw.trim();
  if (!text) return new Error('Type a square matrix, rows separated by semicolons: 4 1; 2 3.');
  const rows = text
    .split(/[;/\n]+/)
    .map((r) => r.trim())
    .filter((r) => r !== '');
  if (rows.length > MAX_N) return new Error(`Keep it to ${MAX_N} rows.`);
  const out: number[][] = [];
  for (const r of rows) {
    const cells = r.split(/[\s,]+/).filter((c) => c !== '');
    const row: number[] = [];
    for (const c of cells) {
      if (!/^-?\d+$/.test(c)) return new Error(`"${c.slice(0, 8)}" is not a whole number.`);
      const x = Number(c);
      if (x < MIN_COST || x > MAX_COST)
        return new Error(`Keep costs between ${MIN_COST} and ${MAX_COST}.`);
      row.push(x);
    }
    out.push(row);
  }
  const n = out.length;
  const bad = out.findIndex((r) => r.length !== n);
  if (bad >= 0)
    return new Error(
      `The matrix must be square: there are ${n} rows, but row ${bad + 1} has ${out[bad]!.length} entries.`,
    );
  return out;
}

export const formatMatrix = (m: number[][]) => m.map((r) => r.join(' ')).join('; ');

export const START_COST = parseMatrix(START_TEXT) as number[][];

export function init(): S {
  return { cost: START_COST.map((r) => [...r]) };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/** Shape ids (see view.ts). */
export const cellId = (i: number, j: number) => `c-${i}-${j}`;
export const uId = (i: number) => `u-${i}`;
export const vId = (j: number) => `v-${j}`;
export const rowVx = (i: number) => `vx-${rowName(i)}`;
export const colVx = (j: number) => `vx-${colName(j)}`;
export const edgeOf = (i: number, j: number) => `e-${rowName(i)}-${colName(j)}`;

export const reduced = (r: HmRun, i: number, j: number) => r.work[i]![j]! - r.u[i]! - r.v[j]!;

/** The assignment's total in the original costs. */
export const totalOf = (cost: number[][], rowMate: number[]) =>
  rowMate.reduce((s, j, i) => s + (j >= 0 ? cost[i]![j]! : 0), 0);

/** "A→2, B→1". */
export const pairsText = (rowMate: number[]) =>
  rowMate
    .map((j, i) => (j >= 0 ? `${rowName(i)}→${colName(j)}` : ''))
    .filter(Boolean)
    .join(', ');

function clone(r: HmRun): HmRun {
  return {
    ...r,
    u: [...r.u],
    v: [...r.v],
    rowMate: [...r.rowMate],
    colMate: [...r.colMate],
    S: [...r.S],
    T: [...r.T],
    prev: [...r.prev],
    argmin: r.argmin && [...r.argmin],
    path: r.path.map((p) => [...p] as [number, number]),
  };
}

function newRun(cost: number[][], goal: Goal): HmRun {
  const n = cost.length;
  const big = Math.max(...cost.flat());
  const work = goal === 'min' ? cost.map((r) => [...r]) : cost.map((r) => r.map((c) => big - c));
  return {
    goal,
    phase: 'start',
    work,
    big,
    u: Array(n).fill(null),
    v: Array(n).fill(null),
    rowMate: Array(n).fill(-1),
    colMate: Array(n).fill(-1),
    S: [],
    T: Array(n).fill(false),
    prev: Array(n).fill(-1),
    root: null,
    scan: null,
    delta: null,
    argmin: null,
    path: [],
    updates: 0,
    augmentations: 0,
    checks: 0,
  };
}

const setText = (xs: string[]) => (xs.length ? `{${xs.join(', ')}}` : 'empty');

function runVars(r: HmRun, cost: number[][]): Record<string, Scalar> {
  const n = r.work.length;
  return {
    n,
    root: r.root === null ? '–' : rowName(r.root),
    S: setText(r.S.map(rowName)),
    T: setText(r.T.flatMap((t, j) => (t ? [colName(j)] : []))),
    delta: r.delta ?? '–',
    matched: r.rowMate.filter((j) => j >= 0).length,
    augmentations: r.augmentations,
    updates: r.updates,
    checks: r.checks,
    total: totalOf(cost, r.rowMate),
  };
}

function tightCount(r: HmRun): number {
  let k = 0;
  for (let i = 0; i < r.work.length; i++)
    for (let j = 0; j < r.work.length; j++) if (reduced(r, i, j) === 0) k++;
  return k;
}

type StepFn = (say: string, lines: string[], level: 1 | 2 | 3, marks?: Mark[]) => HmStep;

function* hungarian(cost: number[][], r: HmRun, step: StepFn): Generator<HmStep, void, void> {
  const n = cost.length;
  const plain = r.goal === 'min';
  yield step(
    plain
      ? `The Hungarian algorithm on a ${n} × ${n} cost matrix: give every row (worker) its own column (job) so that the total cost is as small as possible.`
      : `To maximize, the largest entry is M = ${r.big}. Replace every entry c by M − c and find the cheapest assignment of that: it is the most valuable assignment of the original.`,
    plain ? ['sig'] : ['sig', 'max'],
    2,
  );
  // ----- Row and column reduction.
  r.phase = 'reduce';
  for (let i = 0; i < n; i++) {
    r.u[i] = Math.min(...r.work[i]!);
    r.checks += n;
    const j = r.work[i]!.indexOf(r.u[i]!);
    yield step(
      `Row ${rowName(i)}: its smallest entry is ${r.u[i]}, so u[${rowName(i)}] = ${r.u[i]}. Every row ${rowName(i)} cost is now at least u.`,
      ['rows'],
      3,
      [mark(uId(i), 'new'), mark(cellId(i, j), 'compare')],
    );
  }
  for (let j = 0; j < n; j++) r.v[j] = 0;
  yield step(
    `Row reduction: u is each row's smallest entry, and v starts at 0. Now u[i] + v[j] ≤ c[i][j] in every cell, so these potentials are feasible.`,
    ['rows'],
    2,
    Array.from({ length: n }, (_, i) => mark(uId(i), 'new')),
  );
  for (let j = 0; j < n; j++) {
    let best = Infinity;
    let at = 0;
    for (let i = 0; i < n; i++) {
      const x = r.work[i]![j]! - r.u[i]!;
      r.checks++;
      if (x < best) {
        best = x;
        at = i;
      }
    }
    r.v[j] = best;
    yield step(
      best === 0
        ? `Column ${colName(j)}: it already has a tight cell, at row ${rowName(at)}, so v[${colName(j)}] stays 0.`
        : `Column ${colName(j)}: its smallest reduced cost is ${best}, at row ${rowName(at)}, so v[${colName(j)}] = ${best}.`,
      ['cols'],
      3,
      [mark(vId(j), best === 0 ? 'compare' : 'new'), mark(cellId(at, j), 'compare')],
    );
  }
  yield step(
    `Column reduction done. A cell is tight when c[i][j] = u[i] + v[j], so its reduced cost is 0. There are ${tightCount(r)} tight cells. We may only match along tight cells.`,
    ['cols'],
    2,
  );
  // ----- One phase per row.
  r.phase = 'search';
  for (let root = 0; root < n; root++) {
    r.root = root;
    r.S = [root];
    r.T = Array(n).fill(false);
    r.prev = Array(n).fill(-1);
    r.delta = null;
    r.argmin = null;
    r.path = [];
    r.scan = null;
    yield step(
      `Phase ${root + 1}: row ${rowName(root)} has no column yet. Grow an alternating tree from it: S = { ${rowName(root)} }, T = { }.`,
      ['phase', 'tree'],
      2,
      [mark(rowVx(root), 'active')],
    );
    let free = -1;
    while (free < 0) {
      for (let q = 0; q < r.S.length && free < 0; q++) {
        const i = r.S[q]!;
        r.scan = i;
        const found: number[] = [];
        for (let j = 0; j < n && free < 0; j++) {
          if (r.T[j]) continue;
          r.checks++;
          if (reduced(r, i, j) !== 0) continue;
          r.T[j] = true;
          r.prev[j] = i;
          found.push(j);
          if (r.colMate[j]! < 0) {
            free = j;
            yield step(
              `Cell ${rowName(i)},${colName(j)} is tight and column ${colName(j)} is free. That is an augmenting path.`,
              ['scan', 'tight', 'free'],
              2,
              [
                mark(cellId(i, j), 'active'),
                mark(colVx(j), 'active'),
                mark(edgeOf(i, j), 'active'),
              ],
            );
          } else {
            const m = r.colMate[j]!;
            r.S.push(m);
            yield step(
              `Cell ${rowName(i)},${colName(j)} is tight, but column ${colName(j)} is matched to row ${rowName(m)}. Put ${colName(j)} in T and ${rowName(m)} in S: the tree grows by a matched edge.`,
              ['scan', 'tight', 'grow'],
              2,
              [mark(cellId(i, j), 'visit'), mark(colVx(j), 'visit'), mark(rowVx(m), 'visit')],
            );
          }
        }
        if (free < 0 && found.length === 0) {
          yield step(`Row ${rowName(i)} has no tight cell to a column outside T.`, ['scan'], 3, [
            mark(rowVx(i), 'compare'),
          ]);
        }
      }
      r.scan = null;
      if (free >= 0) break;
      // ----- No tight cell leaves the tree: change the potentials.
      let delta = Infinity;
      let arg: [number, number] = [0, 0];
      for (const i of r.S)
        for (let j = 0; j < n; j++) {
          if (r.T[j]) continue;
          r.checks++;
          const x = reduced(r, i, j);
          if (x < delta) {
            delta = x;
            arg = [i, j];
          }
        }
      r.delta = delta;
      r.argmin = arg;
      const rows = r.S.map(rowName);
      const cols = r.T.flatMap((t, j) => (t ? [colName(j)] : []));
      yield step(
        `No tight cell leads out of the tree. The smallest reduced cost from a row in S to a column outside T is δ = ${delta}, at ${rowName(arg[0])},${colName(arg[1])}.`,
        ['stuck', 'delta'],
        2,
        [mark(cellId(arg[0], arg[1]), 'compare')],
      );
      for (const i of r.S) r.u[i]! += delta;
      for (let j = 0; j < n; j++) if (r.T[j]) r.v[j]! -= delta;
      r.updates++;
      yield step(
        `Add δ = ${delta} to u of the rows in S (${rows.join(', ')})${cols.length ? ` and subtract it from v of the columns in T (${cols.join(', ')})` : ''}. Cells inside the tree stay tight, every cell stays feasible, and ${rowName(arg[0])},${colName(arg[1])} becomes tight.`,
        ['upd.u', 'upd.v'],
        2,
        [
          ...r.S.map((i) => mark(uId(i), 'new')),
          ...cols.map((c) => mark(vId(Number(c) - 1), 'new')),
          mark(cellId(arg[0], arg[1]), 'visit'),
        ],
      );
      r.delta = null;
      r.argmin = null;
    }
    // ----- Augment along prev.
    const path: [number, number][] = [];
    for (let j = free; j >= 0;) {
      const i = r.prev[j]!;
      path.push([i, j]);
      j = r.rowMate[i]!;
      if (j >= 0) path.push([i, j]);
    }
    path.reverse();
    r.path = path;
    const route = path.map(([i, j], k) =>
      k % 2 === 0 ? `${rowName(i)}–${colName(j)}` : `${colName(j)}–${rowName(i)}`,
    );
    yield step(
      path.length === 1
        ? `The path is one tight cell, ${route[0]}. Match it.`
        : `The augmenting path from ${rowName(root)} alternates unmatched and matched tight cells: ${route.join(', ')}. Flip it: unmatched cells join the matching and matched ones leave.`,
      ['aug'],
      2,
      path.flatMap(([i, j]) => [mark(cellId(i, j), 'active'), mark(edgeOf(i, j), 'active')]),
    );
    for (let j = free; j >= 0;) {
      const i = r.prev[j]!;
      const next = r.rowMate[i]!;
      r.rowMate[i] = j;
      r.colMate[j] = i;
      j = next;
    }
    r.augmentations++;
    const k = r.rowMate.filter((j) => j >= 0).length;
    yield step(
      `The matching now has ${k} of ${n} pairs: ${pairsText(r.rowMate)}.`,
      ['aug'],
      2,
      path
        .filter(([i, j]) => r.rowMate[i] === j)
        .flatMap(([i, j]) => [mark(cellId(i, j), 'found')]),
    );
    r.S = [];
    r.T = Array(n).fill(false);
    r.path = [];
  }
  r.root = null;
}

const run: Op = {
  label: 'Find the best assignment',
  arity: 0,
  *run(s, _args, { settings }) {
    const cost = s.cost;
    const n = cost.length;
    const r = newRun(cost, settings.goal);
    const step: StepFn = (say, lines, level, marks = []) => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(r, cost),
      extra: { run: clone(r) },
    });
    yield* hungarian(cost, r, step);
    r.phase = 'done';
    const total = totalOf(cost, r.rowMate);
    const dual = r.u.reduce<number>((a, x) => a + x!, 0) + r.v.reduce<number>((a, x) => a + x!, 0);
    const check =
      r.goal === 'min'
        ? `And sum(u) + sum(v) = ${dual} too: no assignment can cost less, so this one is optimal.`
        : `In M − c it costs ${dual} = sum(u) + sum(v), the least possible, so ${n} × ${r.big} − ${dual} = ${total} is the most the original can be worth.`;
    yield step(
      `Done after ${r.updates === 1 ? '1 potential update' : `${r.updates} potential updates`}: ${pairsText(r.rowMate)}, total ${r.goal === 'min' ? 'cost' : 'value'} ${total}. ${check}`,
      ['ret'],
      1,
      r.rowMate.map((j, i) => mark(cellId(i, j), 'found')),
    );
    return s;
  },
};

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]: Value[]) {
    const m = parseMatrix(String(arg ?? ''));
    if (m instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: `Nothing loaded. ${m.message} The matrix stays as it was.`,
        lines: [],
        level: 1,
        vars: { n: s.cost.length },
      } satisfies HmStep;
      return s;
    }
    const next: S = { cost: m };
    const n = m.length;
    yield {
      state: next,
      marks: [],
      say: `Loaded a ${n} × ${n} cost matrix: ${n === 1 ? `row ${rowName(0)}, column 1` : `rows ${rowName(0)} to ${rowName(n - 1)}, columns 1 to ${n}`}. Press Find the best assignment.`,
      lines: [],
      level: 1,
      vars: { n },
    } satisfies HmStep;
    return next;
  },
};

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode. Lines stay short for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: HmSettings): PseudoBlock[] {
  return [
    {
      op: 'run',
      lines: [
        L('sig', 0, 'HUNGARIAN(c)', 'Find the cheapest assignment:'),
        ...(settings.goal === 'max'
          ? [L('max', 1, 'c[i][j] = M - c[i][j]', 'To maximize, flip every value.')]
          : []),
        L('rows', 1, 'u[i] = min_j c[i][j]; v[j] = 0', 'Each row starts at its smallest cost.'),
        L('cols', 1, 'v[j] = min_i (c[i][j] - u[i])', 'Each column takes what is left.'),
        L('phase', 1, 'for each row r', 'Give each row a column in turn:'),
        L('tree', 2, 'S = {r}; T = {}', 'start a tree at that row.'),
        L('scan', 2, 'for i in S, j not in T', 'Look along the rows in the tree:'),
        L('tight', 3, 'if c[i][j] == u[i] + v[j]', 'if a cell is tight,'),
        L('free', 4, 'if j is free: augment', 'and its column is free, we have a path;'),
        L('grow', 4, 'else T += j; S += mate(j)', 'else add the column and its row.'),
        L('stuck', 2, 'if no tight cell leaves S', 'If the tree is stuck,'),
        L('delta', 3, 'δ = min c[i][j]-u[i]-v[j]', 'find the smallest slack out of it,'),
        L('upd.u', 3, 'u[i] += δ for i in S', 'raise the rows in the tree,'),
        L('upd.v', 3, 'v[j] -= δ for j in T', 'lower the columns in the tree.'),
        L('aug', 2, 'flip the path from r', 'Swap matched and unmatched on the path.'),
        L('ret', 1, 'return the matching', 'Every row now has its own column.'),
      ],
    },
  ];
}

export function initialSay(s: S, settings: HmSettings): string {
  const n = s.cost.length;
  return `A ${n} × ${n} cost matrix: row i is a worker, column j a job, and c[i][j] what it costs. Press Find the best assignment to give each worker one job at the ${settings.goal === 'min' ? 'lowest total cost' : 'highest total value'}.`;
}

export function initialVars(s: S) {
  return { n: s.cost.length };
}

export function describe(s: S): string {
  const n = s.cost.length;
  return `A ${n} by ${n} cost matrix. ${s.cost.map((r, i) => `Row ${rowName(i)}: ${r.join(', ')}.`).join(' ')}`;
}

export function describeRun(r: HmRun): string {
  const u = r.u.some((x) => x !== null)
    ? ` u: ${r.u.map((x, i) => `${rowName(i)} ${x ?? '–'}`).join(', ')}. v: ${r.v.map((x, j) => `${colName(j)} ${x ?? '–'}`).join(', ')}.`
    : '';
  const m = pairsText(r.rowMate);
  return `Hungarian algorithm${r.phase === 'done' ? ', done' : ''}. Matched: ${m || 'none yet'}.${u}`;
}
