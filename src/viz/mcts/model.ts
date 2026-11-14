/**
 * Monte Carlo tree search (Coulom 2006) with UCT, the UCB1 rule of Kocsis and Szepesvári (2006),
 * on a small tree of next words. A model has written "the"; three words can follow, each with two
 * words after it, each with two endings: twelve sentences of four words. A reward model (a table
 * made by hand) scores each finished sentence from 0 to 1. The search does not see the scores
 * until a rollout reaches one.
 *
 * One iteration, four phases:
 *   selection        from the root, while a node has tried every next word, go to the child with
 *                    the largest UCB1 = Q + c·√(ln N / n), Q = W / n its mean reward, n its visits,
 *                    N the parent's visits (ties: the leftmost)
 *   expansion        add the node's first untried next word to the tree (none for a finished
 *                    sentence)
 *   rollout          from there, pick next words at random (u from the seeded RNG; the k-th of m
 *                    children when k − 1 ≤ u·m < k) until the sentence ends; its score is r
 *   backpropagation  every node on the path from the root gets n += 1 and W += r
 * The move is the root's most visited child (ties: the leftmost).
 *
 * Operations: iterate (one iteration), run (iterate until the budget is spent, then pick the
 * move), reset (an empty tree). The arithmetic runs in the same order as the code tabs.
 */
import type { Rng } from '../../engine/rng';
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { short, two } from '../_lm/numbers';

export type CChoice = '0' | '0.5' | 'sqrt2' | '2';
export type Budget = '10' | '30' | '100';

export interface MctsSettings {
  [key: string]: Scalar;
  c: CChoice;
  budget: Budget;
}

export const defaults: MctsSettings = { c: 'sqrt2', budget: '30' };

export const cOf = (s: MctsSettings): number => (s.c === 'sqrt2' ? Math.SQRT2 : Number(s.c));
export const cText = (s: MctsSettings): string => (s.c === 'sqrt2' ? '√2' : s.c);

export interface TreeNode {
  id: number;
  token: string;
  parent: number | null;
  depth: number;
  children: number[];
  /** The reward model's score, for a finished sentence (a leaf). */
  reward?: number;
}

type Spec = { [token: string]: Spec | number };

/** The words that can follow "the", and the score of each finished sentence. */
const SPEC: Spec = {
  cat: { sat: { down: 0.6, still: 0.7 }, ran: { off: 0.5, home: 0.6 } },
  dog: { ate: { it: 0.1, fast: 0.2 }, ran: { away: 0.2, home: 1 } },
  fox: { sat: { down: 0.3, still: 0.2 }, ate: { it: 0.3, fast: 0.1 } },
};

function build(): TreeNode[] {
  const nodes: TreeNode[] = [{ id: 0, token: 'the', parent: null, depth: 0, children: [] }];
  // Breadth first, so ids go down the tree level by level, left to right.
  const queue: [number, Spec][] = [[0, SPEC]];
  while (queue.length) {
    const [pid, spec] = queue.shift()!;
    for (const [token, sub] of Object.entries(spec)) {
      const id = nodes.length;
      const node: TreeNode = { id, token, parent: pid, depth: nodes[pid]!.depth + 1, children: [] };
      if (typeof sub === 'number') node.reward = sub;
      nodes.push(node);
      nodes[pid]!.children.push(id);
      if (typeof sub !== 'number') queue.push([id, sub]);
    }
  }
  return nodes;
}

export const TREE: readonly TreeNode[] = build();
export const ROOT = 0;
export const isLeaf = (id: number): boolean => TREE[id]!.children.length === 0;

/** The words from the root's child down to node `id`: "dog ran home". */
export function words(id: number): string[] {
  const out: string[] = [];
  for (let k: number | null = id; k !== null && k !== ROOT; k = TREE[k]!.parent)
    out.unshift(TREE[k]!.token);
  return out;
}
export const sentence = (id: number): string => ['the', ...words(id)].join(' ');

/** What one iteration did, for the view, the code tabs and practice. */
export interface Trace {
  /** Selection: the nodes chosen, from the root down (the root first). */
  selected: number[];
  /** The UCB1 scores of the children compared at each node selection passed through. */
  scores: { at: number; ucb: [number, number][] }[];
  /** The node expansion added, if any. */
  added: number | null;
  /** The rollout: the nodes it went through below the path, and the u that picked each. */
  rollout: number[];
  us: number[];
  /** The finished sentence reached, and its score. */
  leaf: number;
  r: number;
}

