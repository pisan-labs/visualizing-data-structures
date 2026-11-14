/**
 * DP over subsets: give each of n workers one of n tasks (n up to 4) for the smallest total cost,
 * from a cost table cost[w][t], what worker w charges for task t.
 *
 * - The pattern is a DP over the set of tasks already given out, written as a bitmask (bit t is
 *   task t; the bitmask helpers come from /bitmask/). f[mask] is the cheapest way to give the
 *   tasks in mask to the first k workers, where k is the number of bits in mask: the workers go
 *   in order, so the count of bits says whose turn it is. f[0] = 0, and
 *   f[mask] = min over t in mask of f[mask − {t}] + cost[k − 1][t]: try each task as the one the
 *   k-th worker took. Every mask minus a bit is a smaller number, so counting the masks up from 1
 *   fills each one after the masks it reads. 2ⁿ masks, n · 2ⁿ⁻¹ tries. The answer is f[all], and
 *   the task each mask chose last (ties to the lower task) walks the assignment back.
 * - The naive approach tries every order by plain recursion: worker A takes each task in turn,
 *   then B each task left, and so on, n! full orders. It reaches the same mask many times (a
 *   mask of k tasks k! times) and redoes the rest from it every time.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: one counter, tries (one cost added to a
 * partial total). The pattern tries each task of each mask once; the naive approach makes one
 * try per call below the first. Both find the same cheapest total; with ties they may pick
 * different assignments of that total.
 *
 * The state keeps the table, the DP values once filled and the answer once found, so the picture
 * keeps them after the operation.
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
import { bin, members, popcountOf } from '../bitmask/model';

export const MAX_N = 4;
export const MAX_COST = 99;
export const WORKERS = 'ABCD';

export interface AssignState {
  /** cost[w][t]: what worker w charges for task t. n x n. */
  cost: number[][];
  /** f[mask], once the pattern has filled it. */
  f: (number | null)[];
  /** The task the k-th worker takes in f[mask]'s cheapest way. */
  last: (number | null)[];
  best: number | null;
  /** The task of each worker in the answer. */
  tasks: number[] | null;
}

export interface AssignSettings {
  [key: string]: Scalar;
  approach: Approach;
}

export const defaults: AssignSettings = { approach: 'pattern' };

export interface AssignExtra {
  approach: Approach;
  /** The mask being filled (pattern) or reached (naive). */
  mask?: number;
  /** The mask it is read from, and the task added. */
  from?: number;
  task?: number;
  /** Naive: the task of each worker so far, the total, and the calls that reached each mask. */
  now?: (number | null)[];
  total?: number;
  seen?: number[];
  /** The best assignment so far (naive) or found by the walk back (pattern). */
  bestTasks?: (number | null)[] | null;
  bestTotal?: number | null;
  /** The walk back: masks on the path from the full mask down. */
  path?: number[];
}

export type AssignStep = Step<AssignState, AssignExtra>;
type Op = OpSpec<AssignState, AssignSettings, AssignExtra>;
type Gen = Generator<AssignStep, AssignState, void>;

/**
 * The table the page starts with. Greedy (each worker in turn takes its cheapest task left) pays
 * 3 + 2 + 3 + 8 = 16; the cheapest, and the only one at 14, gives A task 1 so that D gets task 0.
 */
export const START = '3 7 5 8 / 4 9 2 6 / 6 5 8 3 / 2 8 7 9';

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

// ----- Shape ids, shared with the view -----

export const maskId = (m: number) => `mask-${m}`;
export const fId = (m: number) => `fv-${m}`;
export const edgeId = (m: number, t: number) => `edge-${m}-${t}`;
export const costId = (w: number, t: number) => `cell-${w}-${t}`;
export const nowId = (w: number) => `now-${w}`;
export const bestId = (w: number) => `best-${w}`;

// ----- Reading the table -----

/** A cost table as text: rows separated by /, values by spaces. */
export const tableText = (cost: readonly (readonly number[])[]) =>
  cost.map((r) => r.join(' ')).join(' / ');

/**
 * Read a cost table: rows separated by / or ; ("2 6 7 / 3 8 9 / 5 9 4"), or n² values in one
 * row, read row by row. Square, 1 to MAX_N rows, whole numbers 0 to MAX_COST.
 */
