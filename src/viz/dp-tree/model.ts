/**
 * DP on trees: the best total of chosen nodes in a binary tree when no chosen node is the parent
 * of another chosen node (an org chart where nobody comes with their direct boss).
 *
 * - The pattern keeps two values per node, computed from the leaves up in a post-order walk:
 *   take(v), the best total in v's subtree with v chosen, and skip(v), the best with v left out.
 *   take(v) = value(v) + skip(left) + skip(right), since v's children must stay out;
 *   skip(v) = max(take, skip of left) + max(take, skip of right), since each child is free.
 *   The answer is max(take(root), skip(root)): n calls, O(n).
 * - The naive approach tries every allowed subset by plain recursion: it decides the nodes one at
 *   a time in level order, leaving each out or (when its parent is not taken) taking it, and
 *   scores every complete choice. Its calls grow exponentially: a chain of n nodes already has
 *   Fibonacci-many allowed subsets.
 *
 * Both report the same nodes. The read-back takes a node when its parent is out and take > skip
 * (a tie leaves it out); the recursion, trying "out" first and keeping only strictly better
 * totals, keeps the first best subset in level order, which is the same one.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: one counter, calls (one call of the
 * recursion). The pattern makes one call per node; the naive approach one per partial choice.
 *
 * Nodes are numbered 0..n − 1 in level order (their uid) and named A, B, C, ... in that order.
 * The state keeps the tree, the two values per node once computed, and the answer once solved,
 * so the picture keeps them after the operation (as the knapsack table stays filled).
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
import { andList, plural } from '../_dp/kit';
import { approachOf, Work, workVars, type Approach, type Totals } from '../_patterns/kit';
import { formatLevelOrder, parseLevelOrder, type Token } from '../binary-tree/model';

export const MAX_NODES = 10;
export const MAX_VALUE = 99;
const NAMES = 'ABCDEFGHIJ';

export interface TNode {
  uid: number;
  name: string;
  value: number;
  left: number | null;
  right: number | null;
  parent: number | null;
}

/** take(v), skip(v). */
export type Pair = readonly [take: number, skip: number];

export interface TreeState {
  /** In level order: nodes[u].uid === u, the root is 0. */
  nodes: TNode[];
  /** The two values of each node, once the pattern has computed them. */
  memo: (Pair | null)[];
  /** The best total, once solved. */
  best: number | null;
  /** The chosen nodes (uids, in level order), once solved. */
  chosen: number[] | null;
}

export interface TreeSettings {
  [key: string]: Scalar;
  approach: Approach;
}

export const defaults: TreeSettings = { approach: 'pattern' };

export interface TreeExtra {
  approach: Approach;
  /** The pattern: the node whose call is running, and the calls waiting on the stack. */
  at?: number;
  stack?: number[];
  /** The naive approach: each node in, out, or not decided yet (null). */
  now?: (boolean | null)[];
  total?: number;
  /** The naive approach: the best subset so far and its total. */
  bestSet?: boolean[] | null;
  bestTotal?: number | null;
}

export type TreeStep = Step<TreeState, TreeExtra>;
type Op = OpSpec<TreeState, TreeSettings, TreeExtra>;
type Gen = Generator<TreeStep, TreeState, void>;

/** The tree the page starts with: the best mixes levels (B, F and G), so neither level wins. */
export const START = '4 9 2 1 3 6 4';

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

// ----- Shape ids, shared with the view -----

export const nodeId = (u: number) => `node-${u}`;
export const takeId = (u: number) => `take-${u}`;
export const skipId = (u: number) => `skip-${u}`;
export const nowId = (u: number) => `now-${u}`;
export const bestId = (u: number) => `bestbit-${u}`;

// ----- The tree -----

