import type { MarkRole, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { callShapeId } from '../../layouts/calls';
import { L, mark, plural } from '../_recursion/kit';

export type Problem = 'fib' | 'binom';

export interface DagSettings {
  [key: string]: Scalar;
  problem: Problem;
}

export const MAX_FIB = 8;
export const MAX_BINOM = 6;

export const defaults: DagSettings = { problem: 'fib' };

/** A subproblem: fib(n) has args [n], C(n, k) has args [n, k]. */
export type Args = number[];

export const keyOf = (a: Args) => a.join(',');

export function label(p: Problem, a: Args): string {
  return p === 'fib' ? `fib(${a[0]})` : `C(${a[0]}, ${a[1]})`;
}

export const isBase = (p: Problem, a: Args) =>
  p === 'fib' ? a[0]! <= 1 : a[1] === 0 || a[1] === a[0];

/** The two calls a subproblem makes, left first. */
export function childrenOf(p: Problem, a: Args): Args[] {
  if (isBase(p, a)) return [];
  return p === 'fib'
    ? [[a[0]! - 1], [a[0]! - 2]]
    : [
        [a[0]! - 1, a[1]! - 1],
        [a[0]! - 1, a[1]!],
      ];
}

export function valueOf(p: Problem, a: Args): number {
  const memo = new Map<string, number>();
  const go = (x: Args): number => {
    const k = keyOf(x);
    if (memo.has(k)) return memo.get(k)!;
    const kids = childrenOf(p, x);
    const v = kids.length === 0 ? (p === 'fib' ? x[0]! : 1) : go(kids[0]!) + go(kids[1]!);
    memo.set(k, v);
    return v;
  };
  return go(a);
}

/** One call in the plain recursion's tree, in call order. */
export interface TreeNode {
  id: number;
  parent: number | null;
  key: string;
  args: Args;
  /** Which time this subproblem is called: 1 for the first. */
  occurrence: number;
  returns: number;
}

/** One subproblem in the DAG, with where it sits: row (depth) and lattice column. */
export interface DagNode {
  key: string;
  args: Args;
  row: number;
  col: number;
  returns: number;
  children: string[];
}

export interface DagRun {
  problem: Problem;
  args: Args;
  outcome: 'running' | 'done';
  value: number | null;
}

export interface DagState {
  tree: TreeNode[];
  dag: DagNode[];
  /** Tree calls made so far: on the stack (open) or finished (done). */
  status: Record<number, 'open' | 'done'>;
  stack: number[];
  /** Values returned so far, by tree call. */
  result: Record<number, number>;
  /** How many tree calls have reached each subproblem so far. */
  seen: Record<string, number>;
  /** DAG edges walked so far ("from>to"), each a call the memoized version also makes. */
  edges: string[];
  run: DagRun | null;
}

type S = DagState;
type Op = OpSpec<S, DagSettings, undefined>;
type DagStep = Step<S, undefined>;

export function init(): S {
  return { tree: [], dag: [], status: {}, stack: [], result: {}, seen: {}, edges: [], run: null };
}

export const edgeKey = (from: string, to: string) => `${from}>${to}`;

/** Read "5" (fib) or "5 2" (C(n, k)) for a problem, or explain what is wrong. */
export function readArgs(p: Problem, raw: Value | undefined): Args | string {
  const words = String(raw ?? '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  const nums = words.map((w) => (/^\d+$/.test(w) ? Number(w) : NaN));
  if (p === 'fib') {
    if (nums.length !== 1 || !(nums[0]! <= MAX_FIB))
      return `fib needs one whole number n from 0 to ${MAX_FIB}.`;
    return [nums[0]!];
  }
  if (nums.length !== 2 || nums.some((x) => Number.isNaN(x)))
    return 'C(n, k) needs two whole numbers, n and k, such as 5 2.';
  const [n, k] = nums as [number, number];
  if (n > MAX_BINOM) return `Keep n to ${MAX_BINOM} or less, so the tree fits.`;
  if (k > n) return `C(${n}, ${k}) needs k between 0 and n.`;
  return [n, k];
}

/** The plain recursion's tree and the DAG of distinct subproblems. */
export function plan(p: Problem, a: Args): { tree: TreeNode[]; dag: DagNode[] } {
  const tree: TreeNode[] = [];
  const count = new Map<string, number>();
  const build = (x: Args, parent: number | null) => {
    const key = keyOf(x);
    const occurrence = (count.get(key) ?? 0) + 1;
    count.set(key, occurrence);
    const id = tree.length + 1;
    tree.push({ id, parent, key, args: x, occurrence, returns: valueOf(p, x) });
    for (const c of childrenOf(p, x)) build(c, id);
  };
  build(a, null);
  const dag: DagNode[] = [];
  const placed = new Set<string>();
  const top = a[0]!;
  const visit = (x: Args) => {
    const key = keyOf(x);
    if (placed.has(key)) return;
    placed.add(key);
    const row = top - x[0]!;
    // fib zigzags between two columns; C(n, k) sits where it would in Pascal's triangle.
    const col = p === 'fib' ? row % 2 : 2 * x[1]! - x[0]!;
    const kids = childrenOf(p, x);
    dag.push({ key, args: x, row, col, returns: valueOf(p, x), children: kids.map(keyOf) });
    kids.forEach(visit);
  };
  visit(a);
  return { tree, dag };
}

/** Calls a memoized run makes: the first call, plus one for every edge of the DAG. */
export const memoCalls = (dag: DagNode[]) => 1 + dag.reduce((n, d) => n + d.children.length, 0);

const call: Op = {
  label: 'Run',
  arity: 1,
  *run(s, [raw], { settings }) {
    const a = readArgs(settings.problem, raw);
    if (typeof a === 'string') {
      yield {
        state: s,
        marks: [],
        say: `${a} Nothing was called.`,
        lines: [],
        vars: { 'tree calls': 0 },
        level: 1,
      } satisfies DagStep;
      return s;
    }
    return yield* runDag(settings.problem, a);
  },
};

function* runDag(p: Problem, a: Args): Generator<DagStep, S, void> {
  const { tree, dag } = plan(p, a);
  const kids = new Map<number, TreeNode[]>();
  for (const t of tree)
    if (t.parent !== null) kids.set(t.parent, [...(kids.get(t.parent) ?? []), t]);
  const status: Record<number, 'open' | 'done'> = {};
  const stack: number[] = [];
  const result: Record<number, number> = {};
  const seen: Record<string, number> = {};
  const edges: string[] = [];
  const run: DagRun = { problem: p, args: a, outcome: 'running', value: null };
  let made = 0;
  const snap = (): S => ({
    tree,
    dag,
    status: { ...status },
    stack: [...stack],
    result: { ...result },
    seen: { ...seen },
    edges: [...edges],
    run: { ...run },
  });
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    ms: [string, MarkRole][] = [],
    more: Record<string, Scalar> = {},
  ): DagStep => ({
    state: snap(),
    marks: ms.map(([id, role]) => mark(id, role)),
    say,
    lines,
    vars: {
      'tree calls': made,
      'dag nodes': Object.keys(seen).length,
      'memo calls': edges.length + (made > 0 ? 1 : 0),
      ...more,
    },
    level,
  });
  const name = (t: TreeNode) => label(p, t.args);

  function* visit(
    t: TreeNode,
    from: TreeNode | null,
    line: string,
  ): Generator<DagStep, number, void> {
    made++;
    status[t.id] = 'open';
    stack.push(t.id);
    const before = seen[t.key] ?? 0;
    seen[t.key] = before + 1;
    const edge = from ? edgeKey(from.key, t.key) : null;
    const newEdge = edge !== null && !edges.includes(edge);
    if (edge && newEdge) edges.push(edge);
    const node = callShapeId(String(t.id));
    const dagNode = `dag-${t.key}`;
    let say: string;
    if (!from) {
      say = `main calls ${name(t)}. It is the top of the tree, and the first box of the DAG.`;
    } else if (before === 0) {
      say = `${name(from)} calls ${name(t)}: a new subproblem. The tree gets a box, and so does the DAG.`;
    } else if (newEdge) {
      say = `${name(from)} calls ${name(t)}, which the DAG already has. The tree draws it again (call ${before + 1} of it); the DAG only adds an arrow to the box it has.`;
    } else {
      say = `${name(from)} calls ${name(t)} again: call ${before + 1} of it. The DAG has this box and this arrow already, so with a memo this call would never happen.`;
    }
    yield step(say, [line], before > 0 && !isBase(p, t.args) ? 1 : 2, [
      [node, 'active'],
      [dagNode, 'active'],
      ...(edge ? ([[`dagedge-${edge}`, 'active']] as [string, MarkRole][]) : []),
    ]);
    const children = kids.get(t.id) ?? [];
    let value: number;
    if (children.length === 0) {
      value = p === 'fib' ? t.args[0]! : 1;
    } else {
      const x = yield* visit(children[0]!, t, 'x');
      const y = yield* visit(children[1]!, t, 'y');
      value = x + y;
    }
    result[t.id] = value;
    stack.pop();
    status[t.id] = 'done';
    yield step(
      children.length === 0
        ? `${name(t)} is a base case: it returns ${value}.`
        : `${name(t)} returns ${value}.`,
      [children.length === 0 ? 'ret' : 'ret2'],
      3,
      [
        [node, 'found'],
        [dagNode, 'found'],
      ],
      { returned: value },
    );
    return value;
  }

  const value = yield* visit(tree[0]!, null, 'sig');
  run.outcome = 'done';
  run.value = value;
  const memo = memoCalls(dag);
  yield step(
    `${label(p, a)} = ${value}. The tree made ${plural(tree.length, 'call')}. The DAG has ${plural(dag.length, 'subproblem')} and ${plural(memo - 1, 'arrow')}, so with a memo the same recursion makes ${memo}.`,
    [],
    1,
    [],
    { result: value },
  );
  return snap();
}

export const ops = { call };

export function pseudocode(s: DagSettings): PseudoBlock[] {
  if (s.problem === 'binom') {
    return [
      {
        op: 'call',
        lines: [
          L('sig', 0, 'C(n, k)', 'To count the ways to choose k of n things:'),
          L('base', 1, 'if k == 0 or k == n', 'If you take none of them, or all of them,'),
          L('ret', 2, 'return 1', 'there is exactly one way.'),
          L('x', 1, 'x = C(n - 1, k - 1)', 'Count the ways that take the last thing,'),
          L('y', 1, 'y = C(n - 1, k)', 'and the ways that leave it.'),
          L('ret2', 1, 'return x + y', 'The answer is their sum.'),
        ],
      },
    ];
  }
  return [
    {
      op: 'call',
      lines: [
        L('sig', 0, 'fib(n)', 'To find the nth Fibonacci number:'),
        L('base', 1, 'if n <= 1', 'If n is 0 or 1,'),
        L('ret', 2, 'return n', 'the answer is n.'),
        L('x', 1, 'x = fib(n - 1)', 'Find the one before it,'),
        L('y', 1, 'y = fib(n - 2)', 'and the one before that.'),
        L('ret2', 1, 'return x + y', 'The answer is their sum.'),
      ],
    },
  ];
}

export function initialSay(_state: S, s: DagSettings): string {
  return s.problem === 'binom'
    ? 'Type n and k, such as 5 2, and press Run. The tree draws every call; the DAG draws every subproblem once.'
    : 'Type n and press Run. The tree draws every call; the DAG draws every subproblem once.';
}

export function initialVars(): Record<string, Scalar> {
  return { 'tree calls': 0 };
}

export function describe(state: S): string {
  const run = state.run;
  if (!run) return 'No calls yet.';
  const made = Object.keys(state.status).length;
  const nodes = Object.keys(state.seen).length;
  const what = label(run.problem, run.args);
  if (run.outcome === 'running')
    return `${what}: ${plural(made, 'call')} in the tree so far, ${plural(nodes, 'subproblem')} in the DAG.`;
  return `${what} = ${run.value}: ${plural(made, 'call')} in the tree, ${plural(nodes, 'subproblem')} in the DAG.`;
}