export function readCosts(raw: Value | undefined): number[][] | string {
  const text = String(raw ?? '').trim();
  const how =
    'Type the costs row by row, one row per worker, rows separated by /, such as 2 6 7 / 3 8 9 / 5 9 4.';
  if (!text) return how;
  let rows = text
    .split(/[/;|]/)
    .map((r) => r.split(/[\s,]+/).filter(Boolean))
    .filter((r) => r.length);
  if (rows.length === 1) {
    const flat = rows[0]!;
    const n = Math.round(Math.sqrt(flat.length));
    if (n * n !== flat.length)
      return `${plural(flat.length, 'value')} in one row is not a square table. ${how}`;
    rows = Array.from({ length: n }, (_, i) => flat.slice(i * n, (i + 1) * n));
  }
  const n = rows.length;
  if (n > MAX_N)
    return `That is ${n} workers. Use at most ${MAX_N}, so the ${1 << MAX_N} masks fit.`;
  const bad = rows.findIndex((r) => r.length !== n);
  if (bad >= 0)
    return `Row ${bad + 1} has ${plural(rows[bad]!.length, 'value')}, but there are ${n} workers, so every row needs ${n}: one per task.`;
  const out: number[][] = [];
  for (const r of rows) {
    const row: number[] = [];
    for (const t of r) {
      if (!/^\d+$/.test(t)) return `"${t}" is not a whole number. Use costs from 0 to ${MAX_COST}.`;
      const v = Number(t);
      if (v > MAX_COST) return `${v} is out of range. Use costs from 0 to ${MAX_COST}.`;
      row.push(v);
    }
    out.push(row);
  }
  return out;
}

const fresh = (cost: number[][]): AssignState => ({
  cost,
  f: Array<number | null>(1 << cost.length).fill(null),
  last: Array<number | null>(1 << cost.length).fill(null),
  best: null,
  tasks: null,
});

export const init = (): AssignState => fresh(readCosts(START) as number[][]);

// ----- The answers, without steps -----

/** The DP: f, the task each mask took last, the best total and each worker's task. */
export function solveDP(cost: readonly (readonly number[])[]) {
  const n = cost.length;
  const full = (1 << n) - 1;
  const f: number[] = Array<number>(1 << n).fill(Infinity);
  const last: number[] = Array<number>(1 << n).fill(-1);
  f[0] = 0;
  for (let mask = 1; mask <= full; mask++) {
    const k = popcountOf(mask);
    for (const t of members(mask)) {
      const c = f[mask ^ (1 << t)]! + cost[k - 1]![t]!;
      if (c < f[mask]!) {
        f[mask] = c;
        last[mask] = t;
      }
    }
  }
  const tasks = Array<number>(n).fill(-1);
  let mask = full;
  for (let w = n - 1; w >= 0; w--) {
    tasks[w] = last[mask]!;
    mask ^= 1 << last[mask]!;
  }
  return { f, last, best: f[full]!, tasks };
}

/** Tries each approach makes on n tasks. */
export function totals(n: number): Totals {
  let naive = 0;
  let ways = 1;
  for (let k = 0; k < n; k++) {
    ways *= n - k;
    naive += ways;
  }
  return { naive, pattern: n === 0 ? 0 : n * (1 << (n - 1)) };
}

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));

// ----- Text -----

export const worker = (w: number) => WORKERS[w]!;
/** "A, B and C". */
const workersUpTo = (k: number) => andList([...WORKERS.slice(0, k)]);
/** A mask in n bits, task n − 1 on the left. */
export const bits = (m: number, n: number) => bin(m, n);
const tasksIn = (m: number) => {
  const ts = members(m);
  return ts.length === 1 ? `task ${ts[0]}` : `tasks ${andList(ts)}`;
};

/** "A → 1, B → 0, C → 2". */
export function assignText(tasks: readonly (number | null)[]): string {
  return tasks
    .map((t, w) => (t === null ? null : `${worker(w)} → ${t}`))
    .filter((x) => x !== null)
    .join(', ');
}

export function describe(s: AssignState): string {
  const n = s.cost.length;
  const rows = s.cost.map((r, w) => `worker ${worker(w)} charges ${r.join(', ')}`);
  const filled = s.f.filter((v) => v !== null).length;
  const f = filled
    ? ` Filled ${plural(filled, 'mask')}: ${s.f
        .map((v, m) => (v === null ? null : `f[${bits(m, n)}] = ${v}`))
        .filter(Boolean)
        .join(', ')}.`
    : '';
  const best =
    s.best !== null && s.tasks ? ` Cheapest total ${s.best}: ${assignText(s.tasks)}.` : '';
  return `Cost table for ${plural(n, 'worker')} and ${plural(n, 'task')} (tasks 0 to ${n - 1}): ${rows.join('; ')}.${f}${best}`;
}

export function initialSay(s: AssignState): string {
  const n = s.cost.length;
  return `${n} workers, ${n} tasks, and what each worker charges for each task. Give every worker one task, every task to one worker, for the smallest total. Press Cheapest total.`;
}

