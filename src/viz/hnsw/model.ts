/**
 * HNSW, hierarchical navigable small world graphs (Malkov and Yashunin 2018), on at most 12
 * points with whole-number coordinates from 0 to 10, so every squared distance is a whole
 * number.
 *
 * Every point lives on layer 0 and on the layers up to a level drawn at random when it is
 * inserted, as in a skip list: level = ⌊−ln(u) · mL⌋ for a uniform u in (0, 1] and
 * mL = 1/ln(M), so a point reaches layer l with chance M^−l. Each layer is a graph: every node
 * keeps a list of neighbours on each layer it is on, at most M (2M on layer 0).
 *
 *   SEARCH-LAYER(q, entry points, ef, layer)   (the paper's Algorithm 2) a best-first search
 *       that keeps C, the candidates still to expand, and W, the ef nearest found so far; it
 *       stops when the nearest candidate is farther than the farthest of W
 *   INSERT(q)    (Algorithm 1) draw a level; from the entry point go greedily down the layers
 *       above it (ef = 1); on each layer it joins, search with efConstruction, link q to its M
 *       nearest (Algorithm 3, the simple selection) and link them back; a neighbour with too
 *       many links keeps only its nearest; a new top level makes q the entry point
 *   SEARCH(q)    (Algorithm 5) greedy (ef = 1) down to layer 1, then SEARCH-LAYER on layer 0
 *       with ef; the K = 3 nearest of W are the answer, checked against brute force
 *
 * Order: every list is ordered by (squared distance, id); the point inserted first wins a tie.
 * A node's neighbour list keeps the order links were made in. The levels stop at 3, so the
 * drawing has at most four layers.
 *
 * Settings: M (links per node and layer, 2 to 4) and ef (the search's list on layer 0, 1 to 8).
 * efConstruction is 4.
 */
