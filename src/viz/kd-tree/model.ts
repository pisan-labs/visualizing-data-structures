import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { Vec } from '../../layouts/plane';
import { at, dist2, nameOf, pointsArg, readBox, readPoint, same, type NPt } from '../_spatial/kit';

/** Coordinates are whole numbers in [0, MAX]. */
export const MAX = 12;
/** At most this many points in the tree. */
export const MOST = 15;

export interface KdNode extends NPt {
  left: number | null;
  right: number | null;
  depth: number;
}

export interface Box {
  lo: Vec;
  hi: Vec;
}

export interface KdState {
  nodes: KdNode[];
  root: number | null;
  /** Points of the running insert that are not in the tree yet (drawn faded). */
  pending: NPt[];
  nextId: number;
  /** The last nearest-neighbour query point, or null. */
  query: Vec | null;
  /** The last range query's rectangle, or null. */
  box: Box | null;
  best: number | null;
  bestD2: number | null;
  /** Nodes the last search looked at, and roots of the subtrees it skipped. */
  visited: number[];
  pruned: number[];
  /** Points the range query reported. */
  found: number[];
}

export interface KdSettings {
  [key: string]: Scalar;
  /** Skip a subtree when the best circle does not reach its side of the line. */
  prune: boolean;
}

export interface KdExtra {
  /** The point being inserted, and the node it is compared with. */
  moving?: number;
  /** A distance check against a splitting line: from q to the line of `node`. */
  gap?: { node: number; crosses: boolean };
}

type S = KdState;
type X = KdExtra;
type Op = OpSpec<S, KdSettings, X>;
type KStep = Step<S, X>;

export const defaults: KdSettings = { prune: true };

export function init(): S {
  return {
    nodes: [],
    root: null,
    pending: [],
    nextId: 1,
    query: null,
    box: null,
    best: null,
    bestD2: null,
    visited: [],
    pruned: [],
    found: [],
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const ptId = (id: number) => `pt-${id}`;
export const nodeId = (id: number) => `node-${id}`;
export const axisOf = (depth: number): 'x' | 'y' => (depth % 2 === 0 ? 'x' : 'y');
const coord = (p: Vec, a: 'x' | 'y') => (a === 'x' ? p.x : p.y);

export const byId = (s: S, id: number) => s.nodes.find((n) => n.id === id)!;

/** Edges on the longest root-to-leaf path; -1 for an empty tree. */
export function height(s: S): number {
  const h = (id: number | null): number => {
    if (id === null) return -1;
    const n = byId(s, id);
    return 1 + Math.max(h(n.left), h(n.right));
  };
  return h(s.root);
}

/** Ids in a subtree, preorder. */
export function subtree(s: S, id: number | null): number[] {
  if (id === null) return [];
  const n = byId(s, id);
  return [id, ...subtree(s, n.left), ...subtree(s, n.right)];
}

const clean = (s: S): S => ({
  ...s,
  query: null,
  box: null,
  best: null,
  bestD2: null,
  visited: [],
  pruned: [],
  found: [],
});

export function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return {
    n: s.nodes.length,
    height: height(s),
    ...more,
  };
}

function searchVars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return vars(s, {
    visited: s.visited.length,
    pruned: s.pruned.length,
    ...more,
  });
}

function nnVars(s: S): Record<string, Scalar> {
  return searchVars(s, {
    best: s.best === null ? 'none' : byId(s, s.best).name,
    'best d²': s.bestD2 ?? '∞',
  });
}

function rangeVars(s: S): Record<string, Scalar> {
  return searchVars(s, {
    found: s.found.length ? s.found.map((id) => byId(s, id).name).join(' ') : '(none)',
  });
}

function oops(s: S, say: string, v = vars(s)): KStep {
  return { state: s, marks: [], say, lines: [], vars: v, level: 1 };
}