export function initialVars(s: AssignState): Record<string, Scalar> {
  return { n: s.cost.length };
}

// ----- Operations -----

const load: Op = {
  label: 'Load costs',
  arity: 1,
  *run(s, [raw]) {
    const cost = readCosts(raw);
    if (typeof cost === 'string') {
      yield {
        state: s,
        marks: [],
        say: `The table stays as it was. ${cost}`,
        lines: [],
        level: 1,
        vars: { n: s.cost.length },
      };
      return s;
    }
    const next = fresh(cost);
    const n = cost.length;
    yield {
      state: next,
      marks: cost.flatMap((r, w) => r.map((_, t) => mark(costId(w, t), 'new'))),
      say: `Loaded costs for ${plural(n, 'worker')} (${workersUpTo(n)}) and ${plural(n, 'task')} (0 to ${n - 1}): ${cost.map((r, w) => `${worker(w)} charges ${r.join(', ')}`).join('; ')}. Press Cheapest total.`,
      lines: [],
      level: 1,
      vars: { n },
    };
    return next;
  },
};

/** The pattern: fill f[mask] for every mask, counting up, then walk the answer back. */
function* pattern(s: AssignState): Gen {
  const cost = s.cost;
  const n = cost.length;
  const full = (1 << n) - 1;
  const tot = totals(n);
  const work = new Work(['tries']);
  const f: (number | null)[] = Array<number | null>(1 << n).fill(null);
  const last: (number | null)[] = Array<number | null>(1 << n).fill(null);
  let filled = 0;
  const state = (): AssignState => ({ cost, f: [...f], last: [...last], best: null, tasks: null });
  const vars = (more: Record<string, Scalar> = {}): Record<string, Scalar> => ({
    n,
    ...more,
    masks: filled,
    ...workVars(work, tot),
  });
  const b = (m: number) => bits(m, n);

  f[0] = 0;
  filled = 1;
  yield {
    state: state(),
    marks: [mark(maskId(0), 'new'), mark(fId(0), 'new')],
    say: `f[mask] is the cheapest way to give the tasks in mask to the first workers, one task each: a mask with k bits goes to the first k workers, so its bit count says whose turn it is. f[${b(0)}] = 0: no tasks, no cost. Now count up through the masks, ${plural(full, 'more')}.`,
    lines: ['d.base'],
    level: 2,
    vars: vars({ mask: b(0), 'f[mask]': 0 }),
    extra: { approach: 'pattern', mask: 0 },
  };

  for (let mask = 1; mask <= full; mask++) {
    const k = popcountOf(mask);
    const w = k - 1;
    const ts = members(mask);
    for (const [idx, t] of ts.entries()) {
      const prev = mask ^ (1 << t);
      const fp = f[prev]!;
      const c = cost[w]![t]!;
      const cand = fp + c;
      work.add('tries');
      const cur = f[mask];
      const first = cur === null;
      const better = first || cand < cur;
      if (better) {
        f[mask] = cand;
        last[mask] = t;
      }
      const lastTry = idx === ts.length - 1;
      if (lastTry) filled++;
      let say: string;
      if (k === 1) {
        say = `f[${b(mask)}]: one task, ${t}, so worker A does it for ${c}: f[${b(prev)}] + ${c} = ${cand}.`;
      } else {
        const head =
          idx === 0
            ? `f[${b(mask)}]: ${tasksIn(mask)} go to ${workersUpTo(k)}. Try each as the one ${worker(w)} took. `
            : '';
        const verdict = first
          ? `The first try: f[${b(mask)}] = ${cand} for now.`
          : better
            ? `Cheaper than ${cur}: f[${b(mask)}] = ${cand}.`
            : `Not cheaper than ${cur}.`;
        say = `${head}Task ${t} last: ${worker(w)} charges ${c}, after f[${b(prev)}] = ${fp} for the rest: ${fp} + ${c} = ${cand}. ${verdict}`;
        if (lastTry)
          say += ` So f[${b(mask)}] = ${f[mask]}, with ${worker(w)} taking task ${last[mask]}.`;
      }
      yield {
        state: state(),
        marks: [
          mark(maskId(mask), 'active'),
          mark(fId(mask), better ? 'new' : 'active'),
          mark(maskId(prev), 'compare'),
          mark(fId(prev), 'compare'),
          mark(edgeId(mask, t), 'active'),
          mark(costId(w, t), 'compare'),
        ],
        say,
        lines: ['d.loop', 'd.k', 'd.try', 'd.min'],
        level: 2,
        vars: vars({ mask: b(mask), k, task: t, try: cand, 'f[mask]': f[mask]! }),
        extra: { approach: 'pattern', mask, from: prev, task: t },
      };
    }
  }

  // Walk back.
  const best = f[full]!;
  const tasks: (number | null)[] = Array<number | null>(n).fill(null);
  const path = [full];
  let mask = full;
  for (let w = n - 1; w >= 0; w--) {
    const t = last[mask]!;
    const prev = mask ^ (1 << t);
    tasks[w] = t;
    path.push(prev);
    yield {
      state: state(),
      marks: [
        mark(maskId(mask), 'found'),
        mark(edgeId(mask, t), 'found'),
        mark(costId(w, t), 'found'),
        mark(bestId(w), 'new'),
      ],
      say:
        w === n - 1
          ? `f[${b(full)}] = ${best} is the cheapest total. Walk it back: ${worker(w)} took task ${t} last (${cost[w]![t]}), after f[${b(prev)}] = ${f[prev]}.`
          : `f[${b(mask)}] = ${f[mask]}: ${worker(w)} took task ${t} (${cost[w]![t]}), after f[${b(prev)}] = ${f[prev]}.`,
      lines: ['t.sig', 't.take'],
      level: 2,
      vars: vars({ mask: b(mask), best, worker: worker(w), task: t }),
      extra: {
        approach: 'pattern',
        mask,
        from: prev,
        task: t,
        bestTasks: [...tasks],
        bestTotal: best,
        path: [...path],
      },
    };
    mask = prev;
  }
  const end: AssignState = { cost, f: [...f], last: [...last], best, tasks: tasks as number[] };
  yield {
    state: end,
    marks: [
      mark(maskId(full), 'found'),
      mark(fId(full), 'found'),
      ...(tasks as number[]).map((t, w) => mark(costId(w, t), 'found')),
    ],
    say: `The cheapest total is ${best}: ${assignText(tasks)} (${(tasks as number[]).map((t, w) => cost[w]![t]).join(' + ')}). ${plural(1 << n, 'mask')} and ${plural(work.get('tries'), 'try', 'tries')}; trying every order takes ${tot.naive}.`,
    lines: ['d.ret'],
    level: 1,
    vars: vars({ best, tasks: tasks.join(' ') }),
    extra: { approach: 'pattern', bestTasks: [...tasks], bestTotal: best, path: [...path] },
  };
  return end;
}