export interface MctsState {
  /** Visits and total reward per node of TREE; a node is in the search tree once added. */
  n: number[];
  w: number[];
  /** How many children of each node have been added (they are added left to right). */
  tried: number[];
  iterations: number;
  history: Trace[];
}

/** What a step in the middle of an iteration shows. */
export interface MctsExtra {
  phase?: 'select' | 'expand' | 'rollout';
  trace?: Trace;
  /** Selection steps shown so far (the first k entries of trace.scores). */
  scored?: number;
}

type S = MctsState;
type X = MctsExtra;
type Op = OpSpec<S, MctsSettings, X>;
type MStep = Step<S, X>;

export function init(): S {
  const zeros = () => TREE.map(() => 0);
  return { n: zeros(), w: zeros(), tried: zeros(), iterations: 0, history: [] };
}

export const inTree = (s: S, id: number): boolean => {
  const p = TREE[id]!.parent;
  return p === null || TREE[p]!.children.indexOf(id) < s.tried[p]!;
};
export const meanOf = (s: S, id: number): number => s.w[id]! / s.n[id]!;

/** UCB1 of child `id` of a node with N visits. */
export const ucb = (s: S, id: number, c: number): number => {
  const parent = TREE[id]!.parent!;
  return s.w[id]! / s.n[id]! + c * Math.sqrt(Math.log(s.n[parent]!) / s.n[id]!);
};

/** The child with the largest UCB1, the first on a tie; with every score. */
export function selectChild(
  s: S,
  at: number,
  c: number,
): { best: number; ucb: [number, number][] } {
  let best = -1;
  let top = -Infinity;
  const scores: [number, number][] = [];
  for (const k of TREE[at]!.children) {
    const u = ucb(s, k, c);
    scores.push([k, u]);
    if (u > top) {
      top = u;
      best = k;
    }
  }
  return { best, ucb: scores };
}

/** The root's most visited child (the first on a tie), or null before any visit. */
export function bestMove(s: S): number | null {
  let best: number | null = null;
  for (const k of TREE[ROOT]!.children)
    if (s.n[k]! > 0 && (best === null || s.n[k]! > s.n[best]!)) best = k;
  return best;
}

/** One whole iteration: the trace and the state after it. */
export function iteration(s: S, c: number, rng: Pick<Rng, 'next'>): { trace: Trace; next: S } {
  const selected = [ROOT];
  const scores: Trace['scores'] = [];
  let node = ROOT;
  while (!isLeaf(node) && s.tried[node] === TREE[node]!.children.length) {
    const pick = selectChild(s, node, c);
    scores.push({ at: node, ucb: pick.ucb });
    node = pick.best;
    selected.push(node);
  }
  const tried = [...s.tried];
  let added: number | null = null;
  if (!isLeaf(node)) {
    added = TREE[node]!.children[tried[node]!]!;
    tried[node]!++;
    node = added;
  }
  const rollout: number[] = [];
  const us: number[] = [];
  let leaf = node;
  while (!isLeaf(leaf)) {
    const kids = TREE[leaf]!.children;
    const u = rng.next();
    leaf = kids[Math.floor(u * kids.length)]!;
    us.push(u);
    rollout.push(leaf);
  }
  const r = TREE[leaf]!.reward!;
  const n = [...s.n];
  const w = [...s.w];
  for (const id of added === null ? selected : [...selected, added]) {
    n[id]!++;
    w[id]! += r;
  }
  const trace: Trace = { selected, scores, added, rollout, us, leaf, r };
  return {
    trace,
    next: { n, w, tried, iterations: s.iterations + 1, history: [...s.history, trace] },
  };
}

/** The path backpropagation updates: the selected nodes and the one added. */
export const pathOf = (t: Trace): number[] =>
  t.added === null ? t.selected : [...t.selected, t.added];

// ---------------------------------------------------------------------------------------------
// Steps

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const nodeId = (id: number) => `n-${id}`;
export const edgeId = (id: number) => `e-${id}`;
const ordinal = (k: number) => ['1st', '2nd', '3rd'][k] ?? `${k + 1}th`;
/** "a", "a and b", "a, b and c". */
const list = (xs: readonly string[]) =>
  xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

export function baseVars(s: S, settings: MctsSettings): Record<string, Scalar> {
  const best = bestMove(s);
  return {
    iterations: `${s.iterations} of ${settings.budget}`,
    c: cText(settings),
    'most visited': best === null ? '–' : `${TREE[best]!.token} (${s.n[best]})`,
  };
}

const qText = (s: S, id: number) => (s.n[id]! > 0 ? two(meanOf(s, id)) : '–');