import type { Mark, MarkRole, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import type { Vec } from '../../layouts/plane';
import { two } from '../_lm/numbers';
import { d2, nameOf, pointsFrom, type Pt } from '../_retrieve/points';

export const MOST = 12;
export const TOP = 3;
export const K = 3;
export const EF_C = 4;

export interface HnswSettings {
  [key: string]: Scalar;
  M: number;
  ef: number;
}

export const defaults: HnswSettings = { M: 2, ef: 3 };

export interface HNode extends Pt {
  level: number;
  /** links[l]: the out-neighbours on layer l, for l = 0 to level. */
  links: number[][];
}

export interface SearchDone {
  kind: 'search';
  q: Vec;
  found: number[];
  truth: number[];
  /** The nodes the search stood on above layer 0, from the entry point down. */
  path: number[];
  dists: number;
  ef: number;
}

export interface InsertDone {
  kind: 'insert';
  id: number;
  /** The new node's links on each layer, layer 0 first, when it was inserted. */
  links: number[][];
  dists: number;
}

export interface HnswState {
  nodes: HNode[];
  entry: number | null;
  /** The last search or insert, drawn until the next operation. */
  last?: SearchDone | InsertDone;
}

/** What one step of an insert or a search shows. */
export interface HnswExtra {
  q?: Vec;
  /** The node being inserted (its id), drawn on the layers it has joined so far. */
  newId?: number;
  layer?: number;
  /** The node being expanded. */
  cur?: number;
  /** C and W, nearest first, with squared distances. */
  cand?: [number, number][];
  found?: [number, number][];
  visited?: number[];
  /** The neighbour being looked at. */
  seen?: number;
  /** The level drawn. */
  draw?: { u: number; raw: number; level: number; capped: boolean };
  /** Links just made, and a link just dropped. */
  linked?: { layer: number; ids: number[] };
  dropped?: { layer: number; from: number; to: number };
  dists?: number;
  /** A search's greedy path down the upper layers so far. */
  path?: number[];
  /** One insert of several finished (for the code tabs). */
  done?: InsertDone;
}

type S = HnswState;
type X = HnswExtra;
type Op = OpSpec<S, HnswSettings, X>;
type HStep = Step<S, X>;

export const mOf = (s: HnswSettings) => Math.max(2, Math.min(4, Math.round(s.M)));
export const efOf = (s: HnswSettings) => Math.max(1, Math.min(8, Math.round(s.ef)));
export const maxLinks = (m: number, layer: number) => (layer === 0 ? 2 * m : m);
export const nodeId = (layer: number, id: number) => `n${layer}-${id}`;
export const queryId = (layer: number) => `q${layer}`;
const mark = (id: string, role: MarkRole): Mark => ({ id, role });

export function init(): S {
  return { nodes: [], entry: null };
}

export const topOf = (s: S) => (s.entry === null ? -1 : s.nodes[s.entry]!.level);
const copy = (s: S): S => ({
  nodes: s.nodes.map((n) => ({ ...n, links: n.links.map((l) => [...l]) })),
  entry: s.entry,
  last: s.last,
});

/** (d, id) before (d', id'). */
const before = (a: [number, number], b: [number, number]) =>
  a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
const byNear = (a: [number, number], b: [number, number]) =>
  before(a, b) ? -1 : before(b, a) ? 1 : 0;

/** The level for a draw u in (0, 1]: ⌊−ln(u)/ln(M)⌋, stopped at TOP. */
export function levelFor(u: number, m: number) {
  // Math.max turns −0 (from u = 1) into 0.
  const raw = Math.max(0, -Math.log(u) / Math.log(m));
  const level = Math.floor(raw);
  return { u, raw, level: Math.min(TOP, level), capped: level > TOP };
}

/** The K nearest points to q by brute force: every point measured. */
export function bruteForce(nodes: readonly Pt[], q: Vec, k = K): number[] {
  return nodes
    .map((n) => [d2(q, n), n.id] as [number, number])
    .sort(byNear)
    .slice(0, k)
    .map(([, id]) => id);
}

// ---------------------------------------------------------------------------------------------
// Narration

const nm = (s: S, id: number) => s.nodes[id]!.name;
const listText = (s: S, xs: readonly [number, number][]) =>
  xs.length ? xs.map(([d, id]) => `${nm(s, id)} ${d}`).join(', ') : 'nothing';
const pointText = (q: Vec) => `(${q.x}, ${q.y})`;

export function vars(
  s: S,
  set: HnswSettings,
  extra: Record<string, Scalar> = {},
): Record<string, Scalar> {
  return {
    N: s.nodes.length,
    'top layer': Math.max(0, topOf(s)),
    M: mOf(set),
    ef: efOf(set),
    ...extra,
  };
}

// ---------------------------------------------------------------------------------------------
// SEARCH-LAYER, as steps

interface Ctx {
  /** Graph as drawn in these steps: a snapshot, never changed while the steps are in use. */
  s: S;
  set: HnswSettings;
  q: Vec;
  newId?: number;
  dists: { n: number };
  /** Step level of an expansion; looking at a neighbour is level 3. */
  level: 2 | 3;
  /** Upper layers (ef = 1) narrate as greedy moves. */
  greedy: boolean;
  /** The pseudocode line of a greedy layer. */
  greedyLine: string;
  path?: number[];
}

function* searchLayer(
  ctx: Ctx,
  eps: [number, number][],
  ef: number,
  layer: number,
): Generator<HStep, [number, number][], void> {
  const { s, q } = ctx;
  const visited = new Set(eps.map(([, id]) => id));
  let cand = [...eps].sort(byNear);
  let found = [...eps].sort(byNear);
  const step = (
    say: string,
    lines: string[],
    level: 2 | 3,
    marks: Mark[],
    o: Partial<X> = {},
  ): HStep => ({
    state: s,
    marks,
    say,
    lines,
    level,
    vars: { ...vars(s, ctx.set), 'distance computations': ctx.dists.n },
    extra: {
      q,
      newId: ctx.newId,
      layer,
      cand: [...cand],
      found: [...found],
      visited: [...visited],
      dists: ctx.dists.n,
      path: ctx.path ? [...ctx.path] : undefined,
      ...o,
    },
  });
  const marksFor = (cur?: number): Mark[] => {
    const roles = new Map<number, MarkRole>();
    for (const id of visited) roles.set(id, 'visit');
    for (const [, id] of cand) roles.set(id, 'compare');
    for (const [, id] of found) roles.set(id, 'found');
    if (cur !== undefined) roles.set(cur, 'active');
    return [...roles].map(([id, role]) => mark(nodeId(layer, id), role));
  };
  const words = (o: [number, number]) => `${nm(s, o[1])} (d² ${o[0]})`;

  while (cand.length) {
    const c = cand.shift()!;
    const f = found.at(-1)!;
    if (before(f, c)) {
      if (!ctx.greedy)
        yield step(
          `The nearest candidate left, ${words(c)}, is farther than the farthest of the ${found.length} found, ${words(f)}. Nothing it leads to can get into the list: stop.`,
          ['lstop'],
          ctx.level,
          marksFor(),
        );
      break;
    }
    if (ctx.greedy) ctx.path?.push(c[1]);
    const nbrs = s.nodes[c[1]]!.links[layer] ?? [];
    yield step(
      ctx.greedy
        ? `Layer ${layer}: stand on ${words(c)} and look at its ${nbrs.length} neighbour${nbrs.length === 1 ? '' : 's'} here for one closer to ${pointText(q)}.`
        : `Expand ${words(c)}, the nearest candidate: look at its ${nbrs.length} neighbour${nbrs.length === 1 ? '' : 's'} on layer ${layer}.`,
      [ctx.greedy ? ctx.greedyLine : 'lpop'],
      ctx.level,
      marksFor(c[1]),
      { cur: c[1] },
    );
    for (const e of nbrs) {
      if (visited.has(e)) {
        yield step(
          `${nm(s, e)} was seen already on this layer: skip it, no distance needed.`,
          ['lseen'],
          3,
          [...marksFor(c[1]), mark(nodeId(layer, e), 'stale')],
          { cur: c[1], seen: e },
        );
        continue;
      }
      visited.add(e);
      const de = d2(q, s.nodes[e]!);
      ctx.dists.n++;
      const far = found.at(-1)!;
      const roomy = found.length < ef;
      const keep = roomy || before([de, e], far);
      let say: string;
      if (keep) {
        cand = [...cand, [de, e] as [number, number]].sort(byNear);
        found = [...found, [de, e] as [number, number]].sort(byNear);
        const drop = found.length > ef ? found.pop()! : null;
        say = ctx.greedy
          ? `${nm(s, e)}: d² ${de}, closer than ${words(far)}. ${nm(s, e)} is the best so far.`
          : `${nm(s, e)}: d² ${de}. ${roomy ? `The list holds fewer than ef = ${ef}` : `Closer than the farthest found, ${words(far)}`}, so ${nm(s, e)} goes into both lists.${drop ? ` That makes ${ef + 1}: drop the farthest, ${words(drop)}.` : ''}`;
      } else {
        say = ctx.greedy
          ? `${nm(s, e)}: d² ${de}, no closer than ${words(far)}.`
          : `${nm(s, e)}: d² ${de}, no closer than the farthest of the ${ef} found, ${words(far)}. Leave it out.`;
      }
      yield step(
        say,
        [keep ? 'ladd' : 'lsee'],
        3,
        [...marksFor(c[1]), mark(nodeId(layer, e), keep ? 'new' : 'stale')],
        { cur: c[1], seen: e },
      );
    }
  }
  if (ctx.greedy) {
    const best = found[0]!;
    yield step(
      `Layer ${layer}: no neighbour of ${nm(s, best[1])} is closer, so ${words(best)} is as near as this layer gets.${layer > 0 ? ` Go down to layer ${layer - 1} and start from ${nm(s, best[1])}.` : ''}`,
      [ctx.greedyLine],
      ctx.level,
      [...marksFor(), mark(nodeId(layer, best[1]), 'found')],
      { cur: best[1] },
    );
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// Operations

function stop(s: S, set: HnswSettings, say: string): HStep {
  return { state: s, marks: [], say, lines: [], level: 1, vars: vars(s, set) };
}

/** One insert, as steps. Returns the graph after it. */
function* insertOne(
  s0: S,
  set: HnswSettings,
  p: Vec,
  u: number,
  many: boolean,
): Generator<HStep, S, void> {
  const m = mOf(set);
  const s = copy(s0);
  const id = s.nodes.length;
  const draw = levelFor(u, m);
  const level = draw.level;
  const node: HNode = {
    id,
    name: nameOf(id + 1),
    x: p.x,
    y: p.y,
    level,
    links: Array.from({ length: level + 1 }, () => []),
  };
  // Inside an insert of several points, each insert's steps are one level finer.
  const lv = (l: 1 | 2 | 3): 1 | 2 | 3 => (many ? (Math.min(3, l + 1) as 2 | 3) : l);
  const dists = { n: 0 };
  const mL = 1 / Math.log(m);
  const top = topOf(s);
  s.nodes.push(node);
  s.last = undefined;
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    marks: Mark[],
    extra: X,
  ): HStep => ({
    state: copy(s),
    marks,
    say,
    lines,
    level,
    vars: { ...vars(s, set), 'distance computations': dists.n },
    extra: { q: p, newId: id, dists: dists.n, ...extra },
  });

  yield step(
    `Insert ${node.name} ${pointText(p)}. Draw its level, as a skip list flips coins: u = ${two(u)}, level = ⌊−ln(u) · mL⌋ = ⌊${two(-Math.log(u))} × ${two(mL)}⌋ = ${Math.floor(draw.raw)}${draw.capped ? `, stopped at ${TOP} on this page` : ''}. ${node.name} lives on layer${level === 0 ? ' 0 only' : `s 0 to ${level}`}. With M = ${m}, a point reaches layer 1 with chance 1/${m}, layer 2 with chance 1/${m * m}.`,
    ['ilevel'],
    lv(2),
    [mark(nodeId(0, id), 'new')],
    { draw },
  );

  if (s.entry === null) {
    s.entry = id;
    const done: InsertDone = { kind: 'insert', id, links: node.links.map((l) => [...l]), dists: 0 };
    s.last = done;
    yield step(
      `The graph was empty: ${node.name} becomes the entry point, where every search starts, on layer ${level}.`,
      ['ientry'],
      many ? 2 : 1,
      [mark(nodeId(level, id), 'found')],
      { done },
    );
    return s;
  }

  const entry = s.entry;
  const de = d2(p, s.nodes[entry]!);
  dists.n++;
  let eps: [number, number][] = [[de, entry]];
  yield step(
    `Start at the entry point ${nm(s, entry)} on layer ${top}, at d² ${de} from ${node.name}.${top > level ? ` On the layers above ${level}, ${node.name} only needs a good place to start: go greedily toward it.` : ''}`,
    ['istart'],
    lv(2),
    [mark(nodeId(top, entry), 'active')],
    { layer: top, cur: entry, found: eps, cand: eps, visited: [entry] },
  );
  // Each layer's search reads a snapshot, so its steps keep the graph as it was then.
  const ctx = (greedy: boolean): Ctx => ({
    s: copy(s),
    set,
    q: p,
    newId: id,
    dists,
    level: many || !greedy ? 3 : 2,
    greedy,
    greedyLine: 'igreedy',
  });
  for (let layer = top; layer > level; layer--) {
    const w = yield* searchLayer(ctx(true), eps, 1, layer);
    eps = w.slice(0, 1);
  }
  for (let layer = Math.min(top, level); layer >= 0; layer--) {
    const w = yield* searchLayer(ctx(false), eps, EF_C, layer);
    const nbrs = w.slice(0, m).map(([, i]) => i);
    node.links[layer] = [...nbrs];
    for (const e of nbrs) s.nodes[e]!.links[layer]!.push(id);
    yield step(
      `Layer ${layer}: the search found ${listText(s, w)} (efConstruction = ${EF_C}). Link ${node.name} to the ${nbrs.length === m ? `M = ${m}` : nbrs.length} nearest, ${nbrs.map((i) => nm(s, i)).join(' and ')}, and link ${nbrs.length === 1 ? 'it' : 'them'} back to ${node.name}.`,
      ['ilink'],
      lv(2),
      [
        ...w.map(([, i]) => mark(nodeId(layer, i), 'found')),
        ...nbrs.map((i) => mark(nodeId(layer, i), 'new')),
        mark(nodeId(layer, id), 'active'),
      ],
      { layer, found: w, linked: { layer, ids: nbrs } },
    );
    const limit = maxLinks(m, layer);
    for (const e of nbrs) {
      const en = s.nodes[e]!;
      if (en.links[layer]!.length <= limit) continue;
      const ranked = en.links[layer]!.map((j) => [d2(en, s.nodes[j]!), j] as [number, number]).sort(
        byNear,
      );
      const gone = ranked[limit]!;
      en.links[layer] = ranked.slice(0, limit).map(([, j]) => j);
      const back = s.nodes[gone[1]]!.links[layer]!.includes(e);
      yield step(
        `${en.name} now has ${limit + 1} links on layer ${layer}, more than ${layer === 0 ? `2M = ${limit}` : `M = ${limit}`}. It keeps its ${limit} nearest and drops ${nm(s, gone[1])} (d² ${gone[0]} from ${en.name}).${back ? ` ${nm(s, gone[1])} still links to ${en.name}: links go one way.` : ''}`,
        ['ishrink'],
        lv(2),
        [mark(nodeId(layer, e), 'active'), mark(nodeId(layer, gone[1]), 'remove')],
        { layer, dropped: { layer, from: e, to: gone[1] } },
      );
    }
    eps = w;
  }
  const newTop = level > top;
  if (newTop) s.entry = id;
  const done: InsertDone = {
    kind: 'insert',
    id,
    links: node.links.map((l) => [...l]),
    dists: dists.n,
  };
  s.last = done;
  yield step(
    `${node.name} is in, after ${dists.n} distance computation${dists.n === 1 ? '' : 's'}. Its links: ${node.links
      .map((l, i) => `layer ${i}: ${l.map((j) => nm(s, j)).join(', ') || 'none'}`)
      .reverse()
      .join(
        '; ',
      )}.${newTop ? ` Its level, ${level}, is above the old top (${top}), so ${node.name} is the new entry point.` : ''}`,
    [newTop ? 'ientry' : 'iret'],
    many ? 2 : 1,
    [mark(nodeId(0, id), 'found')],
    { done },
  );
  return s;
}

const insertOp: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, args, { settings, rng }) {
    const pts = pointsFrom(args[0], rng, MOST);
    if (typeof pts === 'string') {
      yield stop(s, settings, pts);
      return s;
    }
    const fresh: Vec[] = [];
    const skipped: string[] = [];
    for (const p of pts) {
      const dup = [...s.nodes, ...fresh].some((n) => n.x === p.x && n.y === p.y);
      if (dup) skipped.push(pointText(p));
      else fresh.push(p);
    }
    const room = MOST - s.nodes.length;
    if (!fresh.length || room <= 0) {
      yield stop(
        s,
        settings,
        room <= 0
          ? `The graph holds at most ${MOST} points on this page. Clear it to start again.`
          : `${skipped.join(', ')} ${skipped.length === 1 ? 'is' : 'are'} in the graph already.`,
      );
      return s;
    }
    const todo = fresh.slice(0, room);
    let cur = s;
    for (const p of todo) cur = yield* insertOne(cur, settings, p, 1 - rng.next(), todo.length > 1);
    if (todo.length > 1 || skipped.length || fresh.length > todo.length) {
      const out = [
        ...(skipped.length
          ? [`${skipped.join(', ')} ${skipped.length === 1 ? 'was' : 'were'} in the graph already`]
          : []),
        ...(fresh.length > todo.length
          ? [`only ${room} fit, so ${fresh.length - todo.length} were left out`]
          : []),
      ];
      const levels = [0, 1, 2, 3].map((l) => cur.nodes.filter((n) => n.level >= l).length);
      yield {
        state: cur,
        marks: cur.nodes.slice(s.nodes.length).map((n) => mark(nodeId(0, n.id), 'new')),
        say: `Inserted ${todo.length} point${todo.length === 1 ? '' : 's'}.${out.length ? ` (${out.join('; ')}.)` : ''} Nodes per layer: ${levels
          .map((c, l) => `${l}: ${c}`)
          .filter((_, l) => l <= Math.max(0, topOf(cur)))
          .join(', ')}. Each layer up has about 1/M as many, like the levels of a skip list.`,
        lines: ['iret'],
        level: 1,
        vars: vars(cur, settings),
      };
    }
    return cur;
  },
};

