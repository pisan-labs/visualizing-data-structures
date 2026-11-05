import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { orient, readPoints, type Vec } from '../../layouts/plane';

/** Coordinates are whole numbers in [0, MAX]. */
export const MAX = 12;
/** At most this many points, so every point has a one-letter name. */
export const MOST = 26;

export interface HPt {
  id: number;
  name: string;
  x: number;
  y: number;
}

export type Algorithm = 'graham' | 'monotone' | 'jarvis';

export interface HullState {
  points: HPt[];
  /** Points set aside by the last run: duplicates, and (Graham) nearer points on one angle. */
  dropped: number[];
  /** Graham's p0, or the gift wrap's starting point. */
  pivot: number | null;
  /** Processing order of the last run (ids), shown as small numbers. */
  order: number[];
  /** The chain being built: Graham's stack, the current monotone chain, the wrap so far. */
  stack: number[];
  /** Monotone chain: the finished lower hull while the upper one is built. */
  lower: number[];
  /** The finished hull, counter-clockwise; null until a run ends. */
  hull: number[] | null;
  /** Orientation tests and pops in the last run. */
  tests: number;
  pops: number;
  nextId: number;
}

export interface HullSettings {
  [key: string]: Scalar;
  algorithm: Algorithm;
}

export type TurnKind = 'left' | 'right' | 'collinear';

export interface HullExtra {
  /** The turn a → b → c being tested, with its cross product. */
  turn?: { a: number; b: number; c: number; cross: number };
  /** Gift wrapping: the current corner p, the best candidate q so far. */
  current?: number;
  candidate?: number;
  /** Just popped off the stack. */
  popped?: number;
  /** Draw rays from the pivot to every point in order (the polar sort). */
  rays?: boolean;
}

type S = HullState;
type X = HullExtra;
type Op = OpSpec<S, HullSettings, X>;
type HStep = Step<S, X>;

export const defaults: HullSettings = { algorithm: 'graham' };

export function init(): S {
  return {
    points: [],
    dropped: [],
    pivot: null,
    order: [],
    stack: [],
    lower: [],
    hull: null,
    tests: 0,
    pops: 0,
    nextId: 1,
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const ptId = (id: number) => `pt-${id}`;

export const nameOf = (k: number) => String.fromCharCode(65 + ((k - 1) % 26));
export const at = (p: HPt) => `${p.name}(${p.x}, ${p.y})`;

export const turnKind = (cross: number): TurnKind =>
  cross > 0 ? 'left' : cross < 0 ? 'right' : 'collinear';

const fresh = (s: S): S => ({
  ...s,
  dropped: [],
  pivot: null,
  order: [],
  stack: [],
  lower: [],
  hull: null,
  tests: 0,
  pops: 0,
});

export function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return {
    n: s.points.length,
    ...more,
    stack: s.stack.length ? s.stack.map((id) => byId(s, id).name).join(' ') : '(empty)',
    tests: s.tests,
    pops: s.pops,
    ...(s.hull ? { h: s.hull.length } : {}),
  };
}

const byId = (s: S, id: number) => s.points.find((p) => p.id === id)!;

/** Random whole-number points inside the window, away from its edges. */
export function randomPoints(rng: Rng, n: number): Vec[] {
  return Array.from({ length: n }, () => ({ x: rng.int(1, MAX - 1), y: rng.int(1, MAX - 1) }));
}

/** A load or add argument: a list "1,2 3,4", or a count of random points. */
function readArg(v: Value | undefined, rng: Rng): Vec[] | string {
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || v < 1 || v > 20)
      return `${v} is not a list of points. Type points such as 1,2 3,4, or a count from 1 to 20 for random points.`;
    return randomPoints(rng, v);
  }
  if (typeof v !== 'string') return 'Type points such as 1,2 3,4.';
  if (/^\s*\d+\s*$/.test(v)) return readArg(Number(v), rng);
  return readPoints(v, 0, MAX, MOST);
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
    } satisfies HStep;
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
    } satisfies HStep;
    return s;
  }
  let next = base.nextId;
  const added: HPt[] = pts.map((p) => {
    const id = next++;
    return { id, name: nameOf(id), x: p.x, y: p.y };
  });
  const end: S = { ...base, points: [...base.points, ...added], nextId: next };
  const dups = added.filter((p) =>
    end.points.some((q) => q.id < p.id && q.x === p.x && q.y === p.y),
  ).length;
  const listed = added.map(at).join(', ');
  yield {
    state: end,
    marks: added.map((p) => mark(ptId(p.id), 'new')),
    say: `${replace ? 'Load' : 'Add'} ${added.length === 1 ? 'one point' : `${added.length} points`}: ${listed}.${dups ? ` ${dups === 1 ? 'One of them repeats' : `${dups} of them repeat`} an earlier point.` : ''}`,
    lines: [],
    vars: vars(end),
    level: 1,
  } satisfies HStep;
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
    } satisfies HStep;
    return end;
  },
};