/** The steps of one iteration; the last one, at `endLevel`, shows the state after it. */
function* iterate(
  s: S,
  settings: MctsSettings,
  rng: Rng,
  endLevel: 1 | 2,
): Generator<MStep, S, void> {
  const c = cOf(settings);
  const { trace: t, next } = iteration(s, c, rng);
  const k = s.iterations + 1;
  const vars = baseVars(s, settings);
  const pathMarks = (upto: number) =>
    t.selected.slice(0, upto).map((id) => mark(nodeId(id), 'active'));
  const pathEdges = (ids: readonly number[], role: Mark['role']) =>
    ids.filter((id) => id !== ROOT).map((id) => mark(edgeId(id), role));

  // Selection, one step per node passed through.
  if (t.scores.length === 0)
    yield {
      state: s,
      marks: [mark(nodeId(ROOT), 'active')],
      say: `Iteration ${k}. Selection stops at once: the root still has a next word it has not tried.`,
      lines: ['sel', 'while'],
      level: 2,
      vars,
      extra: { phase: 'select', trace: t, scored: 0 },
    };
  for (const [j, sc] of t.scores.entries()) {
    const chosen = t.selected[j + 1]!;
    const N = s.n[sc.at]!;
    const terms = sc.ucb
      .map(
        ([id, u]) =>
          `${TREE[id]!.token} ${two(meanOf(s, id))} + ${cText(settings)} × √(ln ${N} / ${s.n[id]}) = ${two(u)}`,
      )
      .join('; ');
    yield {
      state: s,
      marks: [
        ...pathMarks(j + 1),
        ...pathEdges(t.selected.slice(1, j + 1), 'active'),
        ...sc.ucb.map(([id]) => mark(nodeId(id), id === chosen ? 'active' : 'compare')),
        mark(edgeId(chosen), 'active'),
      ],
      say: `${j === 0 ? `Iteration ${k}. ` : ''}Selection at "${sentence(sc.at)}" (N = ${N}): UCB1 = Q + c·√(ln N / n). ${terms}. Go to ${TREE[chosen]!.token}${
        c === 0 ? ' (c = 0: the best mean, no exploring)' : ''
      }.`,
      lines: ['while', 'ucb'],
      level: 2,
      vars,
      extra: { phase: 'select', trace: t, scored: j + 1 },
    };
  }

  // Expansion.
  const end = t.selected.at(-1)!;
  const tail = pathOf(t);
  yield {
    state: s,
    marks: [
      ...pathMarks(t.selected.length),
      ...pathEdges(t.selected, 'active'),
      ...(t.added === null
        ? [mark(nodeId(end), 'found')]
        : [mark(nodeId(t.added), 'new'), mark(edgeId(t.added), 'new')]),
    ],
    say:
      t.added === null
        ? `"${sentence(end)}" is a finished sentence: nothing to add, and nothing to roll out.`
        : `Expansion: add ${TREE[t.added]!.token}, the first next word after "${sentence(end)}" not yet in the tree.`,
    lines: ['exp'],
    level: 2,
    vars,
    extra: { phase: 'expand', trace: t },
  };

  // Rollout.
  const from = tail.at(-1)!;
  const picks = t.rollout.map((id, j) => {
    const kids = TREE[TREE[id]!.parent!]!.children;
    return `u = ${two(t.us[j]!)} picks ${TREE[id]!.token} (${ordinal(kids.indexOf(id))} of ${kids.length})`;
  });
  yield {
    state: s,
    marks: [
      ...tail.map((id) => mark(nodeId(id), 'active')),
      ...t.rollout.map((id) => mark(nodeId(id), id === t.leaf ? 'found' : 'visit')),
      ...pathEdges(t.rollout, 'visit'),
      mark(`r-${t.leaf}`, 'found'),
    ],
    say: picks.length
      ? `Rollout from ${TREE[from]!.token}, choosing at random: ${picks.join(', ')}. "${sentence(t.leaf)}" scores ${two(t.r)}.`
      : `"${sentence(t.leaf)}" scores ${two(t.r)}.`,
    lines: ['roll'],
    level: 2,
    vars,
    extra: { phase: 'rollout', trace: t },
  };

  // Backpropagation.
  const child = tail[1];
  const childSay =
    child === undefined
      ? ''
      : ` ${TREE[child]!.token} now has ${next.n[child]} visit${next.n[child] === 1 ? '' : 's'} and Q = ${two(next.w[child]!)} / ${next.n[child]} = ${two(meanOf(next, child))}.`;
  yield {
    state: next,
    marks: tail.map((id) => mark(nodeId(id), 'new')),
    say: `Backpropagation: ${list(tail.map((id) => TREE[id]!.token))} each get one more visit and ${two(t.r)} more reward.${childSay}`,
    lines: ['back'],
    level: endLevel,
    vars: baseVars(next, settings),
  };
  return next;
}