/** Read a level-order list of whole numbers (_ for a gap), or say what is wrong. */
export function readTree(raw: Value | undefined): Token[] | string {
  const tokens = parseLevelOrder(String(raw ?? ''));
  if (tokens instanceof Error) return tokens.message;
  for (const t of tokens) {
    if (t === null) continue;
    if (typeof t !== 'number' || !Number.isInteger(t))
      return `"${t}" is not a whole number. Give each node a value from 0 to ${MAX_VALUE}, and _ for a gap.`;
    if (t < 0 || t > MAX_VALUE) return `${t} is out of range. Use values from 0 to ${MAX_VALUE}.`;
  }
  const count = tokens.filter((t) => t !== null).length;
  if (count > MAX_NODES)
    return `That is ${count} nodes. Use at most ${MAX_NODES}, so every subset can still be tried.`;
  return tokens;
}

/** The nodes of a level-order list, numbered in level order. */
export function treeOf(tokens: readonly Token[]): TNode[] {
  if (tokens.length === 0 || tokens[0] === null || tokens[0] === undefined) return [];
  const nodes: TNode[] = [];
  const add = (value: number, parent: number | null) => {
    const uid = nodes.length;
    nodes.push({ uid, name: NAMES[uid]!, value, left: null, right: null, parent });
    return uid;
  };
  add(Number(tokens[0]), null);
  const queue = [0];
  let i = 1;
  while (i < tokens.length && queue.length) {
    const x = queue.shift()!;
    for (const side of ['left', 'right'] as const) {
      const t = tokens[i++];
      if (t === undefined || t === null) continue;
      const u = add(Number(t), x);
      nodes[x]![side] = u;
      queue.push(u);
    }
  }
  return nodes;
}

