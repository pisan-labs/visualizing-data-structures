import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { at, dist2, nameOf, pointsArg, type NPt } from '../_spatial/kit';

/** Coordinates are whole numbers in [0, MAX]. */
export const MAX = 12;
export const MOST = 20;

export type Method = 'divide' | 'brute';

/** One call of the recursion: a run of the points sorted by x. */
export interface Call {
  lo: number;
  hi: number;
  /** The dividing line x = xm, once chosen. */
  xm: number | null;
  /** δ² for this call once both halves have answered. */
  d2: number | null;
}

export interface CPState {
  points: NPt[];
  /** Point ids sorted by x (then y), once a run has sorted them. */
  byX: number[];
  /** The recursion, outermost call first. */
  calls: Call[];
  /** The δ-strip being checked: ids sorted by y. */
  strip: number[];
  /** Half-width of the strip, as a squared distance (δ²). */
  stripD2: number | null;
  /** The best pair found so far in the focused call, and its squared distance. */
  pair: [number, number] | null;
  d2: number | null;
  /** The answer once a run ends. */
  answer: [number, number] | null;
  comparisons: number;
  nextId: number;
}

export interface CPSettings {
  [key: string]: Scalar;
  method: Method;
}

export interface CPExtra {
  /** The pair being compared. */
  compare?: [number, number];
}

type S = CPState;
type X = CPExtra;
type Op = OpSpec<S, CPSettings, X>;
type CStep = Step<S, X>;

export const defaults: CPSettings = { method: 'divide' };

export function init(): S {
  return {
    points: [],
    byX: [],
    calls: [],
    strip: [],
    stripD2: null,
    pair: null,
    d2: null,
    answer: null,
    comparisons: 0,
    nextId: 1,
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const ptId = (id: number) => `pt-${id}`;
export const byId = (s: S, id: number) => s.points.find((p) => p.id === id)!;

const fresh = (s: S): S => ({ ...init(), points: s.points, nextId: s.nextId });

export const pairs = (n: number) => (n * (n - 1)) / 2;

/** √d² written for learners: whole when it is a square, otherwise √d² ≈ 1.41. */
export function rootText(d2: number): string {
  const r = Math.sqrt(d2);
  return Number.isInteger(r) ? String(r) : `√${d2} ≈ ${r.toFixed(2)}`;
}

export function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return {
    n: s.points.length,
    ...more,
    'δ²': s.d2 ?? '∞',
    comparisons: s.comparisons,
    'brute force': pairs(s.points.length),
  };
}

function readArg(v: Value | undefined, rng: Rng) {
  return pointsArg(v, rng, MAX, MOST, 0, MAX);
}

function* addPoints(s: S, v: Value | undefined, rng: Rng, replace: boolean) {
  const pts = readArg(v, rng);
  const what = replace ? 'load' : 'add';
  if (typeof pts === 'string') {
    yield {
      state: s,
      marks: [],
      say: `${what}: ${pts}`,
      lines: [],
      vars: vars(s),
      level: 1,
    } satisfies CStep;
    return s;
  }
  const base = replace ? init() : fresh(s);
  if (base.points.length + pts.length > MOST) {
    yield {
      state: s,
      marks: [],
      say: `add: there are already ${s.points.length} points, and at most ${MOST} fit. Nothing was added.`,
      lines: [],
      vars: vars(s),
      level: 1,
    } satisfies CStep;
    return s;
  }
  let next = base.nextId;
  const added: NPt[] = pts.map((p) => {
    const id = next++;
    return { id, name: nameOf(id), x: p.x, y: p.y };
  });
  const end: S = { ...base, points: [...base.points, ...added], nextId: next };
  yield {
    state: end,
    marks: added.map((p) => mark(ptId(p.id), 'new')),
    say: `${replace ? 'Load' : 'Add'} ${added.length === 1 ? 'one point' : `${added.length} points`}: ${added.map(at).join(', ')}.`,
    lines: [],
    vars: vars(end),
    level: 1,
  } satisfies CStep;
  return end;
}

const load: Op = {
  label: 'Load points',
  arity: 1,
  *run(s, [v], { rng }) {
    return yield* addPoints(s, v, rng, true);
  },
};

const addOp: Op = {
  label: 'Add points',
  arity: 1,
  *run(s, [v], { rng }) {
    return yield* addPoints(s, v, rng, false);
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
      say: s.points.length ? 'Clear: every point is gone.' : 'Clear: there were no points.',
      lines: [],
      vars: vars(end),
      level: 1,
    };
    return end;
  },
};

