import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { orient, readPoints, type Vec } from '../../layouts/plane';
import { nameOf } from '../_spatial/kit';
import { cmp, eq, fmt, rat, type Rat } from './rat';

export const MAX = 12;
export const MOST = 8;

export type Mode = 'any' | 'all';

/** A segment with its left end point p and right end point q (p.x < q.x). */
export interface Seg {
  id: number;
  name: string;
  p: Vec;
  q: Vec;
}

export interface RPt {
  x: Rat;
  y: Rat;
}

export interface Event extends RPt {
  /** Segments whose left end point this is. */
  starts: number[];
  /** Segments whose right end point this is. */
  ends: number[];
  /** A crossing found by a neighbour test. */
  cross: boolean;
}

export interface Hit extends RPt {
  segs: number[];
}

export interface SIState {
  segs: Seg[];
  /** Events still to come, in sweep order. */
  queue: Event[];
  /** Where the sweep line is, or null before a run. */
  sweep: RPt | null;
  /** Segments crossing the sweep line, bottom to top. */
  status: number[];
  /** Segments the sweep has passed completely. */
  passed: number[];
  hits: Hit[];
  /** Neighbour tests made. */
  tests: number;
  /** "Any intersection" mode: the answer once known. */
  answer: boolean | null;
  nextId: number;
}

export interface SISettings {
  [key: string]: Scalar;
  mode: Mode;
}

export interface SIExtra {
  /** Two segments being tested. */
  test?: [number, number];
  /** Where that test found them crossing. */
  at?: RPt;
}

type S = SIState;
type X = SIExtra;
type Op = OpSpec<S, SISettings, X>;
type IStep = Step<S, X>;

export const defaults: SISettings = { mode: 'any' };

export function init(): S {
  return {
    segs: [],
    queue: [],
    sweep: null,
    status: [],
    passed: [],
    hits: [],
    tests: 0,
    answer: null,
    nextId: 1,
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const segId = (id: number) => `sg-${id}`;
export const byId = (s: S, id: number) => s.segs.find((g) => g.id === id)!;
export const ptText = (p: RPt) => `(${fmt(p.x)}, ${fmt(p.y)})`;
const rp = (v: Vec): RPt => ({ x: rat(v.x), y: rat(v.y) });
const samePt = (a: RPt, b: RPt) => eq(a.x, b.x) && eq(a.y, b.y);
/** Sweep order: left to right, then bottom to top. */
export const ptCmp = (a: RPt, b: RPt) => cmp(a.x, b.x) || cmp(a.y, b.y);

/** The segment's y on the vertical line through x (p.x ≤ x ≤ q.x). */
export function yAt(g: Seg, x: Rat): Rat {
  const dx = g.q.x - g.p.x;
  const dy = g.q.y - g.p.y;
  return rat(g.p.y * x.d * dx + (x.n - g.p.x * x.d) * dy, x.d * dx);
}

const slopeCmp = (a: Seg, b: Seg) =>
  Math.sign((a.q.y - a.p.y) * (b.q.x - b.p.x) - (b.q.y - b.p.y) * (a.q.x - a.p.x));

/** Order on the sweep line at x: by y there, then by slope (the order just to the right). */
export const statusCmp = (a: Seg, b: Seg, x: Rat) => cmp(yAt(a, x), yAt(b, x)) || slopeCmp(a, b);

const onSeg = (r: Vec, a: Vec, b: Vec) =>
  Math.min(a.x, b.x) <= r.x &&
  r.x <= Math.max(a.x, b.x) &&
  Math.min(a.y, b.y) <= r.y &&
  r.y <= Math.max(a.y, b.y);

/** Whether two segments meet at all (CLRS SEGMENTS-INTERSECT). */
export function intersects(a: Seg, b: Seg): boolean {
  const d1 = orient(b.p, b.q, a.p);
  const d2 = orient(b.p, b.q, a.q);
  const d3 = orient(a.p, a.q, b.p);
  const d4 = orient(a.p, a.q, b.q);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)))
    return true;
  return (
    (d1 === 0 && onSeg(a.p, b.p, b.q)) ||
    (d2 === 0 && onSeg(a.q, b.p, b.q)) ||
    (d3 === 0 && onSeg(b.p, a.p, a.q)) ||
    (d4 === 0 && onSeg(b.q, a.p, a.q))
  );
}

