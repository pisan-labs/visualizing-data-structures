/**
 * k-means clustering with Lloyd's algorithm (Lloyd 1957, published 1982), on at most 12 points
 * with whole-number coordinates from 0 to 10.
 *
 *   assign   every point joins its nearest centre (squared distance; a tie goes to the centre
 *            with the lower number)
 *   update   every centre moves to the mean of its points
 *   repeat   until an assignment changes nothing
 *
 * Both steps can only lower the within-cluster sum of squares, WCSS = Σ d²(point, its centre),
 * so the loop ends; where it ends depends on where the centres start.
 *
 * Settings
 *   k        how many centres Seed picks (1 to 5)
 *   seeding  'plus': k-means++ (Arthur and Vassilvitskii 2007): the first centre is a point drawn
 *            uniformly, each next one a point drawn with probability D²(x) / Σ D², where D(x) is
 *            the distance from x to the nearest centre chosen so far.
 *            'random': k different points drawn uniformly (Forgy's method)
 *   empty    what an update does with a centre that has no points: 'farthest' moves it to the
 *            point farthest from its own centre (when that point is not on its centre already);
 *            'stay' leaves it where it is
 *
 * Every draw is one uniform number u in [0, 1) from the seeded RNG: uniformly, u picks the
 * ⌊u·m⌋-th of the m points not chosen yet; by D², the first point whose running total of D²
 * passes u·Σ D².
 *
 * Operations: load (points), seed, place (centres typed by hand), assign, update, run (seed if
 * needed, then assign and update until nothing changes, at most 20 rounds).
 */