const iterateOp: Op = {
  label: 'Iterate',
  arity: 0,
  *run(s, _args, { settings, rng }) {
    return yield* iterate(s, settings, rng, 1);
  },
};

function moveSay(s: S): string {
  const kids = TREE[ROOT]!.children;
  const best = bestMove(s);
  if (best === null) return 'No iterations yet, so no move.';
  return `The root's children: ${kids
    .map((k) => `${TREE[k]!.token} ${s.n[k]} visit${s.n[k] === 1 ? '' : 's'} (Q ${qText(s, k)})`)
    .join(', ')}. The move is ${TREE[best]!.token}, the most visited.`;
}

const runOp: Op = {
  label: 'Run',
  arity: 0,
  *run(s, _args, { settings, rng }) {
    const budget = Number(settings.budget);
    if (s.iterations >= budget) {
      yield {
        state: s,
        marks: [],
        say: `The budget of ${budget} iterations is spent. Reset, choose a bigger budget, or press Iterate for one more. ${moveSay(s)}`,
        lines: [],
        level: 1,
        vars: baseVars(s, settings),
      };
      return s;
    }
    let cur = s;
    while (cur.iterations < budget) cur = yield* iterate(cur, settings, rng, 1);
    const best = bestMove(cur)!;
    yield {
      state: cur,
      marks: [mark(nodeId(best), 'found'), mark(edgeId(best), 'found')],
      say: `Budget spent: ${budget} iterations. ${moveSay(cur)}`,
      lines: ['move'],
      level: 1,
      vars: baseVars(cur, settings),
    };
    return cur;
  },
};

const resetOp: Op = {
  label: 'Reset',
  arity: 0,
  *run(_s, _args, { settings }) {
    const next = init();
    yield {
      state: next,
      marks: [mark(nodeId(ROOT), 'active')],
      say: 'An empty tree: only the root, "the". Every count starts at 0.',
      lines: ['rsig'],
      level: 1,
      vars: baseVars(next, settings),
    };
    return next;
  },
};

export const ops = { iterate: iterateOp, run: runOp, reset: resetOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

function iterationLines(indent: number) {
  return [
    L('sel', indent, 'node = root', 'Start at the root.'),
    L(
      'while',
      indent,
      'while node has tried every child',
      'While every next word here is already in the tree,',
    ),
    L(
      'ucb',
      indent + 1,
      'node = argmax over children of Q + c·√(ln N / n)',
      'go to the one that looks best, plus a bonus for being tried less.',
    ),
    L(
      'exp',
      indent,
      'if node is not a leaf: node = its first untried child',
      'Add one new next word to the tree.',
    ),
    L(
      'roll',
      indent,
      'r = reward at the end of a random rollout from node',
      'Finish the sentence at random and score it.',
    ),
    L(
      'back',
      indent,
      'for each node on the path: n += 1, W += r',
      'Every node on the way gets one more visit and the score.',
    ),
  ];
}

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'iterate',
      lines: [
        L('isig', 0, 'MCTS-ITERATION(root)', 'One round of the search:'),
        ...iterationLines(1),
      ],
    },
    {
      op: 'run',
      lines: [
        L('rsig', 0, 'MCTS(root, budget)', 'Search with a fixed number of rounds:'),
        L('for', 1, 'repeat budget times', 'Do as many rounds as the budget allows:'),
        ...iterationLines(2),
        L(
          'move',
          1,
          'return the child of root with the most visits',
          'Pick the next word tried most.',
        ),
      ],
    },
    {
      op: 'reset',
      lines: [L('rsig', 0, 'root = new node, n = 0, W = 0', 'Start over with only the root.')],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(): string {
  return 'A model has written "the". Which word next? A reward model scores each finished sentence, but the search sees a score only when a rollout reaches it. Press Iterate to run one round of selection, expansion, rollout and backpropagation, or Run to spend the budget.';
}

export const initialVars = (s: S, settings: MctsSettings) => baseVars(s, settings);

export function describe(s: S): string {
  const known = TREE.filter((t) => inTree(s, t.id) && s.n[t.id]! > 0);
  if (!known.length) return 'An empty search tree: only the root, "the".';
  return `After ${s.iterations} iterations: ${known
    .map((t) => `"${sentence(t.id)}" ${s.n[t.id]} visits, mean ${short(meanOf(s, t.id))}`)
    .join('; ')}.`;
}
