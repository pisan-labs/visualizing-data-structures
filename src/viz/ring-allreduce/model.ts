/**
 * Ring all-reduce, as data-parallel training uses it to add up the gradients of N workers
 * (Patarasuk and Yuan 2009; brought to deep learning by Baidu in 2017 and Horovod in 2018).
 *
 * N workers sit in a ring, each with its own gradient: a vector cut into N chunks (one number
 * per chunk here; millions in a real model). Worker i only ever talks to worker i + 1.
 *
 *   reduce-scatter   N − 1 steps. In step t (from 0) worker i sends chunk (i − t) mod N to its
 *                    right-hand neighbour, which adds it to its own copy. All N sends happen at
 *                    once. Afterwards worker i holds the full sum of chunk (i + 1) mod N.
 *   all-gather       N − 1 steps. In step t worker i sends chunk (i + 1 − t) mod N, now complete,
 *                    and the neighbour keeps it. Afterwards every worker holds every sum.
 *
 * Each worker sends 2(N − 1) chunks, 2(N − 1)/N of a vector, however large N grows; a parameter
 * server that collects every gradient and sends back the sum moves N vectors in and N out
 * over its one link.
 *
 *   load(vectors)   N vectors of N whole numbers, "1 2 3 4 / 5 6 7 8 / …"
 *   fresh           new random gradients
 *   scatter         reduce-scatter
 *   gather          all-gather (reduce-scatter first, if it has not run)
 *   allreduce       both
 *
 * Settings: workers, N from 2 to 5 (default 4).
 */
import { makeRng, type Rng } from '../../engine/rng';
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';

export const MIN_WORKERS = 2;
export const MAX_WORKERS = 5;
export const MAX_VALUE = 99;
export const CHUNKS = 'abcde';

export interface RingSettings {
  [key: string]: Scalar;
  workers: number;
}

export const defaults: RingSettings = { workers: 4 };

export type Phase = 'start' | 'scattered' | 'done';
export type Stage = 'rs' | 'ag';

export interface RingState {
  n: number;
  /** Each worker's own gradient. */
  g: number[][];
  /** What worker i holds for chunk c now. */
  v: number[][];
  /** Which workers' gradients v[i][c] adds up, as bits (bit j for worker j). */
  has: number[][];
  phase: Phase;
  /** Chunks each worker has sent so far. */
  sent: number;
}

/** One chunk on its way from a worker to its right-hand neighbour. */
export interface Packet {
  from: number;
  to: number;
  chunk: number;
  value: number;
}

export interface RingExtra {
  /** Chunks in flight (sent, not yet received). */
  packets?: Packet[];
  /** The chunks just received: they slide into their cells. */
  landed?: Packet[];
  stage?: Stage;
  /** Ring steps done in this stage, and in all. */
  step?: number;
}

type S = RingState;
type X = RingExtra;
type Op = OpSpec<S, RingSettings, X>;
type RStep = Step<S, X>;

export const chunkName = (c: number) => CHUNKS[c]!;
export const workerName = (i: number) => `worker ${i + 1}`;
const mod = (a: number, n: number) => ((a % n) + n) % n;
export const bitCount = (m: number) => {
  let k = 0;
  for (let x = m; x; x &= x - 1) k++;
  return k;
};

// ---------------------------------------------------------------------------------------------
// The algorithm

/** The chunk worker i sends in step t of a stage. */
export const sendsChunk = (stage: Stage, i: number, t: number, n: number): number =>
  stage === 'rs' ? mod(i - t, n) : mod(i + 1 - t, n);

/** One ring step: every worker sends one chunk to the next, at once. */
export function ringStep(s: S, stage: Stage, t: number): { next: S; packets: Packet[] } {
  const { n } = s;
  const packets = Array.from({ length: n }, (_, i) => {
    const chunk = sendsChunk(stage, i, t, n);
    return { from: i, to: mod(i + 1, n), chunk, value: s.v[i]![chunk]! };
  });
  const v = s.v.map((row) => [...row]);
  const has = s.has.map((row) => [...row]);
  for (const p of packets) {
    const bits = s.has[p.from]![p.chunk]!;
    if (stage === 'rs') {
      v[p.to]![p.chunk] = s.v[p.to]![p.chunk]! + p.value;
      has[p.to]![p.chunk] = s.has[p.to]![p.chunk]! | bits;
    } else {
      v[p.to]![p.chunk] = p.value;
      has[p.to]![p.chunk] = bits;
    }
  }
  return { next: { ...s, v, has, sent: s.sent + 1 }, packets };
}