/** Where two segments meet, if in exactly one point. */
export function crossing(a: Seg, b: Seg): RPt | null {
  if (!intersects(a, b)) return null;
  const rx = a.q.x - a.p.x;
  const ry = a.q.y - a.p.y;
  const sx = b.q.x - b.p.x;
  const sy = b.q.y - b.p.y;
  const d = rx * sy - ry * sx;
  if (d === 0) {
    // Collinear and touching (overlaps are refused): a shared end point.
    for (const u of [a.p, a.q])
      for (const v of [b.p, b.q]) if (u.x === v.x && u.y === v.y) return rp(u);
    return null;
  }
  const t = (b.p.x - a.p.x) * sy - (b.p.y - a.p.y) * sx;
  return { x: rat(a.p.x * d + t * rx, d), y: rat(a.p.y * d + t * ry, d) };
}

/** Collinear segments that share more than one point. */
function overlap(a: Seg, b: Seg): boolean {
  if (orient(a.p, a.q, b.p) !== 0 || orient(a.p, a.q, b.q) !== 0) return false;
  return Math.max(a.p.x, b.p.x) < Math.min(a.q.x, b.q.x);
}

export function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return {
    segments: s.segs.length,
    ...(s.sweep ? { sweep: `x = ${fmt(s.sweep.x)}` } : {}),
    ...more,
    status: s.status.length ? s.status.map((id) => byId(s, id).name).join(' ') : '(empty)',
    tests: s.tests,
    found: s.hits.length,
  };
}

/** Segments as written: "1,2 5,6 3,1 4,7" is two segments. Returns them or a message. */
export function readSegs(text: string): [Vec, Vec][] | string {
  const pts = readPoints(text, 0, MAX, 2 * MOST);
  if (typeof pts === 'string')
    return pts.startsWith('At most') ? `At most ${MOST} segments (${2 * MOST} end points).` : pts;
  if (pts.length % 2)
    return 'Each segment needs two end points: type them in pairs, such as 1,2 5,6 3,1 4,7.';
  const out: [Vec, Vec][] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (a.x === b.x)
      return a.y === b.y
        ? `Segment ${i / 2 + 1} has both ends at (${a.x}, ${a.y}). Give it some length.`
        : `Segment ${i / 2 + 1} is vertical. The sweep assumes no vertical segments; move one end over by 1.`;
    out.push(a.x < b.x ? [a, b] : [b, a]);
  }
  return out;
}

/** Random non-vertical segments, none overlapping another along a line. */
export function randomSegs(rng: Rng, n: number): [Vec, Vec][] {
  const out: Seg[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 500) {
    const x1 = rng.int(0, MAX - 2);
    const x2 = rng.int(x1 + 2, Math.min(MAX, x1 + 9));
    const g: Seg = {
      id: 0,
      name: '',
      p: { x: x1, y: rng.int(0, MAX) },
      q: { x: x2, y: rng.int(0, MAX) },
    };
    if (out.some((h) => overlap(g, h))) continue;
    out.push(g);
  }
  return out.map((g) => [g.p, g.q]);
}

export const writeSegs = (segs: [Vec, Vec][]) =>
  segs.map(([a, b]) => `${a.x},${a.y} ${b.x},${b.y}`).join(' ');

function readArg(v: Value | undefined, rng: Rng): [Vec, Vec][] | string {
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || v < 1 || v > MOST)
      return `${v} is not a list of segments. Type end points in pairs, such as 1,2 5,6 3,1 4,7, or a count from 1 to ${MOST}.`;
    return randomSegs(rng, v);
  }
  if (typeof v !== 'string') return 'Type end points in pairs, such as 1,2 5,6 3,1 4,7.';
  if (/^\s*\d+\s*$/.test(v)) return readArg(Number(v), rng);
  return readSegs(v);
}