/** The naive approach: every order, by plain recursion. */
function* naive(s: AssignState): Gen {
  const cost = s.cost;
  const n = cost.length;
  const tot = totals(n);
  const work = new Work(['tries']);
  const seen = Array<number>(1 << n).fill(0);
  const now: (number | null)[] = Array<number | null>(n).fill(null);
  let best: number | null = null;
  let bestTasks: number[] | null = null;
  let orders = 0;
  const state = fresh(cost);
  const b = (m: number) => bits(m, n);
  const extra = (mask: number, total: number, more: Partial<AssignExtra> = {}): AssignExtra => ({
    approach: 'naive',
    mask,
    now: [...now],
    total,
    seen: [...seen],
    bestTasks: bestTasks && [...bestTasks],
    bestTotal: best,
    ...more,
  });
  const vars = (used: number, total: number): Record<string, Scalar> => ({
    n,
    mask: b(used),
    total,
    best: best ?? '–',
    orders,
    ...workVars(work, tot),
  });

  function* go(
    w: number,
    used: number,
    total: number,
    how: string,
    from?: number,
    task?: number,
  ): Generator<AssignStep, void, void> {
    seen[used]!++;
    let say = how;
    const marks: Mark[] = [mark(maskId(used), 'active')];
    if (from !== undefined && task !== undefined) {
      marks.push(
        mark(edgeId(used, task), 'active'),
        mark(costId(w - 1, task), 'compare'),
        mark(nowId(w - 1), 'active'),
      );
    }
    if (seen[used]! > 1)
      say += ` Mask ${b(used)} again: reached ${plural(seen[used]!, 'time')} now.`;
    if (w === n) {
      orders++;
      const before = best;
      const better = best === null || total < best;
      if (better) {
        best = total;
        bestTasks = now.map((t) => t!);
        marks.push(...now.map((_, k) => mark(bestId(k), 'new')));
      }
      say += ` Every worker has a task: ${assignText(now)}, total ${total}. ${
        before === null
          ? `The first full order, so best = ${total}.`
          : better
            ? `Cheaper than ${before}: best = ${total}.`
            : `Not cheaper than ${before}.`
      }`;
    }
    yield {
      state,
      marks,
      say,
      lines: w === n ? ['n.sig', 'n.done'] : from === undefined ? ['n.main', 'n.sig'] : ['n.sig'],
      level: 2,
      vars: vars(used, total),
      extra: extra(used, total, from === undefined ? {} : { from, task }),
    };
    if (w === n) return;
    for (let t = 0; t < n; t++) {
      if ((used >> t) & 1) continue;
      const c = cost[w]![t]!;
      now[w] = t;
      work.add('tries');
      yield* go(
        w + 1,
        used | (1 << t),
        total + c,
        `${worker(w)} takes task ${t} (${c}): total = ${total} + ${c} = ${total + c}.`,
        used,
        t,
      );
      now[w] = null;
    }
  }

  yield* go(
    0,
    0,
    0,
    `Try every order: worker A takes each task in turn, then B each task that is left, and so on. Each full order is one assignment; there are ${n}! = ${factorial(n)} of them.`,
  );
  const tasks = bestTasks ?? [];
  const end: AssignState = { ...state, best: best ?? 0, tasks };
  yield {
    state: end,
    marks: tasks.map((t, w) => mark(costId(w, t), 'found')),
    say: `Done: ${plural(orders, 'order')} and ${plural(work.get('tries'), 'try', 'tries')}. The cheapest total is ${best}: ${assignText(tasks)}. Mask ${b((1 << n) - 1)} alone was reached ${plural(factorial(n), 'time')}; the DP over masks fills it once, with ${plural(tot.pattern, 'try', 'tries')} in all.`,
    lines: ['n.ret'],
    level: 1,
    vars: { ...vars((1 << n) - 1, best ?? 0), best: best ?? 0, tasks: tasks.join(' ') },
    extra: {
      approach: 'naive',
      now: Array<number | null>(n).fill(null),
      seen: [...seen],
      bestTasks: [...tasks],
      bestTotal: best,
    },
  };
  return end;
}