// ----- The algorithms -----

interface Run {
  s: S;
}

const names = (s: S, ids: number[]) => ids.map((id) => byId(s, id).name).join(', ');

/** Compare one pair; returns its squared distance. */
function* compare(
  run: Run,
  a: number,
  b: number,
  line: string,
  where: string,
): Generator<CStep, number, void> {
  const p = byId(run.s, a);
  const q = byId(run.s, b);
  const d = dist2(p, q);
  const better = run.s.d2 === null || d < run.s.d2;
  run.s = {
    ...run.s,
    comparisons: run.s.comparisons + 1,
    ...(better ? { pair: [a, b] as [number, number], d2: d } : {}),
  };
  yield {
    state: run.s,
    marks: [mark(ptId(a), 'active'), mark(ptId(b), 'active')],
    say: `${where}${p.name}–${q.name}: (${p.x} − ${q.x})² + (${p.y} − ${q.y})² = ${d}.${better ? ` The closest so far${d === 0 ? ': the same point twice' : ''}.` : ''}`,
    lines: [line],
    vars: vars(run.s),
    level: better ? 2 : 3,
    extra: { compare: [a, b] },
  };
  return d;
}

function setCall(run: Run, depth: number, patch: Partial<Call>) {
  run.s = {
    ...run.s,
    calls: run.s.calls.map((c, i) => (i === depth ? { ...c, ...patch } : c)),
  };
}