const load: Op = {
  label: 'Load segments',
  arity: 1,
  *run(s0, [v], { rng }) {
    const list = readArg(v, rng);
    if (typeof list === 'string') {
      yield { state: s0, marks: [], say: `load: ${list}`, lines: [], vars: vars(s0), level: 1 };
      return s0;
    }
    const segs: Seg[] = list.map(([p, q], i) => ({ id: i + 1, name: nameOf(i + 1), p, q }));
    for (let i = 0; i < segs.length; i++)
      for (let j = i + 1; j < segs.length; j++)
        if (overlap(segs[i]!, segs[j]!)) {
          yield {
            state: s0,
            marks: [],
            say: `load: segments ${segs[i]!.name} and ${segs[j]!.name} lie along one line and overlap. The sweep here assumes they share at most one point.`,
            lines: [],
            vars: vars(s0),
            level: 1,
          };
          return s0;
        }
    const end: S = { ...init(), segs, nextId: segs.length + 1 };
    yield {
      state: end,
      marks: segs.map((g) => mark(segId(g.id), 'new')),
      say: `Load ${segs.length} segment${segs.length === 1 ? '' : 's'}: ${segs.map((g) => `${g.name} (${g.p.x}, ${g.p.y})–(${g.q.x}, ${g.q.y})`).join(', ')}.`,
      lines: [],
      vars: vars(end),
      level: 1,
    };
    return end;
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
      say: s.segs.length ? 'Clear: every segment is gone.' : 'Clear: there were no segments.',
      lines: [],
      vars: vars(end),
      level: 1,
    };
    return end;
  },
};

// ----- The sweep -----

interface Run {
  s: S;
}

function names(s: S, ids: number[]): string {
  const ns = ids.map((id) => byId(s, id).name);
  return ns.length <= 2 ? ns.join(' and ') : `${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`;
}

function insertSorted(run: Run, ids: number[], x: Rat) {
  const status = [...run.s.status];
  for (const id of ids) {
    const g = byId(run.s, id);
    let k = 0;
    while (k < status.length && statusCmp(byId(run.s, status[k]!), g, x) < 0) k++;
    status.splice(k, 0, id);
  }
  run.s = { ...run.s, status };
}

/** CLRS ANY-SEGMENTS-INTERSECT: end points only; stop at the first intersection. */
function* anySweep(run: Run): Generator<IStep, void, void> {
  type E = { x: number; left: boolean; y: number; seg: number };
  const events: E[] = run.s.segs
    .flatMap((g) => [
      { x: g.p.x, left: true, y: g.p.y, seg: g.id },
      { x: g.q.x, left: false, y: g.q.y, seg: g.id },
    ])
    .sort((a, b) => a.x - b.x || Number(b.left) - Number(a.left) || a.y - b.y || a.seg - b.seg);
  const asEvent = (e: E): Event => ({
    x: rat(e.x),
    y: rat(e.y),
    starts: e.left ? [e.seg] : [],
    ends: e.left ? [] : [e.seg],
    cross: false,
  });
  run.s = { ...run.s, queue: events.map(asEvent) };
  yield {
    state: run.s,
    marks: [],
    say: `Sort the ${events.length} end points by x. At the same x, left ends come before right ends, then lower before higher.`,
    lines: ['any.sort'],
    vars: vars(run.s),
    level: 2,
  };
  const test = function* (a: number, b: number, line: string): Generator<IStep, boolean, void> {
    const ga = byId(run.s, a);
    const gb = byId(run.s, b);
    const yes = intersects(ga, gb);
    run.s = { ...run.s, tests: run.s.tests + 1 };
    const at = yes ? (crossing(ga, gb) ?? undefined) : undefined;
    yield {
      state: run.s,
      marks: [mark(segId(a), yes ? 'found' : 'compare'), mark(segId(b), yes ? 'found' : 'compare')],
      say: `Test the neighbours ${ga.name} and ${gb.name}: ${yes ? `they intersect${at ? ` at ${ptText(at)}` : ''}.` : 'they do not meet.'}`,
      lines: [line],
      vars: vars(run.s),
      level: yes ? 2 : 3,
      extra: { test: [a, b], ...(at ? { at } : {}) },
    };
    if (yes && at) run.s = { ...run.s, hits: [{ ...at, segs: [a, b] }] };
    return yes;
  };
  for (const e of events) {
    const g = byId(run.s, e.seg);
    run.s = { ...run.s, queue: run.s.queue.slice(1), sweep: { x: rat(e.x), y: rat(e.y) } };
    if (e.left) {
      insertSorted(run, [g.id], rat(e.x));
      const k = run.s.status.indexOf(g.id);
      const below = run.s.status[k - 1];
      const above = run.s.status[k + 1];
      yield {
        state: run.s,
        marks: [mark(segId(g.id), 'active')],
        say: `Sweep to x = ${e.x}: the left end of ${g.name}. Insert ${g.name} into the status by its height here. ${
          below !== undefined || above !== undefined
            ? `Its neighbours: ${[below, above]
                .filter((v) => v !== undefined)
                .map((id) => byId(run.s, id!).name)
                .join(
                  ' below, ',
                )}${above !== undefined && below !== undefined ? ' above' : below !== undefined ? ' below' : ' above'}.`
            : 'It has no neighbours yet.'
        }`,
        lines: ['any.left', 'any.insert'],
        vars: vars(run.s),
        level: 2,
      };
      for (const nb of [above, below])
        if (nb !== undefined && (yield* test(g.id, nb, 'any.ltest'))) return;
    } else {
      const k = run.s.status.indexOf(g.id);
      const below = run.s.status[k - 1];
      const above = run.s.status[k + 1];
      yield {
        state: run.s,
        marks: [mark(segId(g.id), 'active')],
        say: `Sweep to x = ${e.x}: the right end of ${g.name}. ${above !== undefined && below !== undefined ? `Before deleting it, its neighbours ${byId(run.s, below).name} and ${byId(run.s, above).name} become adjacent: test them.` : 'It has neighbours on at most one side, so there is nothing new to test.'}`,
        lines: ['any.right'],
        vars: vars(run.s),
        level: 2,
      };
      if (above !== undefined && below !== undefined && (yield* test(above, below, 'any.rtest')))
        return;
      run.s = {
        ...run.s,
        status: run.s.status.filter((id) => id !== g.id),
        passed: [...run.s.passed, g.id],
      };
      yield {
        state: run.s,
        marks: [mark(segId(g.id), 'stale')],
        say: `Delete ${g.name} from the status.`,
        lines: ['any.delete'],
        vars: vars(run.s),
        level: 3,
      };
    }
  }
}