// ----- The hull algorithms -----

/** The arithmetic of one turn test, written out. */
export function turnText(a: HPt, b: HPt, c: HPt): string {
  const d1x = b.x - a.x;
  const d1y = b.y - a.y;
  const d2x = c.x - a.x;
  const d2y = c.y - a.y;
  const v = d1x * d2y - d1y * d2x;
  const p = (n: number) => (n < 0 ? `(${n})` : String(n));
  const kind = turnKind(v);
  const word =
    kind === 'left'
      ? `${v} > 0: a left turn`
      : kind === 'right'
        ? `${v} < 0: a right turn`
        : '0: the three points are collinear';
  return `TURN(${a.name}, ${b.name}, ${c.name}) = ${p(d1x)}·${p(d2y)} − ${p(d1y)}·${p(d2x)} = ${word}`;
}

interface Run {
  s: S;
}

/** One shared first step: keep one copy of each point. Returns the distinct points. */
function* dedupe(run: Run): Generator<HStep, HPt[], void> {
  const seen = new Map<string, HPt>();
  const dropped: HPt[] = [];
  for (const p of run.s.points) {
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) dropped.push(p);
    else seen.set(key, p);
  }
  if (dropped.length) {
    run.s = { ...run.s, dropped: dropped.map((p) => p.id) };
    yield {
      state: run.s,
      marks: dropped.map((p) => mark(ptId(p.id), 'remove')),
      say: `${dropped.map((p) => `${p.name} repeats ${seen.get(`${p.x},${p.y}`)!.name}`).join(', ')}. A repeated point would make a zero-length edge, so keep one copy of each.`,
      lines: ['hull.dup'],
      vars: vars(run.s),
      level: 2,
    };
  }
  return [...seen.values()];
}

function* tooFew(run: Run, pts: HPt[]): Generator<HStep, boolean, void> {
  if (pts.length >= 2) return false;
  run.s = { ...run.s, hull: pts.map((p) => p.id), stack: pts.map((p) => p.id) };
  yield {
    state: run.s,
    marks: pts.map((p) => mark(ptId(p.id), 'done')),
    say:
      pts.length === 0
        ? 'There are no points, so there is no hull. Load some points first.'
        : `There is only one distinct point, ${at(pts[0]!)}, so the hull is that point.`,
    lines: ['hull.ret'],
    vars: vars(run.s),
    level: 1,
  };
  return true;
}

/** One turn test on the chain `chain` with the new point p. Returns whether p turns left. */
function* testTurn(
  run: Run,
  chain: 'stack',
  a: HPt,
  b: HPt,
  c: HPt,
  lines: string[],
): Generator<HStep, number, void> {
  run.s = { ...run.s, tests: run.s.tests + 1 };
  const cross = orient(a, b, c);
  const kind = turnKind(cross);
  void chain;
  yield {
    state: run.s,
    marks: [
      mark(ptId(c.id), 'active'),
      mark(ptId(b.id), kind === 'left' ? 'visit' : 'error'),
      mark('turn', kind === 'left' ? 'new' : 'error'),
    ],
    say: `Does ${a.name} → ${b.name} → ${c.name} turn left? ${turnText(a, b, c)}.${kind === 'left' ? '' : ` Not a left turn, so ${b.name} cannot be a corner.`}`,
    lines,
    vars: vars(run.s, { turn: kind, cross }),
    level: 2,
    extra: { turn: { a: a.id, b: b.id, c: c.id, cross } },
  };
  return cross;
}

function* pop(run: Run, b: HPt, line: string, why: string): Generator<HStep, void, void> {
  run.s = { ...run.s, stack: run.s.stack.slice(0, -1), pops: run.s.pops + 1 };
  yield {
    state: run.s,
    marks: [mark(ptId(b.id), 'remove')],
    say: `Pop ${b.name}. ${why}`,
    lines: [line],
    vars: vars(run.s),
    level: 2,
    extra: { popped: b.id },
  };
}