/** A query point typed as "x,y". */
export function readQuery(v: Value | undefined): Vec | string {
  if (typeof v !== 'string' || !/^\s*\(?\s*\d+\s*,\s*\d+\s*\)?\s*$/.test(v))
    return 'Search takes one point, such as 4,7.';
  const [x, y] = v
    .replace(/[()\s]/g, '')
    .split(',')
    .map(Number) as [number, number];
  if (x > 10 || y > 10) return 'Keep coordinates from 0 to 10.';
  return { x, y };
}

const searchOp: Op = {
  label: 'Search',
  arity: 1,
  *run(s0, args, { settings }) {
    if (s0.entry === null) {
      yield stop(s0, settings, 'The graph is empty. Insert some points first.');
      return s0;
    }
    const q = readQuery(args[0]);
    if (typeof q === 'string') {
      yield stop(s0, settings, q);
      return s0;
    }
    const s: S = { ...s0, last: undefined };
    const ef = efOf(settings);
    const dists = { n: 0 };
    const path: number[] = [];
    const vx = () => ({ 'distance computations': dists.n });
    const top = topOf(s);
    const entry = s.entry!;
    const de = d2(q, s.nodes[entry]!);
    dists.n++;
    path.push(entry);
    let eps: [number, number][] = [[de, entry]];
    yield {
      state: s,
      marks: [mark(nodeId(top, entry), 'active')],
      say: `Search for the ${K} nearest to ${pointText(q)}. Start at the entry point ${nm(s, entry)} on the top layer, ${top}, at d² ${de}.${top > 0 ? ' The upper layers have few nodes and long links: go greedily, always to a closer neighbour.' : ' There is only layer 0.'}`,
      lines: ['sstart'],
      level: 2,
      vars: { ...vars(s, settings), ...vx() },
      extra: { q, layer: top, cur: entry, cand: eps, found: eps, visited: [entry], dists: 1 },
    };
    for (let layer = top; layer > 0; layer--) {
      const w = yield* searchLayer(
        { s, set: settings, q, dists, level: 2, greedy: true, greedyLine: 'gdown', path },
        eps,
        1,
        layer,
      );
      eps = w.slice(0, 1);
    }
    if (top > 0)
      yield {
        state: s,
        marks: [mark(nodeId(0, eps[0]![1]), 'active')],
        say: `Layer 0 holds every point. Start from ${nm(s, eps[0]![1])} (d² ${eps[0]![0]}) and ${ef === 1 ? 'keep only the nearest found so far (ef = 1): plain greedy search, as on the layers above.' : `keep the ef = ${ef} nearest found so far, not just one: a beam, as in beam search.`}`,
        lines: ['sbase'],
        level: 2,
        vars: { ...vars(s, settings), ...vx() },
        extra: {
          q,
          layer: 0,
          cur: eps[0]![1],
          cand: eps,
          found: eps,
          visited: [eps[0]![1]],
          dists: dists.n,
          path: [...path],
        },
      };
    const w = yield* searchLayer(
      { s, set: settings, q, dists, level: 2, greedy: false, greedyLine: 'gdown', path },
      eps,
      ef,
      0,
    );
    const found = w.slice(0, K).map(([, id]) => id);
    const truth = bruteForce(s.nodes, q);
    const hit = found.filter((id) => truth.includes(id)).length;
    const want = Math.min(K, s.nodes.length);
    const done: SearchDone = {
      kind: 'search',
      q,
      found,
      truth,
      path: dedupe(path),
      dists: dists.n,
      ef,
    };
    const next: S = { ...s, last: done };
    const names = (xs: number[]) => xs.map((id) => nm(s, id)).join(', ');
    const missed = truth.filter((id) => !found.includes(id));
    yield {
      state: next,
      marks: [],
      say: `HNSW returns ${names(found)}, after ${dists.n} distance computation${dists.n === 1 ? '' : 's'}. Brute force measures ${s.nodes.length === 1 ? 'the one point' : `all ${s.nodes.length}`} and gets ${names(truth)}. Recall ${hit}/${want}${missed.length ? `: it missed ${names(missed)}${ef < K ? `, and with ef = ${ef} it could return at most ${ef}` : ''}` : ''}.`,
      lines: ['sret'],
      level: 1,
      vars: {
        ...vars(next, settings),
        'distance computations': dists.n,
        'brute force': s.nodes.length,
        recall: Math.round((100 * hit) / want) / 100,
      },
    };
    return next;
  },
};