/** The state after the first `steps` steps of reduce-scatter from `s`. */
export function scatterSteps(s: S, steps: number): S {
  let cur = s;
  for (let t = 0; t < steps; t++) cur = ringStep(cur, 'rs', t).next;
  return cur;
}

/** The column sums: what every worker should end up with. */
export const sums = (g: readonly (readonly number[])[]): number[] =>
  g[0]!.map((_, c) => {
    let total = 0;
    for (const row of g) total += row[c]!;
    return total;
  });

/** Chunks each worker sends in a whole ring all-reduce, and the same as a part of the vector. */
export const ringChunks = (n: number): number => 2 * (n - 1);
export const ringShare = (n: number): number => (2 * (n - 1)) / n;
/** What each worker sends in a ring all-reduce of an m-unit gradient. */
export const ringSent = (n: number, m: number): number => (2 * (n - 1) * m) / n;

// ---------------------------------------------------------------------------------------------
// Gradients

export function loaded(g: number[][]): S {
  const n = g.length;
  return {
    n,
    g,
    v: g.map((row) => [...row]),
    has: g.map((row, i) => row.map(() => 1 << i)),
    phase: 'start',
    sent: 0,
  };
}

/** Random whole numbers from 1 to 9, one vector of n per worker. */
export const randomGradients = (rng: Rng, n: number): number[][] =>
  Array.from({ length: n }, () => Array.from({ length: n }, () => rng.int(1, 9)));

export const gradientText = (g: readonly (readonly number[])[]) =>
  g.map((row) => row.join(' ')).join(' / ');

export function init(settings: RingSettings): S {
  return loaded(randomGradients(makeRng(5), settings.workers));
}

/** N vectors of N whole numbers, separated by "/" (or ";" or "|"). An Error says what is wrong. */
export function parseVectors(text: string): number[][] | Error {
  const groups = String(text)
    .replace(/−/g, '-')
    .split(/[/;|]/)
    .map((g) => g.split(/[\s,]+/).filter(Boolean));
  const help = `Type one vector per worker, separated by "/": ${MIN_WORKERS} to ${MAX_WORKERS} workers, each with as many numbers as there are workers (for 3: 1 2 3 / 4 5 6 / 7 8 9).`;
  const n = groups.length;
  if (n < MIN_WORKERS || n > MAX_WORKERS || groups.some((g) => g.length !== n))
    return new Error(help);
  const g = groups.map((row) => row.map(Number));
  if (g.flat().some((x) => !Number.isInteger(x) || Math.abs(x) > MAX_VALUE))
    return new Error(`Use whole numbers from −${MAX_VALUE} to ${MAX_VALUE}.`);
  return g.map((row) => row.map((x) => x + 0));
}

// ---------------------------------------------------------------------------------------------
// Words

const vecText = (row: readonly number[]) => `(${row.map(num).join(', ')})`;
const num = (x: number) => (x < 0 ? `−${-x}` : String(x));
const plusText = (a: number, b: number) => (b < 0 ? `${num(a)} − ${-b}` : `${num(a)} + ${b}`);

export function baseVars(s: S): Record<string, Scalar> {
  const n = s.n;
  return {
    workers: n,
    'chunks sent per worker': s.sent,
    'vectors sent per worker': Math.round((100 * s.sent) / n) / 100,
    'ring, whole all-reduce': Math.round(100 * ringShare(n)) / 100,
    'server link, in and out': 2 * n,
  };
}

const cellMarks = (s: S, cells: [number, number][], role: Mark['role']): Mark[] =>
  cells.map(([i, c]) => ({ id: `v${i}-0-${c}`, role }));

/** A list of the n things, short enough for one narration. */
const each = (parts: string[]) => parts.join('; ');

// ---------------------------------------------------------------------------------------------
// Operations