// ----- insert -----

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s0, [v], { rng }) {
    const pts = pointsArg(v, rng, MAX, MOST, 0, MAX);
    if (typeof pts === 'string') {
      yield oops(s0, `insert: ${pts}`);
      return s0;
    }
    let s = clean(s0);
    if (s.nodes.length + pts.length > MOST) {
      yield oops(
        s0,
        `insert: the tree has ${s.nodes.length} points and holds at most ${MOST}. Nothing was inserted.`,
      );
      return s0;
    }
    let next = s.nextId;
    const incoming: NPt[] = pts.map((p) => {
      const id = next++;
      return { id, name: nameOf(id), x: p.x, y: p.y };
    });
    s = { ...s, pending: incoming, nextId: next };
    if (incoming.length > 1)
      yield {
        state: s,
        marks: incoming.map((p) => mark(ptId(p.id), 'new')),
        say: `Insert ${incoming.length} points, one at a time: ${incoming.map(at).join(', ')}.`,
        lines: ['ins.sig'],
        vars: vars(s),
        level: 2,
      };
    const done: string[] = [];
    for (const p of incoming) {
      s = { ...s, pending: s.pending.filter((q) => q.id !== p.id) };
      const dup = s.nodes.find((q) => same(q, p));
      if (s.root === null) {
        const node: KdNode = { ...p, left: null, right: null, depth: 0 };
        s = { ...s, nodes: [node], root: p.id };
        done.push(p.name);
        yield {
          state: s,
          marks: [mark(ptId(p.id), 'new'), mark(nodeId(p.id), 'new')],
          say: `The tree is empty, so ${at(p)} becomes the root. Its vertical line x = ${p.x} splits the plane into a left part and a right part.`,
          lines: ['ins.root'],
          vars: vars(s),
          level: 2,
        };
        continue;
      }
      let cur = byId(s, s.root);
      let placed = false;
      while (!placed) {
        if (dup && same(cur, p)) {
          yield {
            state: s,
            marks: [mark(nodeId(cur.id), 'error'), mark(ptId(cur.id), 'error')],
            say: `${p.name}(${p.x}, ${p.y}) is the same point as ${cur.name}. A set holds each point once, so skip it.`,
            lines: ['ins.dup'],
            vars: vars(s),
            level: 2,
          };
          break;
        }
        const a = axisOf(cur.depth);
        const goLeft = coord(p, a) < coord(cur, a);
        const child = goLeft ? cur.left : cur.right;
        yield {
          state: s,
          marks: [mark(nodeId(cur.id), 'active'), mark(ptId(cur.id), 'active')],
          say: `${cur.name} splits on ${a}. ${p.name}.${a} = ${coord(p, a)} ${goLeft ? '<' : '≥'} ${coord(cur, a)} = ${cur.name}.${a}, so go ${goLeft ? (a === 'x' ? 'left' : 'below') : a === 'x' ? 'right' : 'above'}: the ${goLeft ? 'left' : 'right'} subtree.`,
          lines: ['ins.loop', 'ins.cmp'],
          vars: vars(s, { at: cur.name, axis: a }),
          level: 3,
          extra: { moving: p.id },
        };
        if (child === null) {
          const node: KdNode = { ...p, left: null, right: null, depth: cur.depth + 1 };
          const nodes = s.nodes.map((q) =>
            q.id === cur.id ? { ...q, [goLeft ? 'left' : 'right']: p.id } : q,
          );
          s = { ...s, nodes: [...nodes, node] };
          done.push(p.name);
          const na = axisOf(node.depth);
          yield {
            state: s,
            marks: [mark(ptId(p.id), 'new'), mark(nodeId(p.id), 'new')],
            say: `${cur.name} has no ${goLeft ? 'left' : 'right'} child, so ${at(p)} goes there, at depth ${node.depth}. It splits on ${na}: its ${na === 'x' ? 'vertical' : 'horizontal'} line ${na} = ${coord(p, na)} cuts ${cur.name}'s ${goLeft ? (a === 'x' ? 'left' : 'lower') : a === 'x' ? 'right' : 'upper'} part in two.`,
            lines: [goLeft ? 'ins.left' : 'ins.right'],
            vars: vars(s),
            level: 2,
          };
          placed = true;
        } else {
          cur = byId(s, child);
        }
      }
    }
    const h = height(s);
    yield {
      state: s,
      marks: [],
      say: done.length
        ? `Inserted ${done.join(', ')}. The tree has ${s.nodes.length} point${s.nodes.length === 1 ? '' : 's'} and height ${h}; the splitting lines alternate x, y, x, ... down each path.`
        : 'Nothing new was inserted.',
      lines: [],
      vars: vars(s),
      level: 1,
    };
    return s;
  },
};