function* push(run: Run, p: HPt, line: string, why: string): Generator<HStep, void, void> {
  run.s = { ...run.s, stack: [...run.s.stack, p.id] };
  yield {
    state: run.s,
    marks: [mark(ptId(p.id), 'new')],
    say: `Push ${p.name}. ${why}`,
    lines: [line],
    vars: vars(run.s),
    level: 2,
  };
}

/** The scan shared by Graham and the two halves of the monotone chain. */
function* scan(
  run: Run,
  pts: HPt[],
  ids: { loop: string; test: string; pop: string; push: string },
  side = '',
): Generator<HStep, void, void> {
  const get = (id: number) => byId(run.s, id);
  for (const p of pts) {
    while (run.s.stack.length >= 2) {
      const a = get(run.s.stack[run.s.stack.length - 2]!);
      const b = get(run.s.stack[run.s.stack.length - 1]!);
      const cross = yield* testTurn(run, 'stack', a, b, p, [ids.test, 'hull.cross']);
      if (cross > 0) break;
      yield* pop(
        run,
        b,
        ids.pop,
        cross < 0
          ? `${b.name} sits inside the turn ${a.name} → ${p.name}${side}.`
          : `${b.name} lies on the line from ${a.name} to ${p.name}, so it is not a corner.`,
      );
    }
    const top = run.s.stack.length ? get(run.s.stack[run.s.stack.length - 1]!) : null;
    yield* push(
      run,
      p,
      ids.push,
      top
        ? `The chain now ends ${top.name} → ${p.name}${run.s.stack.length >= 1 ? ', and every turn along it is a left turn' : ''}.`
        : `It starts the chain.`,
    );
  }
}

function* finish(run: Run, hull: number[], algo: string): Generator<HStep, S, void> {
  run.s = { ...run.s, hull, stack: hull, lower: [] };
  const names = hull.map((id) => byId(run.s, id).name).join(', ');
  const n = run.s.points.length;
  yield {
    state: run.s,
    marks: hull.map((id) => mark(ptId(id), 'done')),
    say:
      hull.length === 2
        ? `Done. Every point lies on one line, so the "hull" is the segment ${names}. ${algo} used ${run.s.tests} turn tests.`
        : `Done. The hull has ${hull.length} of the ${n} points as corners, counter-clockwise: ${names}. ${algo} used ${run.s.tests} turn tests${run.s.pops ? ` and ${run.s.pops} pops` : ''}.`,
    lines: ['hull.ret'],
    vars: vars(run.s),
    level: 1,
  };
  return run.s;
}

function* graham(run: Run): Generator<HStep, S, void> {
  const pts = yield* dedupe(run);
  if (yield* tooFew(run, pts)) return run.s;
  const p0 = pts.reduce((m, p) => (p.y < m.y || (p.y === m.y && p.x < m.x) ? p : m));
  run.s = { ...run.s, pivot: p0.id };
  yield {
    state: run.s,
    marks: [mark(ptId(p0.id), 'found')],
    say: `p0 = ${at(p0)}, the lowest point (leftmost of the lowest). Nothing is below it, so it must be a corner of the hull.`,
    lines: ['hull.pivot'],
    vars: vars(run.s),
    level: 2,
  };
  const d2 = (p: HPt) => (p.x - p0.x) ** 2 + (p.y - p0.y) ** 2;
  const rest = pts
    .filter((p) => p !== p0)
    .sort((a, b) => {
      const o = orient(p0, a, b);
      return o !== 0 ? -o : d2(a) - d2(b);
    });
  run.s = { ...run.s, order: [p0.id, ...rest.map((p) => p.id)] };
  yield {
    state: run.s,
    marks: [mark(ptId(p0.id), 'found')],
    say: `Sort the other points by the angle they make at p0, counter-clockwise from the right: ${rest.map((p) => p.name).join(', ')}. Comparing two angles is one turn test: b comes before c when p0 → b → c turns left.`,
    lines: ['hull.sort'],
    vars: vars(run.s),
    level: 2,
    extra: { rays: true },
  };
  // Of points on one ray from p0, only the farthest can be a corner.
  const kept: HPt[] = [];
  const same: HPt[] = [];
  rest.forEach((p, i) => {
    const next = rest[i + 1];
    if (next && orient(p0, p, next) === 0) same.push(p);
    else kept.push(p);
  });
  if (same.length) {
    run.s = {
      ...run.s,
      dropped: [...run.s.dropped, ...same.map((p) => p.id)],
      order: [p0.id, ...kept.map((p) => p.id)],
    };
    yield {
      state: run.s,
      marks: same.map((p) => mark(ptId(p.id), 'remove')),
      say: `${same.map((p) => p.name).join(', ')} ${same.length === 1 ? 'shares its angle' : 'share their angles'} with a farther point. A nearer point on the same ray from p0 lies on a segment between two other points, so set it aside.`,
      lines: ['hull.same'],
      vars: vars(run.s),
      level: 2,
      extra: { rays: true },
    };
  }
  yield* scan(run, [p0, ...kept], {
    loop: 'hull.loop',
    test: 'hull.while',
    pop: 'hull.pop',
    push: 'hull.push',
  });
  return yield* finish(run, run.s.stack, 'Graham scan');
}