/** CLOSEST(P) on byX[lo, hi), with ys the same points sorted by y. Returns the pair and δ². */
function* closest(
  run: Run,
  lo: number,
  hi: number,
  ys: number[],
  depth: number,
): Generator<CStep, { pair: [number, number] | null; d2: number | null }, void> {
  const ids = run.s.byX.slice(lo, hi);
  run.s = {
    ...run.s,
    calls: [...run.s.calls.slice(0, depth), { lo, hi, xm: null, d2: null }],
    pair: null,
    d2: null,
    strip: [],
    stripD2: null,
  };
  const n = hi - lo;
  if (n <= 3) {
    yield {
      state: run.s,
      marks: ids.map((id) => mark(ptId(id), 'visit')),
      say: `${names(run.s, ids)}: only ${n} point${n === 1 ? '' : 's'}, so compare ${n === 1 ? 'nothing (one point has no pair)' : `every pair (${pairs(n)})`}.`,
      lines: ['cp.base'],
      vars: vars(run.s),
      level: 2,
    };
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) yield* compare(run, ids[i]!, ids[j]!, 'cp.base', '');
    setCall(run, depth, { d2: run.s.d2 });
    return { pair: run.s.pair, d2: run.s.d2 };
  }
  const mid = Math.floor(n / 2);
  const xm = byId(run.s, run.s.byX[lo + mid]!).x;
  const left = new Set(run.s.byX.slice(lo, lo + mid));
  setCall(run, depth, { xm });
  yield {
    state: run.s,
    marks: ids.map((id) => mark(ptId(id), left.has(id) ? 'g1' : 'g2')),
    say: `${n} points: split them at the line x = ${xm} into a left half ${names(run.s, [...left])} and a right half ${names(
      run.s,
      ids.filter((id) => !left.has(id)),
    )}.`,
    lines: ['cp.split'],
    vars: vars(run.s),
    level: 2,
  };
  const yl = ys.filter((id) => left.has(id));
  const yr = ys.filter((id) => !left.has(id));
  const L = yield* closest(run, lo, lo + mid, yl, depth + 1);
  const R = yield* closest(run, lo + mid, hi, yr, depth + 1);
  // Back in this call.
  const useLeft = R.d2 === null || (L.d2 !== null && L.d2 <= R.d2);
  const best = useLeft ? L : R;
  run.s = {
    ...run.s,
    calls: run.s.calls.slice(0, depth + 1),
    pair: best.pair,
    d2: best.d2,
  };
  setCall(run, depth, { d2: best.d2 });
  const d2 = best.d2!;
  const strip = ys.filter((id) => (byId(run.s, id).x - xm) ** 2 < d2);
  run.s = { ...run.s, strip, stripD2: d2 };
  const [a, b] = best.pair!;
  yield {
    state: run.s,
    marks: [
      mark(ptId(a), 'found'),
      mark(ptId(b), 'found'),
      ...strip.map((id) => mark(ptId(id), 'compare')),
    ],
    say: `Back in ${names(run.s, ids)}. Left: δ² = ${L.d2}; right: δ² = ${R.d2}. So δ = ${rootText(d2)}. A closer pair would have to cross the line, with both points less than δ from it: the strip holds ${strip.length ? names(run.s, strip) : 'no points'}.`,
    lines: ['cp.delta', 'cp.strip'],
    vars: vars(run.s, { strip: strip.length }),
    level: 2,
  };
  let checks = 0;
  for (let i = 0; i < strip.length; i++) {
    for (let j = i + 1; j < strip.length; j++) {
      const p = byId(run.s, strip[i]!);
      const q = byId(run.s, strip[j]!);
      if ((q.y - p.y) ** 2 >= run.s.d2!) break;
      checks++;
      yield* compare(
        run,
        p.id,
        q.id,
        'cp.check',
        `In the strip, ${q.name} is less than δ above ${p.name}: `,
      );
    }
  }
  setCall(run, depth, { d2: run.s.d2 });
  const [c, d] = run.s.pair!;
  yield {
    state: run.s,
    marks: [mark(ptId(c), 'found'), mark(ptId(d), 'found')],
    say: `${names(run.s, ids)} is done after ${checks} strip comparison${checks === 1 ? '' : 's'} (each point is checked against at most 7 above it, and only while they are less than δ apart in y). Its closest pair is ${byId(run.s, c).name}–${byId(run.s, d).name}, δ² = ${run.s.d2}.`,
    lines: ['cp.ret'],
    vars: vars(run.s),
    level: 2,
  };
  return { pair: run.s.pair, d2: run.s.d2 };
}

function* divide(run: Run): Generator<CStep, void, void> {
  const byX = [...run.s.points]
    .sort((a, b) => a.x - b.x || a.y - b.y || a.id - b.id)
    .map((p) => p.id);
  const ys = [...run.s.points]
    .sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id)
    .map((p) => p.id);
  run.s = { ...run.s, byX };
  yield {
    state: run.s,
    marks: [],
    say: `Sort the points by x once: ${names(run.s, byX)}. Keep a second copy sorted by y (${names(run.s, ys)}) and split it along with each half, so the strip never has to be sorted again.`,
    lines: ['cp.sort'],
    vars: vars(run.s),
    level: 2,
  };
  yield* closest(run, 0, byX.length, ys, 0);
  run.s = { ...run.s, calls: [], strip: [], stripD2: null };
}

function* brute(run: Run): Generator<CStep, void, void> {
  const pts = run.s.points;
  yield {
    state: run.s,
    marks: [],
    say: `Brute force: compare every pair of the ${pts.length} points, ${pairs(pts.length)} pairs in all.`,
    lines: ['bf.loop'],
    vars: vars(run.s),
    level: 2,
  };
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      yield* compare(run, pts[i]!.id, pts[j]!.id, 'bf.cmp', '');
}