/** Bentley–Ottmann: report every intersection point. */
function* allSweep(run: Run): Generator<IStep, void, void> {
  const queue: Event[] = [];
  const add = (p: RPt, f: (e: Event) => void) => {
    let e = queue.find((q) => samePt(q, p));
    if (!e) {
      e = { ...p, starts: [], ends: [], cross: false };
      queue.push(e);
      queue.sort(ptCmp);
    }
    f(e);
  };
  for (const g of run.s.segs) {
    add(rp(g.p), (e) => e.starts.push(g.id));
    add(rp(g.q), (e) => e.ends.push(g.id));
  }
  const snap = () => queue.map((e) => ({ ...e, starts: [...e.starts], ends: [...e.ends] }));
  run.s = { ...run.s, queue: snap() };
  yield {
    state: run.s,
    marks: [],
    say: `Put the ${2 * run.s.segs.length} end points into the event queue, ordered by x and then by y${queue.length < 2 * run.s.segs.length ? ' (shared end points become one event)' : ''}. Crossings join the queue as the sweep finds them.`,
    lines: ['bo.init'],
    vars: vars(run.s),
    level: 2,
  };
  const findEvent = function* (a: number, b: number, p: RPt): Generator<IStep, void, void> {
    const ga = byId(run.s, a);
    const gb = byId(run.s, b);
    const at = crossing(ga, gb);
    const ahead = at !== null && ptCmp(at, p) > 0;
    const known = ahead && queue.some((q) => samePt(q, at));
    if (ahead && !known) add(at, (e) => (e.cross = true));
    run.s = { ...run.s, tests: run.s.tests + 1, queue: snap() };
    yield {
      state: run.s,
      marks: [mark(segId(a), 'compare'), mark(segId(b), 'compare')],
      say: `Test the new neighbours ${ga.name} and ${gb.name}: ${at === null ? 'they do not meet.' : !ahead ? `they meet at ${ptText(at)}, which the sweep has already passed.` : known ? `they meet at ${ptText(at)}, already in the queue.` : `they cross at ${ptText(at)}, ahead of the sweep. Add it to the event queue.`}`,
      lines: ['bo.find'],
      vars: vars(run.s),
      level: ahead && !known ? 2 : 3,
      extra: { test: [a, b], ...(at ? { at } : {}) },
    };
  };
  while (queue.length) {
    const e = queue.shift()!;
    run.s = { ...run.s, queue: snap(), sweep: { x: e.x, y: e.y } };
    const through = run.s.status.filter((id) => {
      const g = byId(run.s, id);
      return eq(yAt(g, e.x), e.y);
    });
    const ends = through.filter((id) => e.ends.includes(id));
    const inner = through.filter((id) => !e.ends.includes(id));
    const all = [...new Set([...e.starts, ...ends, ...inner])];
    const what = [
      e.starts.length ? `the left end of ${names(run.s, e.starts)}` : '',
      e.ends.length ? `the right end of ${names(run.s, e.ends)}` : '',
      inner.length ? `a crossing of ${names(run.s, inner)}` : '',
    ]
      .filter(Boolean)
      .join(', ');
    yield {
      state: run.s,
      marks: all.map((id) => mark(segId(id), 'active')),
      say: `Sweep to ${ptText(e)}: ${what}.`,
      lines: ['bo.next'],
      vars: vars(run.s),
      level: 2,
    };
    if (all.length > 1) {
      run.s = {
        ...run.s,
        hits: [...run.s.hits, { x: e.x, y: e.y, segs: all.sort((a, b) => a - b) }],
      };
      yield {
        state: run.s,
        marks: all.map((id) => mark(segId(id), 'found')),
        say: `${names(run.s, all)} meet at ${ptText(e)}. Report it (intersection ${run.s.hits.length}).`,
        lines: ['bo.report'],
        vars: vars(run.s),
        level: 2,
      };
    }
    // Take out the segments that end here or pass through; put back the ones that go on.
    const out = new Set([...ends, ...inner]);
    run.s = {
      ...run.s,
      status: run.s.status.filter((id) => !out.has(id)),
      passed: [...run.s.passed, ...ends],
    };
    const back = [...e.starts, ...inner];
    const idx = run.s.status.filter((id) => cmp(yAt(byId(run.s, id), e.x), e.y) < 0).length;
    const block = [...back].sort((a, b) => slopeCmp(byId(run.s, a), byId(run.s, b)));
    const status = [...run.s.status];
    status.splice(idx, 0, ...block);
    run.s = { ...run.s, status };
    yield {
      state: run.s,
      marks: [
        ...block.map((id) => mark(segId(id), 'new')),
        ...ends.map((id) => mark(segId(id), 'stale')),
      ],
      say: `${ends.length ? `Remove ${names(run.s, ends)}, which ${ends.length === 1 ? 'ends' : 'end'} here. ` : ''}${inner.length ? `Swap ${names(run.s, inner)}: past the crossing, their order flips. ` : ''}${e.starts.length ? `Insert ${names(run.s, e.starts)}. ` : ''}Status, bottom to top: ${run.s.status.length ? run.s.status.map((id) => byId(run.s, id).name).join(', ') : 'empty'}.`,
      lines: ['bo.update'],
      vars: vars(run.s),
      level: 2,
    };
    if (block.length === 0) {
      const sl = run.s.status[idx - 1];
      const sr = run.s.status[idx];
      if (sl !== undefined && sr !== undefined) yield* findEvent(sl, sr, e);
    } else {
      const sl = run.s.status[idx - 1];
      const sr = run.s.status[idx + block.length];
      if (sl !== undefined) yield* findEvent(sl, block[0]!, e);
      if (sr !== undefined) yield* findEvent(block.at(-1)!, sr, e);
    }
  }
}