import type { Mark, MarkRole, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { groupRole } from '../../engine/types';
import { readPoints, type Vec } from '../../layouts/plane';
import { two } from '../_lm/numbers';
import { d2, MAX, named, pointsFrom, ptText, type Pt } from '../_retrieve/points';

export const MOST = 12;
export const MAX_K = 5;
export const MAX_ROUNDS = 20;

export type Seeding = 'plus' | 'random';
export type Empty = 'farthest' | 'stay';

export interface KmSettings {
  [key: string]: Scalar;
  k: number;
  seeding: Seeding;
  empty: Empty;
}

export const defaults: KmSettings = { k: 3, seeding: 'plus', empty: 'farthest' };

export interface Centre {
  /** 1 to k: drawn as c1, c2... */
  id: number;
  x: number;
  y: number;
}

export interface KmState {
  points: Pt[];
  centres: Centre[];
  /** Index into `centres` of each point's cluster; null before the first assignment. */
  assign: (number | null)[];
  /** Assignment steps run since the centres were set. */
  round: number;
  /** The last assignment changed nothing. */
  converged: boolean;
  /** Distance computations since the centres were set (seeding included). */
  work: number;
}

/** A k-means++ or random draw, for the table and the narration. */
export interface Draw {
  /** Which centre is being chosen (0-based). */
  c: number;
  u: number;
  mode: 'uniform' | 'd2';
  /** D² of every point to its nearest chosen centre (mode 'd2'). */
  dd?: number[];
  /** Running totals of dd (mode 'd2'). */
  cum?: number[];
  total?: number;
  target?: number;
  /** The point picked (index into points). */
  pick: number;
  /** Points chosen before this draw. */
  chosen: number[];
}

export interface KmExtra {
  draw?: Draw;
  /** The point being assigned and its squared distance to every centre. */
  probe?: { point: number; dists: number[]; best: number };
  /** Centres that just moved, from where. */
  moved?: { id: number; from: Vec }[];
}

type S = KmState;
type X = KmExtra;
type Op = OpSpec<S, KmSettings, X>;
type KStep = Step<S, X>;
type Gen<T = S> = Generator<KStep, T, void>;

export const kOf = (set: KmSettings) => Math.max(1, Math.min(MAX_K, Math.round(set.k)));
export const cName = (id: number) => `c${id}`;
export const cRole = (id: number): MarkRole => groupRole(id);
export const ptId = (p: Pt) => `p-${p.id}`;
export const cId = (id: number) => `c-${id}`;
const mark = (id: string, role: MarkRole): Mark => ({ id, role });

/** "(2.33, 1.5)": at most two decimals, as on the drawing. */
export const at = (v: Vec) => `(${num(v.x)}, ${num(v.y)})`;
export function num(x: number): string {
  const r = Math.round(x * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

export function init(): S {
  return { points: [], centres: [], assign: [], round: 0, converged: false, work: 0 };
}

// ---------------------------------------------------------------------------------------------
// The arithmetic, shared with the tests and the practice questions

/** The nearest centre's index (a tie goes to the lower index) and every squared distance. */
export function nearest(p: Vec, centres: readonly Vec[]): { best: number; dists: number[] } {
  const dists = centres.map((c) => d2(p, c));
  let best = 0;
  for (let j = 1; j < dists.length; j++) if (dists[j]! < dists[best]!) best = j;
  return { best, dists };
}

/** Σ d²(point, its centre), points in order; 0 with no assignment. */
export function wcss(s: Pick<S, 'points' | 'centres' | 'assign'>): number {
  let total = 0;
  s.points.forEach((p, i) => {
    const a = s.assign[i];
    if (a !== null && a !== undefined) total += d2(p, s.centres[a]!);
  });
  return total;
}

/** The mean of some points, summed in order and divided once. */
export function mean(pts: readonly Vec[]): Vec {
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / pts.length, y: sy / pts.length };
}

/** The k-means++ pick for a draw u: the first point whose running total of D² passes u·Σ D². */
export function pickByD2(dd: readonly number[], u: number) {
  const cum: number[] = [];
  let total = 0;
  for (const x of dd) {
    total += x;
    cum.push(total);
  }
  const target = u * total;
  const pick = cum.findIndex((c) => c > target);
  return { cum, total, target, pick };
}

/** Index into `pool` of a uniform draw u: ⌊u·m⌋. */
export const pickUniform = (m: number, u: number) => Math.floor(u * m);

/** The draws of a seeding, in order: plain arithmetic, no steps. */
export function seedPicks(points: readonly Vec[], k: number, seeding: Seeding, us: number[]): Draw[] {
  const chosen: number[] = [];
  const draws: Draw[] = [];
  for (let c = 0; c < k; c++) {
    const u = us[c]!;
    let d: Draw;
    const dd = points.map((p) => Math.min(...chosen.map((j) => d2(p, points[j]!))));
    const spread = c > 0 && seeding === 'plus' ? pickByD2(dd, u) : null;
    if (spread && spread.total > 0) {
      d = { c, u, mode: 'd2', dd, ...spread, chosen: [...chosen] };
    } else {
      const pool = points.map((_, i) => i).filter((i) => !chosen.includes(i));
      d = { c, u, mode: 'uniform', pick: pool[pickUniform(pool.length, u)]!, chosen: [...chosen] };
    }
    draws.push(d);
    chosen.push(d.pick);
  }
  return draws;
}

// ---------------------------------------------------------------------------------------------
// Narration helpers

export function vars(s: S, set: KmSettings): Record<string, Scalar> {
  const assigned = s.assign.some((a) => a !== null);
  return {
    N: s.points.length,
    k: s.centres.length || kOf(set),
    round: s.round,
    ...(assigned ? { WCSS: Math.round(wcss(s) * 100) / 100 } : {}),
    'distance computations': s.work,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function stop(s: S, set: KmSettings, say: string): KStep {
  return { state: s, marks: [], say, lines: [], level: 1, vars: vars(s, set) };
}

/** "the 3rd". */
const ordinal = (n: number) => {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `the ${n}${tail}`;
};

// ---------------------------------------------------------------------------------------------
// Operations

const loadOp: Op = {
  label: 'Load',
  arity: 1,
  *run(s, args, { settings, rng }) {
    const pts = pointsFrom(args[0], rng, MOST);
    if (typeof pts === 'string') return yield* fail(s, settings, pts);
    const next: S = { ...init(), points: named(pts), assign: pts.map(() => null) };
    yield {
      state: next,
      marks: next.points.map((p) => mark(ptId(p), 'new')),
      say: `${plural(pts.length, 'point')}: ${next.points.map(ptText).join(', ')}. Press Seed to choose ${kOf(settings)} starting centres, or Run to do everything.`,
      lines: ['lload'],
      level: 1,
      vars: vars(next, settings),
    };
    return next;
  },
};

function* fail(s: S, set: KmSettings, say: string): Gen {
  yield stop(s, set, say);
  return s;
}

/** Points typed as centres, "x,y x,y", at most MAX_K of them. */
export function readCentres(v: Value | undefined): Vec[] | string {
  if (typeof v !== 'string') return 'Type the centres as points, such as 2,3 8,7.';
  const pts = readPoints(v, 0, MAX, MAX_K);
  return typeof pts === 'string' && pts.startsWith('At most') ? `At most ${MAX_K} centres.` : pts;
}

const placeOp: Op = {
  label: 'Place centres',
  arity: 1,
  *run(s, args, { settings }) {
    if (!s.points.length) return yield* fail(s, settings, 'Load some points first.');
    const pts = readCentres(args[0]);
    if (typeof pts === 'string') return yield* fail(s, settings, pts);
    const centres = pts.map((p, i) => ({ id: i + 1, x: p.x, y: p.y }));
    const next: S = { ...s, centres, assign: s.points.map(() => null), round: 0, converged: false, work: 0 };
    yield {
      state: next,
      marks: centres.map((c) => mark(cId(c.id), 'new')),
      say: `${plural(centres.length, 'centre')} placed by hand: ${centres.map((c) => `${cName(c.id)} ${at(c)}`).join(', ')}. Press Assign.`,
      lines: ['pset'],
      level: 1,
      vars: vars(next, settings),
    };
    return next;
  },
};

function* seedSteps(s: S, set: KmSettings, u: () => number): Gen {
  const k = kOf(set);
  const n = s.points.length;
  if (n < k)
    return yield* fail(
      s,
      set,
      `k = ${k} needs at least ${k} points to start from, and there ${n === 1 ? 'is' : 'are'} ${n}. Load more points or lower k.`,
    );
  const us = Array.from({ length: k }, u);
  const draws = seedPicks(s.points, k, set.seeding, us);
  const centres: Centre[] = [];
  let work = 0;
  const view = (): S => ({
    ...s,
    centres: [...centres],
    assign: s.points.map(() => null),
    round: 0,
    converged: false,
    work,
  });
  for (const d of draws) {
    const p = s.points[d.pick]!;
    const id = d.c + 1;
    // k-means++ keeps each point's D² and updates it against the newest centre: n distances.
    if (set.seeding === 'plus' && d.c > 0) work += n;
    if (d.mode === 'd2') {
      const cur = view();
      const dd = d.dd!;
      yield {
        state: cur,
        marks: s.points.map((q, i) => mark(ptId(q), dd[i] === 0 ? 'stale' : 'compare')),
        say: `To pick ${cName(id)}, give every point its D²: the squared distance to the nearest centre chosen so far. ${s.points.map((q, i) => `${q.name} ${dd[i]}`).join(', ')}. They add up to ${d.total}. A point far from every centre is likely to be picked; a centre's own point has D² = 0 and cannot be.`,
        lines: ['pd2'],
        level: 3,
        vars: vars(cur, set),
        extra: { draw: { ...d, pick: -1 } },
      };
      const before = d.pick > 0 ? d.cum![d.pick - 1]! : 0;
      centres.push({ id, x: p.x, y: p.y });
      const cur2 = view();
      yield {
        state: cur2,
        marks: [mark(ptId(p), 'found'), mark(cId(id), 'new')],
        say: `Draw u = ${two(d.u)}: the target is ${two(d.u)} × ${d.total} = ${two(d.target!)}. Walk the running total of D² until it passes the target: it is ${before} before ${p.name} and ${d.cum![d.pick]} after, so ${cName(id)} = ${ptText(p)}. ${p.name} had a ${Math.round((100 * dd[d.pick]!) / d.total!)}% chance.`,
        lines: ['pdraw'],
        level: 2,
        vars: vars(cur2, set),
        extra: { draw: d },
      };
    } else {
      const m = n - d.chosen.length;
      centres.push({ id, x: p.x, y: p.y });
      const cur = view();
      const why =
        d.c === 0
          ? set.seeding === 'plus'
            ? 'k-means++ draws the first centre uniformly'
            : 'Random seeding draws every centre uniformly'
          : set.seeding === 'plus'
            ? 'Every point sits on a centre already (D² = 0 everywhere), so this draw is uniform'
            : 'Random seeding draws every centre uniformly';
      yield {
        state: cur,
        marks: [mark(ptId(p), 'found'), mark(cId(id), 'new')],
        say: `${why}: u = ${two(d.u)} picks ${ordinal(pickUniform(m, d.u) + 1)} of the ${plural(m, 'point')} not chosen yet (⌊${two(d.u)} × ${m}⌋ = ${pickUniform(m, d.u)}, counting from 0), so ${cName(id)} = ${ptText(p)}.`,
        lines: [d.c === 0 || set.seeding === 'random' ? 'pfirst' : 'pdraw'],
        level: 2,
        vars: vars(cur, set),
        extra: { draw: d },
      };
    }
  }
  const next = view();
  const twin = centres.some((c, i) => centres.some((o, j) => j < i && o.x === c.x && o.y === c.y));
  yield {
    state: next,
    marks: centres.map((c) => mark(cId(c.id), 'new')),
    say: `${set.seeding === 'plus' ? 'k-means++' : 'Random seeding'} chose ${centres.map((c) => `${cName(c.id)} ${at(c)}`).join(', ')}.${twin ? ' Two centres sit on the same spot (the points repeat), so one of them will get no points.' : ''} Press Assign.`,
    lines: ['pret'],
    level: 1,
    vars: vars(next, set),
  };
  return next;
}

const seedOp: Op = {
  label: 'Seed',
  arity: 0,
  *run(s, _args, { settings, rng }) {
    if (!s.points.length) return yield* fail(s, settings, 'Load some points first.');
    return yield* seedSteps(s, settings, () => rng.next());
  },
};

/** One assignment step: every point to its nearest centre. */
function* assignSteps(s: S, set: KmSettings, level: 2 | 3): Gen {
  const k = s.centres.length;
  const assign = [...s.assign];
  let work = s.work;
  let changed = 0;
  const first = s.assign.every((a) => a === null);
  const round = s.round + 1;
  const cur = (): S => ({ ...s, assign: [...assign], work, round });
  for (const [i, p] of s.points.entries()) {
    const { best, dists } = nearest(p, s.centres);
    work += k;
    const was = assign[i];
    assign[i] = best;
    if (was !== best) changed++;
    const c = s.centres[best]!;
    const list =
      k === 1
        ? `d² to ${cName(c.id)} = ${num(dists[0]!)}`
        : `d² to ${s.centres.map((o, j) => `${cName(o.id)} ${num(dists[j]!)}`).join(', ')}`;
    const tie = dists.filter((d) => d === dists[best]).length > 1 ? ' (a tie: the lower number wins)' : '';
    const move =
      was === null || was === undefined
        ? `${p.name} joins ${cName(c.id)}`
        : was === best
          ? `${p.name} stays with ${cName(c.id)}`
          : `${p.name} moves from ${cName(s.centres[was]!.id)} to ${cName(c.id)}`;
    const now = cur();
    yield {
      state: now,
      marks: [
        mark(ptId(p), 'active'),
        ...s.centres.map((o, j) => mark(cId(o.id), j === best ? 'found' : 'compare')),
      ],
      say: `${ptText(p)}: ${list}. Nearest is ${cName(c.id)}${tie}: ${move}.`,
      lines: ['afor', 'anear'],
      level,
      vars: vars(now, set),
      extra: { probe: { point: i, dists, best } },
    };
  }
  const next: S = { ...cur(), converged: !first && changed === 0 };
  const sizes = s.centres.map((_, j) => assign.filter((a) => a === j).length);
  const empty = s.centres.filter((_, j) => sizes[j] === 0).map((c) => cName(c.id));
  const say = next.converged
    ? `Round ${round}: no point changed cluster, so the centres will not move either. Lloyd's algorithm has converged, with WCSS = ${two(wcss(next))}.`
    : `Round ${round}, assignment: ${first ? 'every point has a cluster now' : `${plural(changed, 'point')} changed cluster`}. Sizes: ${s.centres.map((c, j) => `${cName(c.id)} ${sizes[j]}`).join(', ')}. WCSS = ${two(wcss(next))}.${empty.length ? ` ${empty.join(' and ')} got no points: an empty cluster.` : ''}`;
  yield {
    state: next,
    marks: next.converged ? s.points.map((p) => mark(ptId(p), 'done')) : [],
    say,
    lines: ['aret'],
    level: level === 3 ? 2 : 1,
    vars: { ...vars(next, set), changed },
  };
  return next;
}

const assignOp: Op = {
  label: 'Assign',
  arity: 0,
  *run(s, _args, { settings }) {
    if (!s.points.length) return yield* fail(s, settings, 'Load some points first.');
    if (!s.centres.length) return yield* fail(s, settings, 'Seed or place the centres first.');
    return yield* assignSteps(s, settings, 2);
  },
};

/** The update: every centre to the mean of its points; then the empty ones. */
function* updateSteps(s: S, set: KmSettings, level: 2 | 3): Gen {
  const before = wcss(s);
  const centres = s.centres.map((c) => ({ ...c }));
  const moved: { id: number; from: Vec }[] = [];
  const cur = (): S => ({ ...s, centres: centres.map((c) => ({ ...c })) });
  const emptyIdx: number[] = [];
  for (const [j, c] of s.centres.entries()) {
    const members = s.points.filter((_, i) => s.assign[i] === j);
    if (!members.length) {
      emptyIdx.push(j);
      continue;
    }
    const m = mean(members);
    const from = { x: c.x, y: c.y };
    centres[j] = { id: c.id, x: m.x, y: m.y };
    const still = from.x === m.x && from.y === m.y;
    if (!still) moved.push({ id: c.id, from });
    const sum = (key: 'x' | 'y') =>
      members.length === 1 ? `${members[0]![key]}` : `(${members.map((p) => p[key]).join(' + ')}) / ${members.length}`;
    const now = cur();
    yield {
      state: now,
      marks: [mark(cId(c.id), 'active'), ...members.map((p) => mark(ptId(p), 'visit'))],
      say: `${cName(c.id)} moves to the mean of its ${plural(members.length, 'point')} (${members.map((p) => p.name).join(', ')}): x = ${sum('x')} = ${num(m.x)}, y = ${sum('y')} = ${num(m.y)}. ${still ? 'It is already there.' : `From ${at(from)} to ${at(m)}.`}`,
      lines: ['ufor', 'umean'],
      level,
      vars: vars(now, set),
      extra: { moved: still ? [] : [{ id: c.id, from }] },
    };
  }
  const taken = new Set<number>();
  for (const j of emptyIdx) {
    const c = s.centres[j]!;
    let far = -1;
    let farD = 0;
    if (set.empty === 'farthest')
      s.points.forEach((p, i) => {
        const a = s.assign[i];
        if (a === null || a === undefined || taken.has(i)) return;
        const d = d2(p, centres[a]!);
        if (d > farD) {
          far = i;
          farD = d;
        }
      });
    let say: string;
    let marks: Mark[] = [mark(cId(c.id), 'error')];
    if (far >= 0) {
      const p = s.points[far]!;
      taken.add(far);
      moved.push({ id: c.id, from: { x: c.x, y: c.y } });
      centres[j] = { id: c.id, x: p.x, y: p.y };
      say = `${cName(c.id)} has no points, so it has no mean. It jumps to the point farthest from its own centre: ${ptText(p)}, at d² = ${num(farD)} from ${cName(centres[s.assign[far]!]!.id)}. ${p.name} will join it in the next assignment.`;
      marks = [mark(cId(c.id), 'error'), mark(ptId(p), 'found')];
    } else if (set.empty === 'farthest') {
      say = `${cName(c.id)} has no points, and every point sits on its own centre, so there is nowhere better to go: it stays at ${at(c)}.`;
    } else {
      say = `${cName(c.id)} has no points, so it has no mean. It stays where it is, at ${at(c)}, and may stay empty for good: this run will find fewer than ${s.centres.length} clusters.`;
    }
    const now = cur();
    yield {
      state: now,
      marks,
      say,
      lines: ['uempty'],
      level,
      vars: vars(now, set),
      extra: far >= 0 ? { moved: [moved.at(-1)!] } : {},
    };
  }
  const next = cur();
  const after = wcss(next);
  yield {
    state: next,
    marks: moved.map((m) => mark(cId(m.id), 'new')),
    say: `Round ${s.round}, update: ${moved.length ? `${plural(moved.length, 'centre')} moved` : 'no centre moved'}. WCSS ${after < before - 1e-12 ? `fell from ${two(before)} to ${two(after)}` : `stays ${two(after)}`}.${s.round === 1 ? ' It cannot go up: the mean is the spot with the least total squared distance to a group of points.' : ''}`,
    lines: ['uret'],
    level: level === 3 ? 2 : 1,
    vars: vars(next, set),
    extra: { moved },
  };
  return next;
}

const updateOp: Op = {
  label: 'Update',
  arity: 0,
  *run(s, _args, { settings }) {
    if (!s.points.length) return yield* fail(s, settings, 'Load some points first.');
    if (!s.centres.length) return yield* fail(s, settings, 'Seed or place the centres first.');
    if (s.assign.every((a) => a === null)) return yield* fail(s, settings, 'Assign the points first: a centre moves to the mean of its points.');
    return yield* updateSteps(s, settings, 2);
  },
};

const runOp: Op = {
  label: 'Run',
  arity: 0,
  *run(s, _args, { settings, rng }) {
    if (!s.points.length) return yield* fail(s, settings, 'Load some points first.');
    let cur = s;
    if (!cur.centres.length) {
      cur = yield* seedSteps(cur, settings, () => rng.next());
      if (!cur.centres.length) return cur;
    }
    const start = cur.round;
    while (cur.round - start < MAX_ROUNDS) {
      cur = yield* assignSteps(cur, settings, 3);
      if (cur.converged) break;
      cur = yield* updateSteps(cur, settings, 3);
    }
    const sizes = cur.centres.map((_, j) => cur.assign.filter((a) => a === j).length);
    yield {
      state: cur,
      marks: [],
      say: cur.converged
        ? `Converged: the assignment in round ${cur.round} changed nothing. ${cur.centres.map((c, j) => `${cName(c.id)} ${at(c)} with ${plural(sizes[j]!, 'point')}`).join('; ')}. WCSS = ${two(wcss(cur))}, after ${cur.work} distance computations.`
        : `Stopped after ${MAX_ROUNDS} rounds without converging. WCSS = ${two(wcss(cur))}.`,
      lines: ['rret'],
      level: 1,
      vars: vars(cur, settings),
    };
    return cur;
  },
};

export const ops = {
  load: loadOp,
  seed: seedOp,
  place: placeOp,
  assign: assignOp,
  update: updateOp,
  run: runOp,
};

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({ id, indent, text, plain });

export function pseudocode(set: KmSettings): PseudoBlock[] {
  const plus = set.seeding === 'plus';
  const seed = [
    L('psig', 0, `SEED(points, k)${plus ? '   // k-means++' : ''}`, `Choose ${plus ? 'spread-out' : 'random'} starting centres:`),
    L('pfirst', 1, 'c₁ = a point drawn uniformly', 'the first centre is any point, each equally likely;'),
    ...(plus
      ? [
          L('pfor', 1, 'for j = 2 to k', 'then, for each further centre,'),
          L('pd2', 2, 'D²(x) = min over chosen c of |x − c|²', 'every point measures how far it is from the nearest centre so far,'),
          L('pdraw', 2, 'c_j = a point x drawn with probability D²(x) / Σ D²', 'and a point is picked with a chance that grows with that distance squared.'),
        ]
      : [L('pdraw', 1, 'c₂ … c_k = more points drawn uniformly, no repeats', 'and so is every other centre, never the same point twice.')]),
    L('pret', 1, 'return c₁ … c_k', 'These are the starting centres.'),
  ];
  const assign = [
    L('asig', 0, 'ASSIGN(points, centres)', 'Give every point to a centre:'),
    L('afor', 1, 'for each point x', 'for each point,'),
    L('anear', 2, 'cluster(x) = the j with the least |x − c_j|²', 'find the nearest centre (a tie goes to the lower number).'),
    L('aret', 1, 'return the number of points that changed', 'Count the points that switched.'),
  ];
  const update = [
    L('usig', 0, 'UPDATE(points, centres)', 'Move every centre:'),
    L('ufor', 1, 'for each centre c_j', 'for each centre,'),
    L('umean', 2, 'c_j = mean of the points in cluster j', 'put it at the average of its points.'),
    L(
      'uempty',
      2,
      set.empty === 'farthest'
        ? 'if cluster j is empty: c_j = the point farthest from its centre'
        : 'if cluster j is empty: leave c_j where it is',
      set.empty === 'farthest'
        ? 'A centre with no points jumps to the worst-served point.'
        : 'A centre with no points stays put.',
    ),
    L('uret', 1, 'return centres', 'WCSS can only go down.'),
  ];
  return [
    {
      op: 'load',
      lines: [L('lsig', 0, 'LOAD(points)', 'Start from some points'), L('lload', 1, 'x₁ … x_N, no centres yet', 'with no clusters yet.')],
    },
    { op: 'seed', lines: seed },
    {
      op: 'place',
      lines: [L('psig2', 0, 'PLACE(c₁ … c_k)', 'Put the centres where you choose:'), L('pset', 1, 'centres = the points typed', 'the points you typed.')],
    },
    { op: 'assign', lines: assign },
    { op: 'update', lines: update },
    {
      op: 'run',
      lines: [
        L('rsig', 0, "LLOYD(points, k)", 'Cluster the points:'),
        L('rseed', 1, 'if there are no centres: SEED(points, k)', 'start from seeded centres if there are none,'),
        L('rloop', 1, 'repeat ASSIGN, then UPDATE', 'then assign and move, again and again,'),
        L('rret', 1, 'until ASSIGN changes nothing', 'until no point switches.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words

export function initialSay(): string {
  return 'No points yet. Load some points (type them, or a count for random ones), then Seed and Run: every point joins its nearest centre, every centre moves to the middle of its points, until nothing changes.';
}

export const initialVars = (s: S, set: KmSettings) => vars(s, set);

export function describe(s: S): string {
  if (!s.points.length) return 'No points.';
  const pts = `Points: ${s.points.map(ptText).join(', ')}.`;
  if (!s.centres.length) return `${pts} No centres yet.`;
  const cs = s.centres
    .map((c, j) => {
      const members = s.points.filter((_, i) => s.assign[i] === j).map((p) => p.name);
      return `${cName(c.id)} at ${at(c)}${s.assign.some((a) => a !== null) ? ` with ${members.length ? members.join(', ') : 'no points'}` : ''}`;
    })
    .join('; ');
  return `${pts} Centres: ${cs}.`;
}