// ----- nearest neighbour -----

interface Search {
  s: S;
  settings: KdSettings;
}

function* nearestRec(run: Search, id: number | null, q: Vec): Generator<KStep, void, void> {
  if (id === null) return;
  const n = byId(run.s, id);
  const d2 = dist2(q, n);
  run.s = { ...run.s, visited: [...run.s.visited, id] };
  const better = run.s.bestD2 === null || d2 < run.s.bestD2;
  const prevName = run.s.best === null ? null : byId(run.s, run.s.best).name;
  const prevD2 = run.s.bestD2;
  if (better) run.s = { ...run.s, best: id, bestD2: d2 };
  yield {
    state: run.s,
    marks: [
      mark(nodeId(id), better ? 'found' : 'visit'),
      mark(ptId(id), better ? 'found' : 'visit'),
    ],
    say: better
      ? `Visit ${at(n)}: distance² to q is ${d2}${prevD2 === null ? '' : `, less than ${prevD2}`}. ${n.name} is the best so far${prevName ? ` (it was ${prevName})` : ''}, and the circle around q shrinks to radius √${d2}.`
      : `Visit ${at(n)}: distance² to q is ${d2}, not less than ${prevD2}. The best stays ${prevName}.`,
    lines: ['nn.visit', 'nn.best'],
    vars: nnVars(run.s),
    level: 2,
  };
  const a = axisOf(n.depth);
  const diff = coord(q, a) - coord(n, a);
  const near = diff < 0 ? n.left : n.right;
  const far = diff < 0 ? n.right : n.left;
  const side = (left: boolean) =>
    a === 'x' ? (left ? 'left' : 'right') : left ? 'lower' : 'upper';
  yield {
    state: run.s,
    marks: [mark(nodeId(id), 'active')],
    say: `${n.name} splits on ${a}: q.${a} = ${coord(q, a)} ${diff < 0 ? '<' : '≥'} ${coord(n, a)}, so q is on the ${side(diff < 0)} side. Search that side first${near === null ? ', but it is empty' : ''}.`,
    lines: ['nn.diff', 'nn.near'],
    vars: nnVars(run.s),
    level: 3,
  };
  yield* nearestRec(run, near, q);
  if (far === null) return;
  const crosses = diff * diff < run.s.bestD2!;
  const go = crosses || !run.settings.prune;
  const count = subtree(run.s, far).length;
  const farNode = byId(run.s, far);
  if (!go) run.s = { ...run.s, pruned: [...run.s.pruned, far] };
  yield {
    state: run.s,
    marks: [
      mark(nodeId(id), 'active'),
      mark(nodeId(far), go ? 'compare' : 'stale'),
      mark('gap', crosses ? 'active' : 'error'),
    ],
    say: crosses
      ? `Back at ${n.name}. q is ${Math.abs(diff)} from the line ${a} = ${coord(n, a)}, and ${diff * diff} < ${run.s.bestD2}: the circle crosses the line, so a closer point may hide on the other side. Search ${farNode.name}'s subtree.`
      : run.settings.prune
        ? `Back at ${n.name}. q is ${Math.abs(diff)} from the line ${a} = ${coord(n, a)}, and ${diff * diff} ≥ ${run.s.bestD2}: the circle does not reach the other side. Skip ${farNode.name}'s subtree, ${count} point${count === 1 ? '' : 's'} never looked at.`
        : `Back at ${n.name}. The circle does not reach the other side of ${a} = ${coord(n, a)}, but pruning is off, so search ${farNode.name}'s subtree anyway.`,
    lines: ['nn.test', ...(go ? ['nn.far'] : [])],
    vars: nnVars(run.s),
    level: 2,
    extra: { gap: { node: id, crosses } },
  };
  if (go) yield* nearestRec(run, far, q);
}

