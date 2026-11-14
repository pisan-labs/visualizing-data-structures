/**
 * IVF, the inverted file index (the coarse quantizer of Jégou, Douze and Schmid 2011, as in
 * Faiss's IndexIVFFlat), on at most 12 points with whole-number coordinates from 0 to 10.
 *
 *   train    k-means (the k-means page's own Lloyd's algorithm, k-means++ seeding, an empty
 *            centre jumps to the farthest point) finds `lists` centres; every point goes into the
 *            list of its nearest centre. The lists are the cells of a Voronoi diagram.
 *   search   compare the query with every list centre, then measure every point in the nprobe
 *            nearest lists and keep the K = 3 nearest. Brute force measures every point; the
 *            answer is exact when the two agree.
 *
 * Distances are squared Euclidean distances. Ties: a point nearest two centres joins the one with
 * the lower number (as in k-means); lists are ranked by (d² to the query, number); points by
 * (d², the order they were loaded).
 *
 * Operations: load (points), train, search (one point).
 */
import type { Mark, MarkRole, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import type { Vec } from '../../layouts/plane';
import {
  cName,
  init as kmInit,
  nearest,
  num,
  ops as kmOps,
  wcss,
  type KmSettings,
  type KmState,
} from '../k-means/model';
import { d2, named, pointsFrom, ptText, type Pt } from '../_retrieve/points';

export { cName, num };

export const MOST = 12;
export const K = 3;
export const MAX_LISTS = 5;

export interface IvfSettings {
  [key: string]: Scalar;
  lists: number;
  nprobe: number;
}

export const defaults: IvfSettings = { lists: 3, nprobe: 1 };

export interface Centre {
  /** 1 to the number of lists: drawn as c1, c2... */
  id: number;
  x: number;
  y: number;
}

/** The last search, drawn until the next operation. */
export interface SearchDone {
  q: Vec;
  /** d² from q to every centre. */
  centreD: number[];
  /** List indices, nearest centre first. */
  order: number[];
  /** The lists searched: the first nprobe of `order`. */
  probed: number[];
  /** The K nearest found, as point indices, nearest first. */
  found: number[];
  /** The K nearest of all (brute force). */
  truth: number[];
  /** Distance computations: one per centre, one per point in a probed list. */
  dists: number;
}

export interface IvfState {
  points: Pt[];
  /** The list centres; empty until the index is trained. */
  centres: Centre[];
  /** lists[j]: the points (indices) in centre j's list, in the order they were loaded. */
  lists: number[][];
  /** The points k-means++ chose as starting centres, in order (for the code tabs). */
  seeds: number[];
  /** k-means assignment rounds, and its distance computations, in the last training. */
  rounds: number;
  work: number;
  last?: SearchDone;
}

/** What one step of a search shows. */
export interface IvfExtra {
  q?: Vec;
  centreD?: number[];
  order?: number[];
  probed?: number[];
  /** The list being searched, and the point being measured. */
  scanning?: number;
  seen?: number;
  /** The K nearest so far, (d², point index), nearest first. */
  top?: [number, number][];
  /** Points measured so far. */
  scanned?: number[];
  dists?: number;
  /** Training: where moved centres came from. */
  moved?: { id: number; from: Vec }[];
}

type S = IvfState;
type X = IvfExtra;
type Op = OpSpec<S, IvfSettings, X>;
type IStep = Step<S, X>;
type Gen = Generator<IStep, S, void>;

export const listsOf = (s: IvfSettings) => Math.max(1, Math.min(MAX_LISTS, Math.round(s.lists)));
export const nprobeOf = (s: IvfSettings) => Math.max(1, Math.min(MAX_LISTS, Math.round(s.nprobe)));
export const ptId = (p: Pt) => `p-${p.id}`;
export const cId = (id: number) => `c-${id}`;
export const QUERY = 'q';
const mark = (id: string, role: MarkRole): Mark => ({ id, role });

export function init(): S {
  return { points: [], centres: [], lists: [], seeds: [], rounds: 0, work: 0 };
}

// ---------------------------------------------------------------------------------------------
// The arithmetic, shared with the tests and the practice questions

/** (d, i) before (d', i'). */
export const before = (a: [number, number], b: [number, number]) =>
  a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

/** Every point into the list of its nearest centre (a tie goes to the lower number). */
export function buildLists(points: readonly Vec[], centres: readonly Vec[]): number[][] {
  const lists: number[][] = centres.map(() => []);
  points.forEach((p, i) => lists[nearest(p, centres).best]!.push(i));
  return lists;
}

/** List indices ranked by (d² from q to the centre, number). */
export function rankLists(q: Vec, centres: readonly Vec[]): { order: number[]; d: number[] } {
  const d = centres.map((c) => d2(q, c));
  const order = d.map((_, j) => j).sort((a, b) => (before([d[a]!, a], [d[b]!, b]) ? -1 : 1));
  return { order, d };
}

/** The k nearest points to q among `pool` (point indices), as (d², index), nearest first. */
export function nearestOf(points: readonly Vec[], q: Vec, pool: readonly number[], k = K) {
  return pool
    .map((i) => [d2(q, points[i]!), i] as [number, number])
    .sort((a, b) => (before(a, b) ? -1 : 1))
    .slice(0, k);
}

/** The K nearest of all the points: brute force. */
export const bruteForce = (points: readonly Vec[], q: Vec, k = K) =>
  nearestOf(
    points,
    q,
    points.map((_, i) => i),
    k,
  ).map(([, i]) => i);

/** Put (d, i) into a top-k list kept nearest first; returns the list and what fell out. */
function offer(top: [number, number][], e: [number, number], k: number) {
  const next = [...top, e].sort((a, b) => (before(a, b) ? -1 : 1));
  const drop = next.length > k ? next.pop()! : null;
  return { top: next, drop, kept: drop !== e };
}

/** How many of the true K nearest a search found. */
export const hits = (d: SearchDone) => d.found.filter((i) => d.truth.includes(i)).length;

// ---------------------------------------------------------------------------------------------
// Narration helpers

export function vars(
  s: S,
  set: IvfSettings,
  extra: Record<string, Scalar> = {},
): Record<string, Scalar> {
  return {
    N: s.points.length,
    lists: s.centres.length || listsOf(set),
    nprobe: nprobeOf(set),
    ...extra,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const nm = (s: S, i: number) => s.points[i]!.name;
const names = (s: S, xs: readonly number[]) => xs.map((i) => nm(s, i)).join(', ');
const topText = (s: S, xs: readonly [number, number][]) =>
  xs.length ? xs.map(([d, i]) => `${nm(s, i)} ${num(d)}`).join(', ') : 'nothing yet';
const pointText = (q: Vec) => `(${q.x}, ${q.y})`;
const at = (c: Vec) => `(${num(c.x)}, ${num(c.y)})`;
const listName = (s: S, j: number) => cName(s.centres[j]!.id);

function stop(s: S, set: IvfSettings, say: string): IStep {
  return { state: s, marks: [], say, lines: [], level: 1, vars: vars(s, set) };
}

function* fail(s: S, set: IvfSettings, say: string): Gen {
  yield stop(s, set, say);
  return s;
}

/** "c1: A, D, G; c2: B; c3: empty". */
function listsText(s: S, lists: readonly number[][]): string {
  return lists.map((l, j) => `${listName(s, j)} ${l.length ? names(s, l) : '(empty)'}`).join('; ');
}

// ---------------------------------------------------------------------------------------------
// Operations

const loadOp: Op = {
  label: 'Load',
  arity: 1,
  *run(_s, args, { settings, rng }) {
    const pts = pointsFrom(args[0], rng, MOST);
    if (typeof pts === 'string') return yield* fail(_s, settings, pts);
    const next: S = { ...init(), points: named(pts) };
    yield {
      state: next,
      marks: next.points.map((p) => mark(ptId(p), 'new')),
      say: `${plural(pts.length, 'point')}: ${next.points.map(ptText).join(', ')}. Press Train: k-means will split them into ${plural(listsOf(settings), 'list')}.`,
      lines: ['lload'],
      level: 1,
      vars: vars(next, settings),
    };
    return next;
  },
};

const trainOp: Op = {
  label: 'Train',
  arity: 0,
  *run(s0, _args, { settings, rng }) {
    if (!s0.points.length) return yield* fail(s0, settings, 'Load some points first.');
    const k = listsOf(settings);
    const n = s0.points.length;
    if (n < k)
      return yield* fail(
        s0,
        settings,
        `${plural(k, 'list')} need${k === 1 ? 's' : ''} at least ${plural(k, 'point')} for k-means to start from, and there ${n === 1 ? 'is' : 'are'} ${n}. Load more points or lower the number of lists.`,
      );
    const base: S = { ...init(), points: s0.points };
    // The k-means page's own run: k-means++ seeding, then Lloyd's algorithm.
    const kmSet: KmSettings = { k, seeding: 'plus', empty: 'farthest' };
    const km0: KmState = { ...kmInit(), points: s0.points, assign: s0.points.map(() => null) };
    const gen = kmOps.run!.run(km0, [], { settings: kmSet, rng });
    const seeds: number[] = [];
    const listsFrom = (km: KmState) =>
      km.centres.map((_, j) => km.assign.flatMap((a, i) => (a === j ? [i] : [])));
    for (let r = gen.next(); ; r = gen.next()) {
      if (r.done) {
        const km = r.value;
        const centres = km.centres.map((c) => ({ id: c.id, x: c.x, y: c.y }));
        const lists = buildLists(s0.points, centres);
        const next: S = { ...base, centres, lists, seeds, rounds: km.round, work: km.work };
        const sizes = lists.map((l) => l.length);
        const uneven = Math.max(...sizes) >= 2 * Math.max(1, Math.min(...sizes)) && k > 1;
        yield {
          state: next,
          marks: next.centres.map((c) => mark(cId(c.id), 'new')),
          say: `Trained: ${km.converged ? `k-means settled after ${plural(km.round, 'round')}` : `k-means stopped after ${plural(km.round, 'round')}`} and ${km.work} distance computations. ${k === 1 ? `With one centre, every point goes into its list: ${listsText(next, lists)}.` : `Every point goes into the list of its nearest centre: ${listsText(next, lists)}. The lines are the borders of the cells: every spot in a cell is nearer to its centre than to any other.`}${uneven ? ' The lists are uneven: a search that lands in a big one measures more points.' : ''}`,
          lines: ['tlist'],
          level: 1,
          vars: vars(next, settings, { 'training distances': km.work }),
        };
        return next;
      }
      const st = r.value;
      const d = st.extra?.draw;
      if (d && d.pick >= 0) seeds.push(d.pick);
      const km = st.state;
      if (st.lines.includes('pret')) {
        const cur: S = { ...base, centres: km.centres.map((c) => ({ ...c })), seeds: [...seeds] };
        yield {
          state: cur,
          marks: cur.centres.map((c) => mark(cId(c.id), 'new')),
          say: `Train the coarse quantizer: k-means with k = ${k}. ${k === 1 ? 'k-means++ draws the one starting centre at random' : `k-means++ picks ${k} starting centres among the points, each one likely far from those before`}: ${cur.centres.map((c, j) => `${cName(c.id)} = ${nm(cur, seeds[j]!)}`).join(', ')}. (The k-means page shows every draw.)`,
          lines: ['tseed'],
          level: 2,
          vars: vars(cur, settings, { 'training distances': km.work }),
        };
      }
      if (st.lines.includes('uret')) {
        const lists = listsFrom(km);
        const cur: S = {
          ...base,
          centres: km.centres.map((c) => ({ ...c })),
          lists,
          seeds: [...seeds],
          rounds: km.round,
          work: km.work,
        };
        const moved = st.extra?.moved ?? [];
        yield {
          state: cur,
          marks: [],
          say: `k-means round ${km.round}: every point joins its nearest centre (${lists.map((l, j) => `${cName(km.centres[j]!.id)} ${l.length}`).join(', ')}), then every centre moves to the mean of its points. ${moved.length ? `${plural(moved.length, 'centre')} moved` : 'No centre moved'}; WCSS ${num(wcss(km))}.`,
          lines: ['tround'],
          level: 2,
          vars: vars(cur, settings, { round: km.round, 'training distances': km.work }),
          extra: { moved },
        };
      }
    }
  },
};

/** A query point typed as "x,y". */
export function readQuery(v: Value | undefined): Vec | string {
  if (typeof v !== 'string' || !/^\s*\(?\s*\d+\s*,\s*\d+\s*\)?\s*$/.test(v))
    return 'Search takes one point, such as 6,3.';
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
    if (!s0.points.length) return yield* fail(s0, settings, 'Load some points first.');
    if (!s0.centres.length)
      return yield* fail(
        s0,
        settings,
        'Train the index first: k-means makes the lists a search looks in.',
      );
    const q = readQuery(args[0]);
    if (typeof q === 'string') return yield* fail(s0, settings, q);
    const s: S = { ...s0, last: undefined };
    const k = s.centres.length;
    const want = nprobeOf(settings);
    const nprobe = Math.min(want, k);
    const { order, d: centreD } = rankLists(q, s.centres);
    const probed = order.slice(0, nprobe);
    let dists = k;
    let top: [number, number][] = [];
    const scanned: number[] = [];
    const vx = (o: Record<string, Scalar> = {}) =>
      vars(s, settings, { 'distance computations': dists, ...o });
    const ex = (o: Partial<X> = {}): X => ({
      q,
      centreD,
      order,
      probed,
      top: [...top],
      scanned: [...scanned],
      dists,
      ...o,
    });
    const skipped = order.slice(nprobe);
    yield {
      state: s,
      marks: [
        mark(QUERY, 'active'),
        ...s.centres.map((c, j) => mark(cId(c.id), probed.includes(j) ? 'found' : 'compare')),
      ],
      say:
        k === 1
          ? `Search for the ${K} nearest to q = ${pointText(q)}. There is only one list, so there is nothing to choose: measure q against its centre (d² ${num(centreD[0]!)}), then against every point in it. This is brute force, plus one.`
          : `Search for the ${K} nearest to q = ${pointText(q)}. First compare q with the ${k} list centres: ${s.centres.map((c, j) => `${cName(c.id)} ${num(centreD[j]!)}`).join(', ')}. ${k > 1 ? `Nearest first: ${order.map((j) => listName(s, j)).join(', ')}. ` : ''}${want > k ? `nprobe = ${want} is more than the ${plural(k, 'list')}, so every list is searched: as much work as brute force, plus the centres.` : skipped.length ? `With nprobe = ${nprobe}, search ${nprobe === 1 ? `list ${listName(s, probed[0]!)} only` : `lists ${probed.map((j) => listName(s, j)).join(' and ')}`}; ${skipped.map((j) => listName(s, j)).join(' and ')} ${skipped.length === 1 ? 'is' : 'are'} skipped.` : `With nprobe = ${nprobe}, every list is searched.`}`,
      lines: ['scent', 'sprobe'],
      level: 2,
      vars: vx(),
      extra: ex(),
    };
    for (const j of probed) {
      const list = s.lists[j]!;
      for (const i of list) {
        const e: [number, number] = [d2(q, s.points[i]!), i];
        dists++;
        scanned.push(i);
        const far = top.length >= K ? top[K - 1]! : null;
        const o = offer(top, e, K);
        top = o.top;
        const p = s.points[i]!;
        yield {
          state: s,
          marks: [
            mark(ptId(p), o.kept ? 'new' : 'stale'),
            mark(cId(s.centres[j]!.id), 'found'),
            mark(QUERY, 'active'),
          ],
          say: `${ptText(p)}: d² ${num(e[0])}. ${o.kept ? (far ? `Nearer than ${nm(s, far[1])} (${num(far[0])}), so it joins the top ${K}${o.drop ? ` and ${nm(s, o.drop[1])} drops out` : ''}.` : `The top ${K} has room, so it goes in.`) : `No nearer than the ${K} kept: leave it.`} Top ${K}: ${topText(s, top)}.`,
          lines: ['sscan'],
          level: 3,
          vars: vx(),
          extra: ex({ scanning: j, seen: i }),
        };
      }
      yield {
        state: s,
        marks: [
          mark(cId(s.centres[j]!.id), 'found'),
          ...list.map((i) => mark(ptId(s.points[i]!), 'visit')),
        ],
        say: list.length
          ? `List ${listName(s, j)}: measured ${names(s, list)} (${plural(list.length, 'distance')}). Top ${K} so far: ${topText(s, top)}.`
          : `List ${listName(s, j)} is empty: nothing to measure.`,
        lines: ['sfor'],
        level: 2,
        vars: vx(),
        extra: ex({ scanning: j }),
      };
    }
    const found = top.map(([, i]) => i);
    const truth = bruteForce(s.points, q);
    const done: SearchDone = { q, centreD, order, probed, found, truth, dists };
    const next: S = { ...s, last: done };
    const hit = hits(done);
    const n = s.points.length;
    const total = Math.min(K, n);
    const missed = truth.filter((i) => !found.includes(i));
    const where = (i: number) => s.lists.findIndex((l) => l.includes(i));
    const why = missed.length
      ? ` It missed ${missed
          .map((i) => {
            const j = where(i);
            const p = s.points[i]!;
            return `${p.name} (d² ${num(d2(q, p))}), which sits in list ${listName(s, j)}: ${p.name} is nearer to ${listName(s, j)} than to any other centre, and ${listName(s, j)} was not searched`;
          })
          .join('; and ')}. Not exact.`
      : ` The answer is exact${skipped.length ? `, though ${skipped.length === 1 ? 'a list was' : 'lists were'} skipped` : ''}.`;
    yield {
      state: next,
      marks: [],
      say: `IVF returns ${names(s, found) || 'nothing'}, after ${dists} distance computations (${plural(k, 'centre')} and ${plural(dists - k, 'point')}). Brute force measures all ${n} and gets ${names(s, truth)}. Recall ${hit}/${total}.${why}`,
      lines: ['sret'],
      level: 1,
      vars: vars(next, settings, {
        'distance computations': dists,
        'brute force': n,
        recall: Math.round((100 * hit) / total) / 100,
        exact: hit === total ? 'yes' : 'no',
      }),
    };
    return next;
  },
};

export const ops = { load: loadOp, train: trainOp, search: searchOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(set: IvfSettings): PseudoBlock[] {
  return [
    {
      op: 'load',
      lines: [
        L('lsig', 0, 'LOAD(points)', 'Start from some points'),
        L('lload', 1, 'x₁ … x_N, no lists yet', 'with no index yet.'),
      ],
    },
    {
      op: 'train',
      lines: [
        L('tsig', 0, `TRAIN(points, nlist = ${listsOf(set)})`, 'Build the index:'),
        L('tseed', 1, 'c₁ … c_nlist = k-means++ seeds', 'choose spread-out starting centres,'),
        L(
          'tround',
          1,
          'repeat: assign each x to its nearest c_j; c_j = mean of its points',
          'run k-means until the centres settle,',
        ),
        L(
          'tlist',
          1,
          'for each x: append x to list[j], c_j the nearest centre',
          'then file every point under its nearest centre.',
        ),
      ],
    },
    {
      op: 'search',
      lines: [
        L(
          'ssig',
          0,
          `SEARCH(q, k = ${K}, nprobe = ${nprobeOf(set)})`,
          'Find the nearest points to q:',
        ),
        L('scent', 1, 'd_j = |q − c_j|² for every centre', 'measure q against every centre,'),
        L(
          'sprobe',
          1,
          'P = the nprobe lists with the least d_j',
          'pick the few lists whose centres are nearest,',
        ),
        L('sfor', 1, 'for each list j in P, nearest first', 'and in each of those lists'),
        L(
          'sscan',
          2,
          'for each x in list[j]: keep x if it is among the k nearest so far',
          'measure every point, keeping the k nearest.',
        ),
        L('sret', 1, 'return the k nearest kept', 'Points in the other lists are never looked at.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words

export function initialSay(): string {
  return 'No points yet. Load some points (type them, or a count for random ones), then Train: k-means splits them into lists, one per centre. A search then looks only in the lists whose centres are nearest the query.';
}

export const initialVars = (s: S, set: IvfSettings) => vars(s, set);

export function describe(s: S): string {
  if (!s.points.length) return 'No points.';
  const pts = `Points: ${s.points.map(ptText).join(', ')}.`;
  if (!s.centres.length) return `${pts} Not trained yet.`;
  const lists = s.centres
    .map(
      (c, j) =>
        `${cName(c.id)} at ${at(c)}: ${s.lists[j]?.length ? names(s, s.lists[j]!) : 'empty'}`,
    )
    .join('; ');
  const last = s.last
    ? ` Last search for ${pointText(s.last.q)} searched ${s.last.probed.map((j) => listName(s, j)).join(', ')} and returned ${names(s, s.last.found)}; brute force: ${names(s, s.last.truth)}.`
    : '';
  return `${pts} Lists: ${lists}.${last}`;
}