const sweep: Op = {
  label: 'Sweep',
  arity: 0,
  *run(s0, _args, { settings }) {
    const run: Run = { s: { ...init(), segs: s0.segs, nextId: s0.nextId } };
    if (s0.segs.length < 2) {
      yield {
        state: run.s,
        marks: [],
        say: s0.segs.length
          ? 'There is only one segment, so nothing can intersect.'
          : 'There are no segments. Load some first.',
        lines: [],
        vars: vars(run.s),
        level: 1,
      };
      return run.s;
    }
    if (settings.mode === 'any') {
      yield* anySweep(run);
      const hit = run.s.hits[0];
      run.s = { ...run.s, answer: hit !== undefined, queue: hit ? run.s.queue : [] };
      yield {
        state: run.s,
        marks: hit ? hit.segs.map((id) => mark(segId(id), 'found')) : [],
        say: hit
          ? `Yes: ${names(run.s, hit.segs)} intersect at ${ptText(hit)}. Stop at the first one found, after ${run.s.tests} test${run.s.tests === 1 ? '' : 's'}; ${run.s.queue.length} event${run.s.queue.length === 1 ? ' was' : 's were'} never looked at.`
          : `No two segments intersect. The sweep made ${run.s.tests} neighbour test${run.s.tests === 1 ? '' : 's'}, against ${(run.s.segs.length * (run.s.segs.length - 1)) / 2} pairs for brute force.`,
        lines: [hit ? 'any.true' : 'any.false'],
        vars: vars(run.s),
        level: 1,
      };
      return run.s;
    }
    yield* allSweep(run);
    run.s = { ...run.s, answer: run.s.hits.length > 0 };
    const k = run.s.hits.length;
    yield {
      state: run.s,
      marks: [],
      say: `The sweep is done: ${k === 0 ? 'no intersections' : `${k} intersection point${k === 1 ? '' : 's'}: ${run.s.hits.map((h) => `${names(run.s, h.segs)} at ${ptText(h)}`).join('; ')}`}. ${run.s.tests} neighbour tests, against ${(run.s.segs.length * (run.s.segs.length - 1)) / 2} pairs for brute force.`,
      lines: ['bo.done'],
      vars: vars(run.s),
      level: 1,
    };
    return run.s;
  },
};