const nearest: Op = {
  label: 'Nearest',
  arity: 1,
  *run(s0, [v], { settings }) {
    const q = readPoint(v, MAX);
    if (typeof q === 'string') {
      yield oops(s0, `nearest: ${q}`);
      return s0;
    }
    const run: Search = { s: { ...clean(s0), query: q }, settings };
    if (run.s.root === null) {
      yield oops(
        run.s,
        `nearest(${q.x}, ${q.y}): the tree is empty, so there is no nearest point.`,
      );
      return run.s;
    }
    yield {
      state: run.s,
      marks: [mark('q', 'active')],
      say: `Find the point nearest q = (${q.x}, ${q.y}). Walk down as if inserting q, then back up, checking whether the best circle reaches across each splitting line.`,
      lines: ['nn.sig'],
      vars: nnVars(run.s),
      level: 2,
    };
    yield* nearestRec(run, run.s.root, q);
    const s = run.s;
    const b = byId(s, s.best!);
    const n = s.nodes.length;
    yield {
      state: s,
      marks: [mark(nodeId(b.id), 'found'), mark(ptId(b.id), 'found')],
      say: `The nearest point to (${q.x}, ${q.y}) is ${at(b)}, distance² ${s.bestD2}. The search visited ${s.visited.length} of ${n} nodes${s.pruned.length ? ` and skipped ${s.pruned.length} subtree${s.pruned.length === 1 ? '' : 's'}` : ''}.`,
      lines: ['nn.ret'],
      vars: nnVars(s),
      level: 1,
    };
    return s;
  },
};

// ----- range search -----

function* rangeRec(run: Search, id: number | null, box: Box): Generator<KStep, void, void> {
  if (id === null) return;
  const n = byId(run.s, id);
  const inside = n.x >= box.lo.x && n.x <= box.hi.x && n.y >= box.lo.y && n.y <= box.hi.y;
  run.s = {
    ...run.s,
    visited: [...run.s.visited, id],
    found: inside ? [...run.s.found, id] : run.s.found,
  };
  yield {
    state: run.s,
    marks: [
      mark(nodeId(id), inside ? 'found' : 'visit'),
      mark(ptId(id), inside ? 'found' : 'visit'),
    ],
    say: inside
      ? `Visit ${at(n)}: it is inside the rectangle. Report it.`
      : `Visit ${at(n)}: it is outside the rectangle.`,
    lines: ['rg.visit', 'rg.in'],
    vars: rangeVars(run.s),
    level: 2,
  };
  const a = axisOf(n.depth);
  const split = coord(n, a);
  const lo = coord(box.lo, a);
  const hi = coord(box.hi, a);
  const sides: [boolean, number | null, string][] = [
    [lo < split, n.left, `${a} = ${lo} < ${split}`],
    [hi >= split, n.right, `${a} = ${hi} ≥ ${split}`],
  ];
  for (const [k, [ok, child, why]] of sides.entries()) {
    if (child === null) continue;
    const c = byId(run.s, child);
    const word =
      k === 0 ? (a === 'x' ? 'left of' : 'below') : a === 'x' ? 'right of' : 'on or above';
    if (!ok) {
      const count = subtree(run.s, child).length;
      run.s = { ...run.s, pruned: [...run.s.pruned, child] };
      yield {
        state: run.s,
        marks: [mark(nodeId(id), 'active'), mark(nodeId(child), 'stale')],
        say: `The rectangle has nothing ${word} the line ${a} = ${split}${k === 0 ? `: its lowest ${a} is ${lo}` : `: its highest ${a} is ${hi}`}. Skip ${c.name}'s subtree (${count} point${count === 1 ? '' : 's'}).`,
        lines: [k === 0 ? 'rg.left' : 'rg.right'],
        vars: rangeVars(run.s),
        level: 2,
      };
      continue;
    }
    yield {
      state: run.s,
      marks: [mark(nodeId(id), 'active'), mark(nodeId(child), 'compare')],
      say: `Part of the rectangle is ${word} the line (${why}), so search ${c.name}'s subtree.`,
      lines: [k === 0 ? 'rg.left' : 'rg.right'],
      vars: rangeVars(run.s),
      level: 3,
    };
    yield* rangeRec(run, child, box);
  }
}