const run: Op = {
  label: 'Find closest pair',
  arity: 0,
  *run(s, _args, { settings }) {
    const r: Run = { s: fresh(s) };
    if (s.points.length < 2) {
      yield {
        state: r.s,
        marks: [],
        say:
          s.points.length === 0
            ? 'There are no points. Load some points first.'
            : 'There is only one point, so there is no pair.',
        lines: [],
        vars: vars(r.s),
        level: 1,
      };
      return r.s;
    }
    if (settings.method === 'brute') yield* brute(r);
    else yield* divide(r);
    r.s = { ...r.s, answer: r.s.pair };
    const [a, b] = r.s.pair!;
    const p = byId(r.s, a);
    const q = byId(r.s, b);
    const n = r.s.points.length;
    yield {
      state: r.s,
      marks: [mark(ptId(a), 'found'), mark(ptId(b), 'found')],
      say: `The closest pair is ${at(p)} and ${at(q)}, at distance ${rootText(r.s.d2!)}. ${r.s.comparisons} comparisons; brute force needs ${pairs(n)}.`,
      lines: [settings.method === 'brute' ? 'bf.ret' : 'cp.ret'],
      vars: vars(r.s),
      level: 1,
    };
    return r.s;
  },
};

export const ops = { load, add: addOp, closest: run, clear };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: CPSettings): PseudoBlock[] {
  if (settings.method === 'brute')
    return [
      {
        op: 'closest',
        lines: [
          L('bf.sig', 0, 'BRUTE-CLOSEST(P)', 'To find the closest pair by brute force:'),
          L(
            'bf.loop',
            1,
            'for i = 1 to n − 1, for j = i + 1 to n',
            'Take every pair of points once,',
          ),
          L(
            'bf.cmp',
            2,
            'if dist²(P[i], P[j]) < δ²: δ² = dist²(P[i], P[j])',
            'and keep the closest.',
          ),
          L('bf.ret', 1, 'return the closest pair', 'n(n − 1)/2 comparisons, always.'),
        ],
      },
    ];
  return [
    {
      op: 'closest',
      lines: [
        L(
          'cp.sort',
          0,
          'X = P sorted by x; Y = P sorted by y',
          'Sort the points by x, and keep a copy sorted by y.',
        ),
        L('cp.sig', 0, 'CLOSEST(X, Y)', 'To find the closest pair among these points:'),
        L(
          'cp.base',
          1,
          'if |X| ≤ 3: compare every pair; return',
          'Three points or fewer: compare every pair.',
        ),
        L(
          'cp.split',
          1,
          'split X at the middle, x = xm; split Y the same way',
          'Cut the points in half with a vertical line.',
        ),
        L('cp.rec', 1, 'δL = CLOSEST(left); δR = CLOSEST(right)', 'Solve each half on its own.'),
        L('cp.delta', 1, 'δ = min(δL, δR)', 'δ is the better of the two answers.'),
        L(
          'cp.strip',
          1,
          'S = points of Y with |x − xm| < δ, in y order',
          'A closer pair must cross the line: keep the points within δ of it, bottom to top.',
        ),
        L(
          'cp.check',
          1,
          'for each p in S, compare with the next points while their y is < δ above p (at most 7)',
          'Compare each strip point with the few just above it.',
        ),
        L('cp.ret', 1, 'return the closest pair seen', 'Return the best pair found.'),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'No points yet. Type points such as 1,2 5,1 3,4 and press Load points, or pick a preset, then press Find closest pair.';
}

export function initialVars(state: S) {
  return vars(state);
}

export function describe(state: S): string {
  if (state.points.length === 0) return 'An empty plane with no points.';
  const pts = state.points.map(at).join(', ');
  const a = state.answer ?? state.pair;
  const pair = a
    ? ` ${state.answer ? 'Closest pair' : 'Closest so far'}: ${byId(state, a[0]).name} and ${byId(state, a[1]).name}, distance² ${state.d2}.`
    : '';
  const line = state.calls.at(-1)?.xm ?? null;
  return `${state.points.length} points: ${pts}.${line !== null ? ` Dividing line x = ${line}.` : ''}${pair}`;
}