function* monotone(run: Run): Generator<HStep, S, void> {
  const pts = yield* dedupe(run);
  if (yield* tooFew(run, pts)) return run.s;
  const sorted = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  run.s = { ...run.s, order: sorted.map((p) => p.id), pivot: sorted[0]!.id };
  yield {
    state: run.s,
    marks: [mark(ptId(sorted[0]!.id), 'found'), mark(ptId(sorted.at(-1)!.id), 'found')],
    say: `Sort the points by x, breaking ties by y: ${sorted.map((p) => p.name).join(', ')}. The first and the last, ${sorted[0]!.name} and ${sorted.at(-1)!.name}, are corners of the hull.`,
    lines: ['hull.sort'],
    vars: vars(run.s),
    level: 2,
  };
  yield {
    state: run.s,
    marks: [mark(ptId(sorted[0]!.id), 'found')],
    say: `Build the lower hull, left to right. It is a chain that only ever turns left.`,
    lines: ['hull.lower'],
    vars: vars(run.s),
    level: 2,
  };
  yield* scan(
    run,
    sorted,
    { loop: 'hull.lower', test: 'hull.lwhile', pop: 'hull.lpop', push: 'hull.lpush' },
    ', so it is above the lower hull',
  );
  const lower = run.s.stack;
  run.s = { ...run.s, lower, stack: [] };
  yield {
    state: run.s,
    marks: lower.map((id) => mark(ptId(id), 'visit')),
    say: `The lower hull is ${lower.map((id) => byId(run.s, id).name).join(', ')}. Now build the upper hull the same way, right to left.`,
    lines: ['hull.upper'],
    vars: vars(run.s, { lower: lower.map((id) => byId(run.s, id).name).join(' ') }),
    level: 2,
  };
  yield* scan(
    run,
    [...sorted].reverse(),
    { loop: 'hull.upper', test: 'hull.uwhile', pop: 'hull.upop', push: 'hull.upush' },
    ', so it is below the upper hull',
  );
  const upper = run.s.stack;
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return yield* finish(run, hull, 'The monotone chain');
}