export const ops = { load, sweep, clear };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: SISettings): PseudoBlock[] {
  if (settings.mode === 'any')
    return [
      {
        op: 'sweep',
        lines: [
          L('any.sig', 0, 'ANY-SEGMENTS-INTERSECT(S)', 'Do any two of the segments S intersect?'),
          L(
            'any.sort',
            1,
            'T = ∅; sort the end points by x (left ends first, then by y)',
            'Start with an empty status T and sort the end points left to right.',
          ),
          L('any.loop', 1, 'for each end point p, in order', 'Sweep a vertical line across them:'),
          L('any.left', 2, 'if p is the left end of segment s', 'At the left end of a segment s,'),
          L('any.insert', 3, 'INSERT(T, s)', 'add s to the status at its height.'),
          L(
            'any.ltest',
            3,
            'if ABOVE(T, s) or BELOW(T, s) exists and intersects s: return TRUE',
            'If s meets the segment just above or just below it, answer yes.',
          ),
          L('any.right', 2, 'if p is the right end of segment s', 'At the right end of s,'),
          L(
            'any.rtest',
            3,
            'if ABOVE(T, s) and BELOW(T, s) exist and intersect: return TRUE',
            'its two neighbours are about to become neighbours: if they meet, answer yes.',
          ),
          L('any.delete', 3, 'DELETE(T, s)', 'Remove s from the status.'),
          L('any.true', 1, 'return TRUE (found)', 'Some pair intersects.'),
          L('any.false', 1, 'return FALSE', 'No two segments intersect.'),
        ],
      },
    ];
  return [
    {
      op: 'sweep',
      lines: [
        L('bo.sig', 0, 'BENTLEY-OTTMANN(S)', 'Report every point where segments of S meet:'),
        L(
          'bo.init',
          1,
          'Q = all end points, by x then y; T = ∅',
          'Queue up the end points left to right; the status starts empty.',
        ),
        L('bo.next', 1, 'while Q is not empty: p = the next event', 'Take the next event point p:'),
        L(
          'bo.report',
          2,
          'if p lies on two or more segments: report p',
          'If two or more segments meet at p, report it.',
        ),
        L(
          'bo.update',
          2,
          'delete segments ending at or passing p; insert those starting at or passing p, by slope',
          'Take out what ends here, put back what goes on in its new order (crossing segments swap).',
        ),
        L(
          'bo.find',
          2,
          'for each pair of new neighbours: if they cross right of p, add the crossing to Q',
          'Only new neighbours can cross next: test them and queue any crossing ahead.',
        ),
        L('bo.done', 1, 'return the reported points', 'Every intersection has been reported.'),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'No segments yet. Type end points in pairs, such as 1,2 9,8 2,9 10,3, and press Load segments, or pick a preset. Then press Sweep.';
}

export function initialVars(state: S) {
  return vars(state);
}

export function describe(state: S): string {
  if (state.segs.length === 0) return 'An empty plane with no segments.';
  const segs = state.segs
    .map((g) => `${g.name} from (${g.p.x}, ${g.p.y}) to (${g.q.x}, ${g.q.y})`)
    .join(', ');
  const sweep = state.sweep ? ` Sweep line at x = ${fmt(state.sweep.x)}.` : '';
  const status = state.sweep
    ? ` Status, bottom to top: ${state.status.map((id) => byId(state, id).name).join(', ') || 'empty'}.`
    : '';
  const hits = state.hits.length
    ? ` Intersections: ${state.hits.map((h) => `${h.segs.map((id) => byId(state, id).name).join(' and ')} at ${ptText(h)}`).join('; ')}.`
    : state.answer === false
      ? ' No intersections.'
      : '';
  return `${state.segs.length} segments: ${segs}.${sweep}${status}${hits}`;
}