function* stageSteps(s0: S, stage: Stage): Generator<RStep, S, void> {
  const n = s0.n;
  const verb = stage === 'rs' ? 'Reduce-scatter' : 'All-gather';
  const line = stage === 'rs' ? 'rsend' : 'agsend';
  let s = s0;
  for (let t = 0; t < n - 1; t++) {
    const { next, packets } = ringStep(s, stage, t);
    const head = `${verb}, step ${t + 1} of ${n - 1}`;
    yield {
      state: s,
      marks: [
        ...cellMarks(
          s,
          packets.map((p) => [p.from, p.chunk]),
          'active',
        ),
        ...packets.map((p) => ({ id: `link-${p.from}`, role: 'active' as const })),
      ],
      say: `${head}: every worker sends one chunk to the next worker round the ring, all at the same time. ${each(packets.map((p) => `${workerName(p.from)} sends ${chunkName(p.chunk)} (${num(p.value)})`))}.`,
      lines: [stage === 'rs' ? 'rfor' : 'afor', line],
      level: 2,
      vars: baseVars(s),
      extra: { packets, stage, step: t },
    };
    const said =
      stage === 'rs'
        ? `Each worker adds the chunk it got to its own copy: ${each(packets.map((p) => `${workerName(p.to)}'s ${chunkName(p.chunk)} is ${plusText(s.v[p.to]![p.chunk]!, p.value)} = ${num(next.v[p.to]![p.chunk]!)}`))}.`
        : `Each worker keeps the finished chunk it got: ${each(packets.map((p) => `${workerName(p.to)}'s ${chunkName(p.chunk)} is now ${num(p.value)}`))}.`;
    yield {
      state: next,
      marks: cellMarks(
        next,
        packets.map((p) => [p.to, p.chunk]),
        'new',
      ),
      say: said,
      lines: [stage === 'rs' ? 'radd' : 'acopy'],
      level: 2,
      vars: baseVars(next),
      extra: { landed: packets, stage, step: t + 1 },
    };
    s = next;
  }
  return s;
}

function* scatterPart(s: S): Generator<RStep, S, void> {
  const n = s.n;
  const done = yield* stageSteps(s, 'rs');
  const next: S = { ...done, phase: 'scattered' };
  const owners = Array.from({ length: n }, (_, i) => mod(i + 1, n));
  yield {
    state: next,
    marks: cellMarks(
      next,
      owners.map((c, i) => [i, c]),
      'found',
    ),
    say: `Reduce-scatter done after ${plural(n - 1, 'step')}: ${each(owners.map((c, i) => `${workerName(i)} holds the whole sum of ${chunkName(c)}, ${num(next.v[i]![c]!)}`))}. Each worker has sent ${plural(n - 1, 'chunk')}, ${n - 1}/${n} of its vector.`,
    lines: ['rdone'],
    level: 1,
    vars: baseVars(next),
  };
  return next;
}

function* gatherPart(s: S): Generator<RStep, S, void> {
  const n = s.n;
  const done = yield* stageSteps(s, 'ag');
  const next: S = { ...done, phase: 'done' };
  const total = sums(next.g);
  yield {
    state: next,
    marks: [],
    say: `Done: every worker holds the whole sum, ${vecText(total)}. Each sent ${ringChunks(n)} chunks, ${ringChunks(n)}/${n} = ${twoDigits(ringShare(n))} ${ringShare(n) === 1 ? 'vector' : 'vectors'}' worth, and so did every other worker at the same time. A parameter server would take in ${n} whole vectors and send out ${n}.`,
    lines: ['adone'],
    level: 1,
    vars: baseVars(next),
  };
  return next;
}

const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;

const twoDigits = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0$/, ''));

function* already(s: S, what: string): Generator<RStep, S, void> {
  yield {
    state: s,
    marks: [],
    say: what,
    lines: [],
    level: 1,
    vars: baseVars(s),
  };
  return s;
}

const DONE_ALREADY =
  'Every worker already holds the whole sum. Load new gradients (or press New gradients) to run it again.';

const loadOp: Op = {
  label: 'Load',
  arity: 1,
  *run(s, args, { settings }) {
    const g = parseVectors(String(args[0]));
    if (g instanceof Error) return yield* already(s, g.message);
    if (g.length !== settings.workers)
      return yield* already(
        s,
        `The ring has ${settings.workers} workers (change it under Options), so type ${settings.workers} vectors of ${settings.workers} numbers, separated by "/".`,
      );
    const next = loaded(g);
    yield {
      state: next,
      marks: g.flatMap((row, i) =>
        row.map((_, c) => ({ id: `v${i}-0-${c}`, role: 'new' as const })),
      ),
      say: `${g.length} workers, each with its own gradient cut into ${g.length} chunks, ${CHUNKS.slice(0, g.length).split('').join(', ')}. They need the sum, ${vecText(sums(g))}, on every worker before the next training step.`,
      lines: ['load'],
      level: 1,
      vars: baseVars(next),
    };
    return next;
  },
};