const range: Op = {
  label: 'Range search',
  arity: 1,
  *run(s0, [v], { settings }) {
    const box = readBox(v, MAX);
    if (typeof box === 'string') {
      yield oops(s0, `range: ${box}`);
      return s0;
    }
    const run: Search = { s: { ...clean(s0), box }, settings };
    const name = `[${box.lo.x}, ${box.hi.x}] × [${box.lo.y}, ${box.hi.y}]`;
    if (run.s.root === null) {
      yield oops(run.s, `range ${name}: the tree is empty, so nothing is inside.`);
      return run.s;
    }
    yield {
      state: run.s,
      marks: [],
      say: `Report every point in the rectangle ${name}. At each node, go to a side of its line only if the rectangle reaches that side.`,
      lines: ['rg.sig'],
      vars: rangeVars(run.s),
      level: 2,
    };
    yield* rangeRec(run, run.s.root, box);
    const s = run.s;
    yield {
      state: s,
      marks: s.found.map((id) => mark(ptId(id), 'found')),
      say: `${s.found.length ? `Found ${s.found.length}: ${s.found.map((id) => byId(s, id).name).join(', ')}.` : 'No point is inside the rectangle.'} The search visited ${s.visited.length} of ${s.nodes.length} nodes${s.pruned.length ? ` and skipped ${s.pruned.length} subtree${s.pruned.length === 1 ? '' : 's'}` : ''}.`,
      lines: ['rg.ret'],
      vars: rangeVars(s),
      level: 1,
    };
    return s;
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s) {
    const end = init();
    yield {
      state: end,
      marks: [],
      say: s.nodes.length
        ? 'Clear: the tree is empty again.'
        : 'Clear: the tree was already empty.',
      lines: [],
      vars: vars(end),
      level: 1,
    };
    return end;
  },
};