/** The level-order list of a tree, with _ for gaps and no trailing gaps. */
export function listOf(nodes: readonly TNode[]): string {
  if (nodes.length === 0) return '_';
  const out: Token[] = [];
  const queue: (number | null)[] = [0];
  while (queue.length) {
    const u = queue.shift()!;
    if (u === null) {
      out.push(null);
      continue;
    }
    out.push(nodes[u]!.value);
    queue.push(nodes[u]!.left, nodes[u]!.right);
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return formatLevelOrder(out);
}

export function postorder(nodes: readonly TNode[]): number[] {
  const out: number[] = [];
  const walk = (u: number | null) => {
    if (u === null) return;
    walk(nodes[u]!.left);
    walk(nodes[u]!.right);
    out.push(u);
  };
  if (nodes.length) walk(0);
  return out;
}

export function preorder(nodes: readonly TNode[]): number[] {
  const out: number[] = [];
  const walk = (u: number | null) => {
    if (u === null) return;
    out.push(u);
    walk(nodes[u]!.left);
    walk(nodes[u]!.right);
  };
  if (nodes.length) walk(0);
  return out;
}

const fresh = (nodes: TNode[]): TreeState => ({
  nodes,
  memo: nodes.map(() => null),
  best: null,
  chosen: null,
});

export const init = (): TreeState => fresh(treeOf(readTree(START) as Token[]));

// ----- The two answers, without steps -----

/** take and skip for every node, from the leaves up. */
export function pairs(nodes: readonly TNode[]): Pair[] {
  const memo: Pair[] = nodes.map(() => [0, 0] as const);
  for (const u of postorder(nodes)) {
    const v = nodes[u]!;
    const l: Pair = v.left === null ? [0, 0] : memo[v.left]!;
    const r: Pair = v.right === null ? [0, 0] : memo[v.right]!;
    memo[u] = [v.value + l[1] + r[1], Math.max(l[0], l[1]) + Math.max(r[0], r[1])];
  }
  return memo;
}

/**
 * The chosen nodes, read back down from the root: a node is in when its parent is out and its
 * take beats its skip. A tie leaves it out. In level order.
 */
export function pick(nodes: readonly TNode[], memo: readonly (Pair | null)[]): number[] {
  const out: number[] = [];
  const walk = (u: number | null, parentIn: boolean) => {
    if (u === null) return;
    const [t, s] = memo[u]!;
    const use = !parentIn && t > s;
    if (use) out.push(u);
    walk(nodes[u]!.left, use);
    walk(nodes[u]!.right, use);
  };
  if (nodes.length) walk(0, false);
  return out.sort((a, b) => a - b);
}

/** How many calls trying every allowed subset makes, and how many subsets it scores. */
export function naiveCount(nodes: readonly TNode[]): { calls: number; subsets: number } {
  const n = nodes.length;
  const taken = Array<boolean>(n).fill(false);
  let calls = 0;
  let subsets = 0;
  const go = (i: number) => {
    calls++;
    if (i === n) {
      subsets++;
      return;
    }
    go(i + 1);
    const p = nodes[i]!.parent;
    if (p === null || !taken[p]) {
      taken[i] = true;
      go(i + 1);
      taken[i] = false;
    }
  };
  go(0);
  return { calls, subsets };
}

export const totals = (nodes: readonly TNode[]): Totals => ({
  naive: naiveCount(nodes).calls,
  pattern: nodes.length,
});

// ----- Text -----

const nameOf = (nodes: readonly TNode[], u: number) => nodes[u]!.name;
const namesOf = (nodes: readonly TNode[], us: readonly number[]) =>
  us.length ? andList(us.map((u) => nodes[u]!.name)) : 'no nodes';

/** "B, F and G (9 + 6 + 4 = 19)". */
function chosenText(nodes: readonly TNode[], us: readonly number[]): string {
  if (us.length === 0) return 'no nodes at all';
  const vs = us.map((u) => nodes[u]!.value);
  const sum = vs.reduce((a, b) => a + b, 0);
  return us.length === 1
    ? `${nodes[us[0]!]!.name} alone (${sum})`
    : `${namesOf(nodes, us)} (${vs.join(' + ')} = ${sum})`;
}

export function describe(s: TreeState): string {
  if (s.nodes.length === 0) return 'An empty tree.';
  const parts = s.nodes.map((v) => {
    const kids = [v.left, v.right]
      .filter((c): c is number => c !== null)
      .map((c) => s.nodes[c]!.name);
    const memo = s.memo[v.uid];
    return `${v.name} = ${v.value}${kids.length ? `, children ${andList(kids)}` : ', a leaf'}${memo ? `, take ${memo[0]}, skip ${memo[1]}` : ''}`;
  });
  const best =
    s.best === null
      ? ''
      : ` Best total ${s.best}: ${s.chosen && s.chosen.length ? namesOf(s.nodes, s.chosen) : 'no nodes'}.`;
  return `A tree of ${plural(s.nodes.length, 'node')}: ${parts.join('; ')}.${best}`;
}

export function initialSay(s: TreeState): string {
  if (s.nodes.length === 0)
    return 'The tree is empty. Type a tree in level order, such as 4 9 2 1 3 6 4, and press Build.';
  return `A tree of ${plural(s.nodes.length, 'node')}, each with a value. Choose nodes for the largest total, but never a node together with its parent, like inviting people from an org chart without their direct boss. Press Best total.`;
}

export function initialVars(s: TreeState): Record<string, Scalar> {
  return { n: s.nodes.length };
}

// ----- Operations -----

const build: Op = {
  label: 'Build',
  arity: 1,
  *run(s, [raw]) {
    const tokens = readTree(raw);
    if (typeof tokens === 'string') {
      yield {
        state: s,
        marks: [],
        say: `The tree stays as it was. ${tokens}`,
        lines: [],
        level: 1,
        vars: { n: s.nodes.length },
      };
      return s;
    }
    const next = fresh(treeOf(tokens));
    yield {
      state: next,
      marks: next.nodes.map((v) => mark(nodeId(v.uid), 'new')),
      say: next.nodes.length
        ? `Built a tree of ${plural(next.nodes.length, 'node')}, named ${next.nodes[0]!.name} to ${next.nodes.at(-1)!.name} in level order: ${next.nodes.map((v) => `${v.name} = ${v.value}`).join(', ')}. Press Best total.`
        : 'The list is just _, so the tree is empty. Its best total is 0.',
      lines: [],
      level: 1,
      vars: { n: next.nodes.length },
    };
    return next;
  },
};

/** "max(9, 4) = 9". */
const maxText = (p: Pair) => `max(${p[0]}, ${p[1]}) = ${Math.max(p[0], p[1])}`;

/** The pattern: two values per node, from the leaves up. */
function* pattern(s: TreeState): Gen {
  const nodes = s.nodes;
  const n = nodes.length;
  const tot = totals(nodes);
  const work = new Work(['calls']);
  const memo: (Pair | null)[] = nodes.map(() => null);
  const state = (): TreeState => ({ nodes, memo: [...memo], best: null, chosen: null });
  const vars = (more: Record<string, Scalar> = {}): Record<string, Scalar> => ({
    n,
    ...more,
    ...workVars(work, tot),
  });

  if (n === 0) {
    const end: TreeState = { ...state(), best: 0, chosen: [] };
    yield {
      state: end,
      marks: [],
      say: 'The tree is empty, so there is nothing to choose: the best total is 0, with no calls.',
      lines: ['p.max'],
      level: 1,
      vars: vars({ best: 0 }),
      extra: { approach: 'pattern' },
    };
    return end;
  }

  yield {
    state: state(),
    marks: [],
    say: `Give every node two values: take, the best total in its subtree with it chosen, and skip, the best with it left out. A node needs its children's values first, so walk the tree in post-order, from the leaves up: ${andList(postorder(nodes).map((u) => nameOf(nodes, u)))}.`,
    lines: ['p.main', 'p.call'],
    level: 2,
    vars: vars(),
    extra: { approach: 'pattern', stack: [] },
  };

  const ancestors = (u: number) => {
    const out: number[] = [];
    for (let p = nodes[u]!.parent; p !== null; p = nodes[p]!.parent) out.unshift(p);
    return out;
  };

  for (const u of postorder(nodes)) {
    const v = nodes[u]!;
    work.add('calls');
    const kids = [v.left, v.right].filter((c): c is number => c !== null);
    const l: Pair = v.left === null ? [0, 0] : memo[v.left]!;
    const r: Pair = v.right === null ? [0, 0] : memo[v.right]!;
    const take = v.value + l[1] + r[1];
    const skip = Math.max(l[0], l[1]) + Math.max(r[0], r[1]);
    memo[u] = [take, skip];
    let say: string;
    if (kids.length === 0) {
      say = `${v.name} is a leaf: take = ${v.value}, its own value, and skip = 0.`;
    } else {
      const ks = kids.map((c) => ({ c, p: memo[c]! }));
      const skips = ks.map(({ c, p }) => `skip(${nameOf(nodes, c)}) = ${p[1]}`).join(' and ');
      const bests = ks.map(({ c, p }) => `${nameOf(nodes, c)}: ${maxText(p)}`).join('; ');
      say =
        `${v.name} = ${v.value}. Take ${v.name}: its ${kids.length === 1 ? 'child stays' : 'children stay'} out, so take = ${v.value} + ${ks.map(({ p }) => p[1]).join(' + ')} = ${take} (${skips}). ` +
        `Skip ${v.name}: each child gives its better value (${bests}), so skip = ${ks.length === 1 ? Math.max(...ks[0]!.p) : ks.map(({ p }) => Math.max(...p)).join(' + ')}${ks.length === 1 ? '' : ` = ${skip}`}.`;
    }
    yield {
      state: state(),
      marks: [
        mark(nodeId(u), 'active'),
        mark(takeId(u), 'new'),
        mark(skipId(u), 'new'),
        ...kids.flatMap((c) => [mark(takeId(c), 'compare'), mark(skipId(c), 'compare')]),
      ],
      say,
      lines:
        kids.length === 0
          ? ['p.sig', 'p.take', 'p.skip', 'p.ret']
          : ['p.left', 'p.right', 'p.take', 'p.skip', 'p.ret'],
      level: 2,
      vars: vars({ node: v.name, take, skip }),
      extra: { approach: 'pattern', at: u, stack: ancestors(u) },
    };
  }

  const root = memo[0]!;
  const best = Math.max(root[0], root[1]);
  const chosen = pick(nodes, memo);
  const end: TreeState = { nodes, memo: [...memo], best, chosen };
  const why =
    root[0] > root[1]
      ? `take beats skip at the root, so ${nodes[0]!.name} is in`
      : root[0] === root[1]
        ? `take ties with skip at the root, so ${nodes[0]!.name} stays out`
        : `skip beats take at the root, so ${nodes[0]!.name} stays out`;
  yield {
    state: end,
    marks: [
      mark(takeId(0), 'found'),
      mark(skipId(0), 'found'),
      ...chosen.map((u) => mark(nodeId(u), 'found')),
    ],
    say: `At the root ${nodes[0]!.name}, take = ${root[0]} and skip = ${root[1]}, so the best total is ${maxText(root)}. Read the choice back down: a node is in when its parent is out and its take beats its skip. Here ${why}, and the best uses ${chosenText(nodes, chosen)}. That took ${plural(n, 'call')}; trying every allowed subset takes ${tot.naive}.`,
    lines: ['p.max'],
    level: 1,
    vars: vars({ best, chosen: namesOf(nodes, chosen) }),
    extra: { approach: 'pattern', stack: [] },
  };
  return end;
}

/** The naive approach: try every allowed subset, deciding the nodes in level order. */
function* naive(s: TreeState): Gen {
  const nodes = s.nodes;
  const n = nodes.length;
  const tot = totals(nodes);
  const work = new Work(['calls']);
  const now: (boolean | null)[] = nodes.map(() => null);
  let best: number | null = null;
  let bestSet: boolean[] | null = null;
  let subsets = 0;
  const state = fresh(nodes);
  const extra = (total: number): TreeExtra => ({
    approach: 'naive',
    now: [...now],
    total,
    bestSet: bestSet && [...bestSet],
    bestTotal: best,
  });
  const vars = (total: number, i: number): Record<string, Scalar> => ({
    n,
    i,
    total,
    best: best ?? '–',
    subsets,
    ...workVars(work, tot),
  });

  function* go(i: number, total: number, how: string): Generator<TreeStep, void, void> {
    work.add('calls');
    const marks: Mark[] = [];
    let say = how;
    const decided = i - 1;
    if (decided >= 0) marks.push(mark(nodeId(decided), 'active'), mark(nowId(decided), 'active'));
    if (i === n) {
      subsets++;
      const set = nodes.filter((_, u) => now[u]).map((v) => v.uid);
      const before = best;
      const better = best === null || total > best;
      if (better) {
        best = total;
        bestSet = now.map((x) => x === true);
      }
      const subset = set.length
        ? `{${set.map((u) => nameOf(nodes, u)).join(', ')}}`
        : 'nothing taken';
      say += ` All ${plural(n, 'node')} decided: ${subset}, total ${total}. ${
        before === null
          ? `The first subset, so best = ${total}.`
          : better
            ? `Better than ${before}: best = ${total}.`
            : `Not better than ${before}.`
      }`;
      if (better) marks.push(...nodes.map((v) => mark(bestId(v.uid), 'new')));
    }
    yield {
      state,
      marks,
      say,
      lines: i === n ? ['n.sig', 'n.done', 'n.best'] : i === 0 ? ['n.call', 'n.sig'] : ['n.sig'],
      level: 2,
      vars: vars(total, i),
      extra: extra(total),
    };
    if (i === n) return;
    const v = nodes[i]!;
    now[i] = false;
    yield* go(i + 1, total, `Leave ${v.name} out: total stays ${total}.`);
    const p = v.parent;
    if (p === null || !now[p]) {
      now[i] = true;
      yield* go(
        i + 1,
        total + v.value,
        `Take ${v.name} (+${v.value}): total = ${total} + ${v.value} = ${total + v.value}.`,
      );
    } else {
      now[i] = false;
      yield {
        state,
        marks: [mark(nodeId(i), 'error'), mark(nodeId(p), 'compare')],
        say: `${v.name} cannot be taken: its parent ${nameOf(nodes, p)} is in. Back up.`,
        lines: ['n.can'],
        level: 3,
        vars: vars(total, i),
        extra: extra(total),
      };
    }
    now[i] = null;
  }

  yield* go(
    0,
    0,
    n === 0
      ? 'The tree is empty: the only subset is the empty one.'
      : `Try every allowed subset. Decide the nodes in level order, ${andList(nodes.map((v) => v.name))}: leave each one out, or take it when its parent is not taken. Every full set of decisions is a subset that follows the rule.`,
  );
  const chosen = nodes.filter((_, u) => bestSet?.[u]).map((v) => v.uid);
  const end: TreeState = { ...state, best: best ?? 0, chosen };
  yield {
    state: end,
    marks: chosen.map((u) => mark(nodeId(u), 'found')),
    say: `Done: ${plural(work.get('calls'), 'call')} tried ${plural(subsets, 'subset')} that follow the rule. The best total is ${best ?? 0}: ${chosenText(nodes, chosen)}. Two values per node take ${plural(n, 'call')}.`,
    lines: ['n.ret'],
    level: 1,
    vars: { ...vars(0, n), best: best ?? 0, chosen: namesOf(nodes, chosen) },
    extra: { approach: 'naive', now: nodes.map(() => null), bestSet, bestTotal: best },
  };
  return end;
}

const solve: Op = {
  label: 'Best total',
  arity: 0,
  *run(s, _args, { settings }) {
    return approachOf(settings) === 'naive' ? yield* naive(s) : yield* pattern(s);
  },
};

export const ops: Record<string, Op> = { build, solve };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: TreeSettings): PseudoBlock[] {
  if (approachOf(settings) === 'naive')
    return [
      {
        op: 'solve',
        lines: [
          L(
            'n.main',
            0,
            'bestTotal(root)   // try every allowed subset',
            'To find the best total, try every subset that follows the rule:',
          ),
          L(
            'n.call',
            1,
            'best = 0; tryAll(0, 0); return best',
            'decide the nodes one by one, starting with the first in level order.',
          ),
          L(
            'n.sig',
            0,
            'tryAll(i, total)   // nodes 0..i − 1 are decided',
            'With the first i nodes decided and their total so far:',
          ),
          L('n.done', 1, 'if i == n', 'if every node is decided, this is one subset:'),
          L(
            'n.best',
            2,
            'best = max(best, total); return',
            'keep its total if it is the best so far.',
          ),
          L(
            'n.skip',
            1,
            'tryAll(i + 1, total)   // leave node i out',
            'Otherwise leave node i out and decide the rest,',
          ),
          L('n.can', 1, 'if parent(i) is not taken', 'then, if its parent is not taken,'),
          L(
            'n.take',
            2,
            'taken[i] = true; tryAll(i + 1, total + value(i)); taken[i] = false',
            'take node i, decide the rest, and undo the choice.',
          ),
          L(
            'n.ret',
            0,
            '// calls: one per partial choice, exponential in n',
            'The best of all those subsets is the answer.',
          ),
        ],
      },
    ];
  return [
    {
      op: 'solve',
      lines: [
        L('p.main', 0, 'bestTotal(root)', 'To find the best total:'),
        L('p.call', 1, '(take, skip) = solve(root)', 'get the root’s two values,'),
        L('p.max', 1, 'return max(take, skip)', 'and keep the larger.'),
        L(
          'p.sig',
          0,
          'solve(v)   // (0, 0) when v is nil',
          'For a node v (an empty child gives 0 and 0):',
        ),
        L('p.left', 1, '(lt, ls) = solve(v.left)', 'first get the left child’s two values,'),
        L('p.right', 1, '(rt, rs) = solve(v.right)', 'then the right child’s,'),
        L('p.take', 1, 'take = v.value + ls + rs', 'with v in, both children must stay out;'),
        L(
          'p.skip',
          1,
          'skip = max(lt, ls) + max(rt, rs)',
          'with v out, each child gives its better value;',
        ),
        L('p.ret', 1, 'return (take, skip)', 'hand both back to the parent.'),
      ],
    },
  ];
}