function* jarvis(run: Run): Generator<HStep, S, void> {
  const pts = yield* dedupe(run);
  if (yield* tooFew(run, pts)) return run.s;
  const start = pts.reduce((m, p) => (p.x < m.x || (p.x === m.x && p.y < m.y) ? p : m));
  run.s = { ...run.s, pivot: start.id };
  yield {
    state: run.s,
    marks: [mark(ptId(start.id), 'found')],
    say: `Start at ${at(start)}, the leftmost point (lowest of the leftmost). Nothing is to its left, so it is a corner.`,
    lines: ['hull.start'],
    vars: vars(run.s),
    level: 2,
    extra: { current: start.id },
  };
  const d2 = (a: HPt, b: HPt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  let p = start;
  for (let guard = 0; guard <= pts.length; guard++) {
    run.s = { ...run.s, stack: [...run.s.stack, p.id] };
    let q = pts.find((r) => r !== p)!;
    yield {
      state: run.s,
      marks: [mark(ptId(p.id), 'found'), mark(ptId(q.id), 'compare')],
      say: `Add ${p.name} to the hull. Wrap around it: take ${q.name} as the first candidate for the next corner, then try every other point.`,
      lines: ['hull.add', 'hull.cand'],
      vars: vars(run.s, { p: p.name, q: q.name }),
      level: 2,
      extra: { current: p.id, candidate: q.id },
    };
    for (const r of pts) {
      if (r === p || r === q) continue;
      run.s = { ...run.s, tests: run.s.tests + 1 };
      const cross = orient(p, q, r);
      const kind = turnKind(cross);
      const better = cross < 0 || (cross === 0 && d2(p, r) > d2(p, q));
      const why = better
        ? kind === 'right'
          ? ` ${r.name} is to the right of ${p.name} → ${q.name}, so ${q.name} cannot be next. ${r.name} is the new candidate.`
          : ` ${r.name} is on the same line and farther away, so it becomes the candidate.`
        : kind === 'left'
          ? ` ${r.name} is to the left, so ${q.name} stays.`
          : ` ${r.name} is on the same line but nearer, so ${q.name} stays.`;
      yield {
        state: run.s,
        marks: [
          mark(ptId(p.id), 'found'),
          mark(ptId(q.id), 'compare'),
          mark(ptId(r.id), 'active'),
          mark('turn', better ? 'error' : 'new'),
        ],
        say: `${turnText(p, q, r)}.${why}`,
        lines: better ? ['hull.test', 'hull.better', 'hull.cross'] : ['hull.test', 'hull.cross'],
        vars: vars(run.s, { p: p.name, q: q.name, turn: kind, cross }),
        level: better ? 2 : 3,
        extra: { current: p.id, candidate: q.id, turn: { a: p.id, b: q.id, c: r.id, cross } },
      };
      if (better) q = r;
    }
    if (q === start) break;
    yield {
      state: run.s,
      marks: [mark(ptId(q.id), 'found')],
      say: `No point is to the right of ${p.name} → ${q.name}, so ${q.name} is the next corner.`,
      lines: ['hull.next'],
      vars: vars(run.s, { p: q.name }),
      level: 2,
      extra: { current: q.id },
    };
    p = q;
  }
  yield {
    state: run.s,
    marks: [mark(ptId(start.id), 'found')],
    say: `The best candidate after ${p.name} is ${start.name}, where we started. The wrap is closed.`,
    lines: ['hull.until'],
    vars: vars(run.s),
    level: 2,
    extra: { current: start.id },
  };
  return yield* finish(run, run.s.stack, 'Gift wrapping');
}

const ALGOS: Record<Algorithm, { name: string; run: (r: Run) => Generator<HStep, S, void> }> = {
  graham: { name: 'Graham scan', run: graham },
  monotone: { name: "Andrew's monotone chain", run: monotone },
  jarvis: { name: 'Gift wrapping (Jarvis march)', run: jarvis },
};

const hull: Op = {
  label: 'Find hull',
  arity: 0,
  *run(s, _args, { settings }) {
    const run: Run = { s: fresh(s) };
    return yield* ALGOS[settings.algorithm].run(run);
  },
};

export const ops = { load, add: addOp, hull, clear };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

const TURN = L(
  'hull.cross',
  0,
  'TURN(a, b, c) = (b.x − a.x)(c.y − a.y) − (b.y − a.y)(c.x − a.x)',
  'A turn test: positive means a → b → c turns left, negative right, zero means they are on one line.',
);

export function pseudocode(settings: HullSettings): PseudoBlock[] {
  if (settings.algorithm === 'monotone') {
    return [
      {
        op: 'hull',
        lines: [
          L('hull.sig', 0, 'MONOTONE-CHAIN(Q)', 'To find the hull of the points Q:'),
          L('hull.dup', 1, 'remove duplicate points from Q', 'Keep one copy of each point.'),
          L('hull.sort', 1, 'sort Q by x, then by y', 'Sort the points from left to right.'),
          L('hull.lower', 1, 'for each p in Q', 'Go left to right, building the lower hull L:'),
          L(
            'hull.lwhile',
            2,
            'while |L| ≥ 2 and TURN(L[−2], L[−1], p) ≤ 0',
            'while the last two points of L and p do not turn left,',
          ),
          L('hull.lpop', 3, 'pop L', 'drop the last point of L.'),
          L('hull.lpush', 2, 'push p onto L', 'Add p to L.'),
          L(
            'hull.upper',
            1,
            'for each p in Q, in reverse',
            'Go right to left, building the upper hull U:',
          ),
          L(
            'hull.uwhile',
            2,
            'while |U| ≥ 2 and TURN(U[−2], U[−1], p) ≤ 0',
            'while the last two points of U and p do not turn left,',
          ),
          L('hull.upop', 3, 'pop U', 'drop the last point of U.'),
          L('hull.upush', 2, 'push p onto U', 'Add p to U.'),
          L(
            'hull.ret',
            1,
            'return L and U, each without its last point',
            'The hull is the lower hull followed by the upper hull (their ends are shared).',
          ),
          TURN,
        ],
      },
    ];
  }
  if (settings.algorithm === 'jarvis') {
    return [
      {
        op: 'hull',
        lines: [
          L('hull.sig', 0, 'GIFT-WRAP(Q)', 'To find the hull of the points Q:'),
          L('hull.dup', 1, 'remove duplicate points from Q', 'Keep one copy of each point.'),
          L(
            'hull.start',
            1,
            'p = start = the leftmost point (lowest if tied)',
            'Start at the leftmost point; it must be a corner.',
          ),
          L('hull.repeat', 1, 'repeat', 'Repeat:'),
          L('hull.add', 2, 'add p to the hull', 'p is a corner of the hull.'),
          L(
            'hull.cand',
            2,
            'q = any point other than p',
            'Guess any other point as the next corner q.',
          ),
          L('hull.for', 2, 'for each point r', 'Try every point r:'),
          L(
            'hull.test',
            3,
            'if TURN(p, q, r) < 0, or it is 0 and r is farther from p than q',
            'if r is to the right of p → q (or on that line and farther),',
          ),
          L('hull.better', 4, 'q = r', 'r is the better guess.'),
          L('hull.next', 2, 'p = q', 'The best guess is the next corner.'),
          L('hull.until', 1, 'until p == start', 'Stop when the wrap comes back to the start.'),
          L('hull.ret', 1, 'return the hull', 'The corners, counter-clockwise.'),
          TURN,
        ],
      },
    ];
  }
  return [
    {
      op: 'hull',
      lines: [
        L('hull.sig', 0, 'GRAHAM-SCAN(Q)', 'To find the hull of the points Q:'),
        L('hull.dup', 1, 'remove duplicate points from Q', 'Keep one copy of each point.'),
        L(
          'hull.pivot',
          1,
          'p0 = the point of Q with the lowest y (leftmost if tied)',
          'Start from the lowest point; it must be a corner.',
        ),
        L(
          'hull.sort',
          1,
          'sort the rest by polar angle around p0',
          'Sort the other points by their angle from p0, counter-clockwise.',
        ),
        L(
          'hull.same',
          1,
          'of points with the same angle, keep only the farthest',
          'If several points line up with p0, keep the farthest.',
        ),
        L(
          'hull.loop',
          1,
          'for each point p, p0 first, in sorted order',
          'Take the points in order:',
        ),
        L(
          'hull.while',
          2,
          'while |S| ≥ 2 and TURN(NEXT-TO-TOP(S), TOP(S), p) ≤ 0',
          'while the top two points of the stack and p do not turn left,',
        ),
        L('hull.pop', 3, 'POP(S)', 'the top point is not a corner: pop it.'),
        L('hull.push', 2, 'PUSH(p, S)', 'Push p.'),
        L('hull.ret', 1, 'return S', 'The stack holds the corners, counter-clockwise.'),
        TURN,
      ],
    },
  ];
}

export function initialSay(): string {
  return 'No points yet. Type points such as 1,2 5,1 3,4 and press Load points, or pick a preset, then press Find hull.';
}

export function initialVars(state: S) {
  return vars(state);
}

export function describe(state: S): string {
  if (state.points.length === 0) return 'An empty plane with no points.';
  const pts = state.points.map(at).join(', ');
  const hull = state.hull
    ? ` Hull, counter-clockwise: ${state.hull.map((id) => byId(state, id).name).join(', ')}.`
    : state.stack.length
      ? ` Chain so far: ${state.stack.map((id) => byId(state, id).name).join(', ')}.`
      : '';
  return `${state.points.length} points: ${pts}.${hull}`;
}

/** The hull starting from the lowest point (leftmost if tied), counter-clockwise, as "x,y". */
export function normalizedHull(state: S): string[] {
  if (!state.hull) return [];
  const pts = state.hull.map((id) => byId(state, id));
  if (pts.length === 0) return [];
  let k = 0;
  pts.forEach((p, i) => {
    const m = pts[k]!;
    if (p.y < m.y || (p.y === m.y && p.x < m.x)) k = i;
  });
  return [...pts.slice(k), ...pts.slice(0, k)].map((p) => `${p.x},${p.y}`);
}