export const ops = { insert, nearest, range, clear };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: KdSettings): PseudoBlock[] {
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'INSERT(T, p)', 'To insert the point p:'),
        L('ins.root', 1, 'if T.root == NIL: T.root = p; return', 'An empty tree: p is the root.'),
        L(
          'ins.loop',
          1,
          'x = T.root; for each node x on the way down',
          'Start at the root and walk down.',
        ),
        L('ins.dup', 2, 'if p == x: return', 'The same point is already there: stop.'),
        L(
          'ins.cmp',
          2,
          'a = x.depth mod 2 (x, then y); if p[a] < x[a]',
          'Compare on x at even depths and on y at odd depths. Smaller goes left,',
        ),
        L(
          'ins.left',
          3,
          'go left, or hang p there if x.left == NIL',
          'go left; if there is no left child, p goes there.',
        ),
        L(
          'ins.right',
          2,
          'else go right, or hang p there if x.right == NIL',
          'Otherwise go right; if there is no right child, p goes there.',
        ),
      ],
    },
    {
      op: 'nearest',
      lines: [
        L('nn.sig', 0, 'NEAREST(x, q)', 'To find the point nearest q, starting at node x:'),
        L('nn.visit', 1, 'if x == NIL: return', 'Nothing here: go back.'),
        L(
          'nn.best',
          1,
          'if dist²(q, x) < best: best = dist²(q, x); nearest = x',
          'If x is closer than the best so far, it is the new best.',
        ),
        L(
          'nn.diff',
          1,
          'a = x.depth mod 2; diff = q[a] − x[a]',
          'How far q is from x’s splitting line, and on which side.',
        ),
        L('nn.near', 1, 'NEAREST(diff < 0 ? x.left : x.right, q)', 'Search q’s own side first.'),
        settings.prune
          ? L(
              'nn.test',
              1,
              'if diff² < best',
              'If the best circle crosses the line, the other side may hold a closer point:',
            )
          : L(
              'nn.test',
              1,
              'always (pruning is off)',
              'With pruning off, always search the other side too:',
            ),
        L('nn.far', 2, 'NEAREST(the other child, q)', 'search the other side.'),
        L('nn.ret', 1, 'return nearest', 'The best point found is the nearest.'),
      ],
    },
    {
      op: 'range',
      lines: [
        L('rg.sig', 0, 'RANGE(x, R)', 'To report the points in the rectangle R, from node x:'),
        L('rg.visit', 1, 'if x == NIL: return', 'Nothing here: go back.'),
        L('rg.in', 1, 'if x is inside R: report x', 'If x is in the rectangle, report it.'),
        L(
          'rg.left',
          1,
          'a = x.depth mod 2; if R.lo[a] < x[a]: RANGE(x.left, R)',
          'If the rectangle reaches the smaller side of x’s line, search the left subtree.',
        ),
        L(
          'rg.right',
          1,
          'if R.hi[a] ≥ x[a]: RANGE(x.right, R)',
          'If it reaches the larger side, search the right subtree.',
        ),
        L('rg.ret', 1, 'return the reported points', 'Every reported point is in R.'),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'An empty 2-d tree. Type points such as 6,5 3,8 9,2 and press Insert, or pick a preset. Then try Nearest with one point, or Range search with two corners.';
}

export function initialVars(state: S) {
  return vars(state);
}

export function describe(state: S): string {
  if (state.nodes.length === 0 && state.pending.length === 0) return 'An empty 2-d tree.';
  const lines = (id: number | null, out: string[]) => {
    if (id === null) return;
    const n = byId(state, id);
    const kids = [n.left, n.right].map((c) => (c === null ? '-' : byId(state, c).name));
    out.push(`${at(n)} splits on ${axisOf(n.depth)}, children ${kids.join(' and ')}`);
    lines(n.left, out);
    lines(n.right, out);
  };
  const out: string[] = [];
  lines(state.root, out);
  const wait = state.pending.length
    ? ` Waiting to be inserted: ${state.pending.map((p) => p.name).join(', ')}.`
    : '';
  const extra =
    state.best !== null
      ? ` Nearest to (${state.query!.x}, ${state.query!.y}) so far: ${byId(state, state.best).name}.`
      : state.box
        ? ` In the rectangle: ${state.found.map((id) => byId(state, id).name).join(', ') || 'none'}.`
        : '';
  return `A 2-d tree of ${state.nodes.length} points. ${out.join('; ')}.${wait}${extra}`;
}

/** The tree the running insert will end with: the current one plus the pending points. */
export function finalTree(s: S): S {
  let t = s;
  for (const p of s.pending) {
    if (t.nodes.some((q) => same(q, p))) continue;
    if (t.root === null) {
      t = { ...t, nodes: [{ ...p, left: null, right: null, depth: 0 }], root: p.id };
      continue;
    }
    let cur = byId(t, t.root);
    for (;;) {
      const a = axisOf(cur.depth);
      const goLeft = coord(p, a) < coord(cur, a);
      const child = goLeft ? cur.left : cur.right;
      if (child === null) {
        const parent = cur;
        t = {
          ...t,
          nodes: [
            ...t.nodes.map((q) =>
              q.id === parent.id ? { ...q, [goLeft ? 'left' : 'right']: p.id } : q,
            ),
            { ...p, left: null, right: null, depth: parent.depth + 1 },
          ],
        };
        break;
      }
      cur = byId(t, child);
    }
  }
  return t;
}