const freshOp: Op = {
  label: 'New gradients',
  arity: 0,
  *run(_s, _args, { settings, rng }) {
    const g = randomGradients(rng, settings.workers);
    const next = loaded(g);
    yield {
      state: next,
      marks: g.flatMap((row, i) =>
        row.map((_, c) => ({ id: `v${i}-0-${c}`, role: 'new' as const })),
      ),
      say: `New gradients from one more batch of training data, one per worker. The sum they need is ${vecText(sums(g))}.`,
      lines: ['load'],
      level: 1,
      vars: baseVars(next),
    };
    return next;
  },
};

const scatterOp: Op = {
  label: 'Reduce-scatter',
  arity: 0,
  *run(s) {
    if (s.phase === 'done') return yield* already(s, DONE_ALREADY);
    if (s.phase === 'scattered')
      return yield* already(
        s,
        'Reduce-scatter has run: each worker holds one finished chunk. Press All-gather to share them.',
      );
    return yield* scatterPart(s);
  },
};

const gatherOp: Op = {
  label: 'All-gather',
  arity: 0,
  *run(s) {
    if (s.phase === 'done') return yield* already(s, DONE_ALREADY);
    const scattered = s.phase === 'start' ? yield* scatterPart(s) : s;
    return yield* gatherPart(scattered);
  },
};

const allreduceOp: Op = {
  label: 'All-reduce',
  arity: 0,
  *run(s) {
    if (s.phase === 'done') return yield* already(s, DONE_ALREADY);
    const scattered = s.phase === 'start' ? yield* scatterPart(s) : s;
    return yield* gatherPart(scattered);
  },
};

export const ops = {
  load: loadOp,
  fresh: freshOp,
  scatter: scatterOp,
  gather: gatherOp,
  allreduce: allreduceOp,
};

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

const RS = [
  L('rsig', 0, 'REDUCE-SCATTER(g)', 'Add up the chunks, one per worker:'),
  L('rfor', 1, 'for t = 0 to N − 2', `N − 1 times:`),
  L(
    'rsend',
    2,
    'each worker i sends chunk (i − t) mod N to worker i + 1',
    'every worker passes one chunk to the next, all at once,',
  ),
  L('radd', 2, 'the receiver adds it to its own chunk', 'and the next worker adds it to its copy.'),
  L(
    'rdone',
    1,
    'worker i now holds the sum of chunk (i + 1) mod N',
    'Now each worker owns one chunk, fully added up.',
  ),
];
const AG = [
  L('asig', 0, 'ALL-GATHER()', 'Share the finished chunks:'),
  L('afor', 1, 'for t = 0 to N − 2', `N − 1 times:`),
  L(
    'agsend',
    2,
    'each worker i sends chunk (i + 1 − t) mod N to worker i + 1',
    'every worker passes on a finished chunk,',
  ),
  L('acopy', 2, 'the receiver keeps it', 'and the next worker keeps a copy.'),
  L('adone', 1, 'every worker holds every sum', 'Now everyone has the whole sum.'),
];

export function pseudocode(): PseudoBlock[] {
  const load = [
    L(
      'load',
      0,
      'g_i = the gradient of worker i, in N chunks',
      'Each worker starts with its own gradient.',
    ),
  ];
  return [
    { op: 'load', lines: load },
    { op: 'fresh', lines: load },
    { op: 'scatter', lines: RS },
    { op: 'gather', lines: [...RS, ...AG] },
    { op: 'allreduce', lines: [...RS, ...AG] },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S): string {
  return `${s.n} workers in a ring, each with its own gradient in ${s.n} chunks. Press All-reduce: every worker ends up with the sum, ${vecText(sums(s.g))}, while sending only ${ringChunks(s.n)} chunks.`;
}

export const initialVars = (s: S) => baseVars(s);

export function describe(s: S): string {
  return `${s.n} workers in a ring. ${s.v
    .map(
      (row, i) =>
        `${workerName(i)}: ${row.map((x, c) => `${chunkName(c)} ${num(x)}${bitCount(s.has[i]![c]!) === s.n ? ' (whole sum)' : ''}`).join(', ')}`,
    )
    .join('; ')}.`;
}