const solve: Op = {
  label: 'Cheapest total',
  arity: 0,
  *run(s, _args, { settings }) {
    return approachOf(settings) === 'naive' ? yield* naive(s) : yield* pattern(s);
  },
};

export const ops: Record<string, Op> = { load, solve };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: AssignSettings): PseudoBlock[] {
  if (approachOf(settings) === 'naive')
    return [
      {
        op: 'solve',
        lines: [
          L(
            'n.main',
            0,
            'best = ∞; assign(0, {}, 0); return best',
            'Try every order, starting with worker A and no tasks given out.',
          ),
          L(
            'n.sig',
            0,
            'assign(w, used, total)   // workers 0..w − 1 have tasks',
            'With the first w workers given tasks, at this total:',
          ),
          L(
            'n.done',
            1,
            'if w == n: best = min(best, total); return',
            'if every worker has a task, keep the total if it is the cheapest yet.',
          ),
          L(
            'n.loop',
            1,
            'for each task t not in used',
            'Otherwise give worker w each task that is left in turn,',
          ),
          L(
            'n.rec',
            2,
            'assign(w + 1, used + {t}, total + cost[w][t])',
            'and try every way to finish from there.',
          ),
          L(
            'n.ret',
            0,
            '// n! orders, about e · n! tries',
            'The cheapest of all the orders is the answer.',
          ),
        ],
      },
    ];
  return [
    {
      op: 'solve',
      lines: [
        L('d.base', 0, 'f[0] = 0', 'Giving out no tasks costs nothing.'),
        L(
          'd.loop',
          0,
          'for mask = 1 to 2ⁿ − 1',
          'Count up through the masks; a mask minus one task is a smaller number, so it is done already.',
        ),
        L('d.k', 1, 'k = popcount(mask)', 'A mask with k tasks goes to the first k workers;'),
        L('d.try', 1, 'for each task t in mask', 'try each of its tasks as the one worker k took:'),
        L(
          'd.min',
          2,
          'f[mask] = min(f[mask], f[mask − {t}] + cost[k − 1][t])',
          'the rest cost f[mask − {t}], plus what worker k charges for t; keep the cheapest.',
        ),
        L('d.ret', 0, 'return f[2ⁿ − 1]', 'All tasks given out: the cheapest total.'),
        L(
          't.sig',
          0,
          'mask = 2ⁿ − 1; for k = n down to 1',
          'To find who does what, start from the full mask:',
        ),
        L(
          't.take',
          1,
          't = the task f[mask] took last; worker k − 1 does t; mask = mask − {t}',
          'the task the k-th worker took last is theirs; remove it and go on.',
        ),
      ],
    },
  ];
}