const dedupe = (xs: number[]) => xs.filter((x, i) => i === 0 || xs[i - 1] !== x);

const clearOp: Op = {
  label: 'Clear',
  arity: 0,
  *run(_s, _args, { settings }) {
    const next = init();
    yield stop(next, settings, 'The graph is empty.');
    return next;
  },
};

export const ops = { insert: insertOp, search: searchOp, clear: clearOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(set: HnswSettings): PseudoBlock[] {
  const m = mOf(set);
  const layer = [
    L('lsig', 0, 'SEARCH-LAYER(q, entry points, ef, layer)', 'Search one layer:'),
    L('lpop', 1, 'while C is not empty: c = nearest in C', 'expand the nearest candidate,'),
    L(
      'lstop',
      2,
      'if c is farther than the farthest in W: stop',
      'unless it is farther than everything kept;',
    ),
    L('lsee', 2, 'for each unvisited neighbour e of c', 'measure each new neighbour;'),
    L('lseen', 3, '(a visited e is skipped)', 'one already seen is skipped.'),
    L(
      'ladd',
      3,
      'if e is nearer than the farthest in W, or |W| < ef: add e to C and W; trim W to ef',
      'Keep it if it beats the worst kept.',
    ),
  ];
  return [
    {
      op: 'insert',
      lines: [
        L('isig', 0, `INSERT(q)   // M = ${m}, efConstruction = ${EF_C}`, 'Add a point:'),
        L(
          'ilevel',
          1,
          'l = ⌊−ln(u) · mL⌋, mL = 1/ln M',
          'draw how many layers it joins, like skip-list coin flips;',
        ),
        L('istart', 1, 'ep = entry point; L = its level', 'start at the top;'),
        L(
          'igreedy',
          1,
          'for layers L down to l + 1: ep = SEARCH-LAYER(q, ep, 1)',
          'go greedily down to its top layer;',
        ),
        L(
          'ilink',
          1,
          'for layers min(L, l) down to 0: W = SEARCH-LAYER(q, ep, efConstruction); link q to its M nearest in W, both ways',
          'on each of its layers, find near points and link to the M nearest;',
        ),
        L(
          'ishrink',
          2,
          `a neighbour with over M links (2M on layer 0) keeps its nearest`,
          'a node with too many links drops its farthest;',
        ),
        L(
          'ientry',
          1,
          'if l > L: q is the new entry point',
          'a point taller than the rest becomes the entry point.',
        ),
        L('iret', 1, 'return', 'Done.'),
        ...layer,
      ],
    },
    {
      op: 'search',
      lines: [
        L('ssig', 0, `SEARCH(q, K = ${K}, ef = ${efOf(set)})`, 'Find the nearest points:'),
        L('sstart', 1, 'ep = entry point', 'start at the top;'),
        L(
          'gdown',
          1,
          'for layers L down to 1: ep = SEARCH-LAYER(q, ep, 1)',
          'go greedily down the upper layers;',
        ),
        L('sbase', 1, 'W = SEARCH-LAYER(q, ep, ef, 0)', 'on layer 0, search with a list of ef;'),
        L(
          'sret',
          1,
          'return the K nearest in W',
          'answer with the nearest K, and compare with brute force.',
        ),
        ...layer,
      ],
    },
    { op: 'clear', lines: [L('csig', 0, 'CLEAR()', 'Start again with no points.')] },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words

export function initialSay(): string {
  return 'No points yet. Insert some (type them, or a count for random ones): each one joins layer 0 and maybe a few layers above it. Then Search: greedy steps down the sparse upper layers, then a search with a list of ef on layer 0.';
}

export const initialVars = (s: S, set: HnswSettings) => vars(s, set);

export function describe(s: S): string {
  if (!s.nodes.length) return 'An empty graph.';
  if (s.entry === null)
    return `${s.nodes[0]!.name}(${s.nodes[0]!.x}, ${s.nodes[0]!.y}), the first point, is being inserted.`;
  const layers = Array.from({ length: topOf(s) + 1 }, (_, l) => {
    const on = s.nodes.filter((n) => n.level >= l);
    return `Layer ${l}: ${on.map((n) => `${n.name}(${n.x}, ${n.y}) → ${n.links[l]!.map((j) => s.nodes[j]!.name).join(' ') || 'none'}`).join('; ')}`;
  });
  const last =
    s.last?.kind === 'search'
      ? ` Last search for (${s.last.q.x}, ${s.last.q.y}) returned ${s.last.found.map((id) => s.nodes[id]!.name).join(', ')}.`
      : '';
  return `Entry point ${s.nodes[s.entry!]!.name}. ${layers.join('. ')}.${last}`;
}
