/**
 * FlashAttention (Dao et al. 2022): attention computed tile by tile, so the n × n table of
 * scores is never stored. Q is cut into blocks of B_r rows and K and V into blocks of B_c rows;
 * a tile is one Q block against one K/V block, small enough for the GPU's fast on-chip memory
 * (SRAM). Each row keeps three things as the tiles go by: the largest score so far m, the sum ℓ
 * of e^(score − m), and its output O, a blend of the values so far. When a later tile has a
 * larger score, the old ℓ and O are rescaled by e^(old m − new m). This is the online softmax,
 * and after the last tile O is exactly what plain attention gives.
 *
 * Q, K and V come from the hand-made head of the self-attention page (d_k = d_v = 2), and the
 * scores are q · k / √d_k, with the causal mask when it is on.
 *
 * Per row, for a tile whose visible scores are s_j (Algorithm 1 of the paper, line 9 to 12):
 *   m̃ = max s_j    p_j = e^(s_j − m̃)    ℓ̃ = Σ p_j
 *   m' = max(m, m̃)    a = e^(m − m')    b = e^(m̃ − m')
 *   ℓ' = a·ℓ + b·ℓ̃    o' = (ℓ·a·o + b·Σ p_j v_j) / ℓ'
 * A row that sees none of the tile's keys (all masked) is left alone, and a tile whose every
 * score is masked is skipped.
 *
 * Memory traffic, in numbers moved between slow memory (HBM) and the chip:
 *   plain       read Q and K, write S (n²), read S, write P (n²), read P and V, write O
 *   order 'kv'  (the 2022 paper) K/V blocks outside: O, ℓ and m start in HBM; each K/V block is
 *               read once; each tile reads Q_i, O_i, ℓ_i, m_i and writes O_i, ℓ_i, m_i back
 *   order 'q'   (FlashAttention-2, Dao 2023) Q blocks outside: each Q block is read once and its
 *               O written once; each tile reads its K and V blocks. (FlashAttention-2 also keeps
 *               the division by ℓ until the end; here both orders do the same arithmetic.)
 *
 * Operations: load (a sentence), tile (the next tile), flash (every tile left), plain (plain
 * attention, with the whole table in HBM).
 *
 * Settings
 *   order   'kv' (the default) or 'q': which blocks the outer loop runs over
 *   br, bc  rows per Q block and per K/V block: '1' to '4' (default 2 and 2)
 *   causal  the causal mask (default on, as on the self-attention page)
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { dot, softmax, short, two } from '../_lm/numbers';
import { embed, known } from '../_lm/vocab';
import {
  attention,
  D_K,
  DESIGNED,
  parseSentence,
  project,
  wordName,
} from '../self-attention/model';

export { D_K };
export const START_TEXT = 'the cat sat on the mat';

export type Order = 'kv' | 'q';
export type BlockSetting = '1' | '2' | '3' | '4';

export interface FlashSettings {
  [key: string]: Scalar;
  order: Order;
  br: BlockSetting;
  bc: BlockSetting;
  causal: boolean;
}

export const defaults: FlashSettings = { order: 'kv', br: '2', bc: '2', causal: true };

/** Numbers moved between HBM and the chip, by what moved. */
export interface Traffic {
  /** Q read. */
  q: number;
  /** K and V read. */
  kv: number;
  /** O, m and ℓ read and written. */
  oml: number;
  /** The table: S and P written and read (plain attention only). */
  table: number;
}

export interface FlashRun {
  /** Tiles finished, in the order the loops visit them. */
  done: number;
  m: number[];
  l: number[];
  o: number[][];
  traffic: Traffic;
}

export interface PlainRun {
  /** Scores (scaled, masked), weights, row max and row sum, outputs. */
  s: number[][];
  p: number[][];
  m: number[];
  l: number[];
  o: number[][];
  traffic: Traffic;
}

export interface FlashState {
  words: string[];
  x: number[][];
  q: number[][];
  k: number[][];
  v: number[][];
  flash?: FlashRun;
  plain?: PlainRun;
}

export interface FlashExtra {
  /** The tile on chip (its index in `tileOrder`): its scores are on screen. */
  tile?: number;
  /** Plain attention: what the table shows and how many rows of it are filled. */
  plain?: { stage: 'scores' | 'weights' | 'out'; rows: number };
}

type S = FlashState;
type X = FlashExtra;
type Op = OpSpec<S, FlashSettings, X>;
type FStep = Step<S, X>;
type Level = 1 | 2 | 3;

export interface Tile {
  /** Q block and K/V block numbers, from 0. */
  a: number;
  b: number;
  /** Rows [r0, r1) and columns [c0, c1). */
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

export const brOf = (s: FlashSettings) => Number(s.br);
export const bcOf = (s: FlashSettings) => Number(s.bc);

/** Every tile of an n × n table, Q block by Q block. */
export function allTiles(n: number, settings: FlashSettings): Tile[] {
  const br = brOf(settings);
  const bc = bcOf(settings);
  const out: Tile[] = [];
  for (let a = 0; a * br < n; a++)
    for (let b = 0; b * bc < n; b++)
      out.push({
        a,
        b,
        r0: a * br,
        r1: Math.min(n, (a + 1) * br),
        c0: b * bc,
        c1: Math.min(n, (b + 1) * bc),
      });
  return out;
}

/** Under the causal mask, a tile whose last row comes before its first key is all masked. */
export const isSkipped = (t: Tile, causal: boolean): boolean => causal && t.r1 - 1 < t.c0;

/** The tiles the loops visit, in order; skipped tiles left out. */
export function tileOrder(n: number, settings: FlashSettings): Tile[] {
  const tiles = allTiles(n, settings).filter((t) => !isSkipped(t, settings.causal));
  return settings.order === 'kv' ? [...tiles].sort((p, q) => p.b - q.b || p.a - q.a) : tiles;
}

/** The score of row i against key j: q·k / √d_k, or −∞ under the mask. */
export function score(s: S, i: number, j: number, causal: boolean): number {
  return causal && j > i ? -Infinity : dot(s.q[i]!, s.k[j]!) / Math.sqrt(D_K);
}

/** What plain attention moves: Q, K, V read, S and P written and read, O written. */
export function plainTraffic(n: number): Traffic {
  return { q: n * D_K, kv: 2 * n * D_K, oml: n * D_K, table: 4 * n * n };
}

export const totalOf = (t: Traffic): number => t.q + t.kv + t.oml + t.table;

const noTraffic = (): Traffic => ({ q: 0, kv: 0, oml: 0, table: 0 });

/** One row's update for one tile: the online softmax. */
export interface RowUpdate {
  i: number;
  /** The visible keys and their scores. */
  js: number[];
  s: number[];
  tileMax: number;
  /** e^(s − tile max) for each, and their sum. */
  p: number[];
  tileSum: number;
  before: { m: number; l: number; o: number[] };
  m: number;
  /** The rescaling of the old sum and output, and of the new terms. */
  a: number;
  b: number;
  l: number;
  o: number[];
}

/** Fold the tile's visible keys into row i's running m, ℓ and O; null when it sees none. */
export function updateRow(
  s: S,
  i: number,
  t: Tile,
  causal: boolean,
  run: { m: number[]; l: number[]; o: number[][] },
): RowUpdate | null {
  const js: number[] = [];
  const sc: number[] = [];
  for (let j = t.c0; j < t.c1; j++) {
    if (causal && j > i) continue;
    js.push(j);
    sc.push(score(s, i, j, causal));
  }
  if (!js.length) return null;
  const tileMax = Math.max(...sc);
  const p = sc.map((x) => Math.exp(x - tileMax));
  let tileSum = 0;
  for (const e of p) tileSum += e;
  const m0 = run.m[i]!;
  const l0 = run.l[i]!;
  const o0 = run.o[i]!;
  const m = Math.max(m0, tileMax);
  const a = Math.exp(m0 - m);
  const b = Math.exp(tileMax - m);
  const l = a * l0 + b * tileSum;
  const o = o0.map((oc, c) => {
    let pv = 0;
    js.forEach((j, k) => (pv += p[k]! * s.v[j]![c]!));
    return (l0 * a * oc + b * pv) / l;
  });
  return { i, js, s: sc, tileMax, p, tileSum, before: { m: m0, l: l0, o: [...o0] }, m, a, b, l, o };
}

/** The whole tiled computation at once, for tests and the code tabs. */
export function flashAttention(s: S, settings: FlashSettings): FlashRun {
  const n = s.words.length;
  const run = startRun(n);
  for (const t of tileOrder(n, settings)) {
    for (let i = t.r0; i < t.r1; i++) {
      const u = updateRow(s, i, t, settings.causal, run);
      if (!u) continue;
      run.m[i] = u.m;
      run.l[i] = u.l;
      run.o[i] = u.o;
    }
  }
  run.done = tileOrder(n, settings).length;
  run.traffic = flashTraffic(n, settings);
  return run;
}

function startRun(n: number): FlashRun {
  return {
    done: 0,
    m: Array<number>(n).fill(-Infinity),
    l: Array<number>(n).fill(0),
    o: Array.from({ length: n }, () => Array<number>(D_K).fill(0)),
    traffic: noTraffic(),
  };
}

/** What reading or writing around tile k moves, in the loop order. */
function tileTraffic(n: number, settings: FlashSettings, k: number) {
  const order = tileOrder(n, settings);
  const t = order[k]!;
  const prev = order[k - 1];
  const next = order[k + 1];
  const rows = t.r1 - t.r0;
  const cols = t.c1 - t.c0;
  const d = D_K;
  if (settings.order === 'kv') {
    return {
      init: k === 0 ? n * d + 2 * n : 0,
      outer: !prev || prev.b !== t.b ? 2 * cols * d : 0,
      load: rows * d + rows * d + 2 * rows,
      store: rows * d + 2 * rows,
      q: rows * d,
    };
  }
  return {
    init: 0,
    outer: !prev || prev.a !== t.a ? rows * d : 0,
    load: 2 * cols * d,
    store: !next || next.a !== t.a ? rows * d : 0,
    q: 0,
  };
}

/** The traffic of the whole tiled computation. */
export function flashTraffic(n: number, settings: FlashSettings): Traffic {
  const t = noTraffic();
  tileOrder(n, settings).forEach((_, k) => addTile(t, n, settings, k));
  return t;
}

function addTile(t: Traffic, n: number, settings: FlashSettings, k: number) {
  const x = tileTraffic(n, settings, k);
  if (settings.order === 'kv') {
    t.oml += x.init + x.load - x.q + x.store;
    t.kv += x.outer;
    t.q += x.q;
  } else {
    t.q += x.outer;
    t.kv += x.load;
    t.oml += x.store;
  }
}

// ---------------------------------------------------------------------------------------------
// Words

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const range = (lo: number, hi: number) => Array.from({ length: hi - lo }, (_, i) => lo + i);

/** "A", "A and D", "A, C and D". */
export function list(xs: readonly (string | number)[]): string {
  const s = xs.map(String);
  if (s.length <= 1) return s.join('');
  return `${s.slice(0, -1).join(', ')} and ${s.at(-1)}`;
}

const vec = (v: readonly number[]) => `(${v.map(two).join(', ')})`;
const names = (s: S) => s.words.map((_, i) => wordName(s.words, i));

/** "rows 3–4 (sat on)", "row 3 (sat)". */
function rowsText(s: S, lo: number, hi: number, what: string): string {
  const where = hi - lo === 1 ? `${lo + 1}` : `${lo + 1}–${hi}`;
  return `${what}${hi - lo === 1 ? '' : 's'} ${where} (${s.words.slice(lo, hi).join(' ')})`;
}

/** A power of ten above x, as words: "10⁻¹⁵". */
function tenAbove(x: number): string {
  const sup: Record<string, string> = {
    '-': '⁻',
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
  };
  const e = Math.ceil(Math.log10(x));
  return `10${[...String(e)].map((c) => sup[c]).join('')}`;
}

export function vars(s: S, settings: FlashSettings): Record<string, Scalar> {
  const n = s.words.length;
  const run = s.flash ?? s.plain;
  const t = run?.traffic ?? noTraffic();
  return {
    words: n,
    tiles: s.flash ? `${s.flash.done} of ${tileOrder(n, settings).length}` : '–',
    'Q read': t.q,
    'K, V read': t.kv,
    'O, m, ℓ moved': t.oml,
    'S, P moved': t.table,
    'HBM total': totalOf(t),
    'plain total': totalOf(plainTraffic(n)),
  };
}

function refuse(s: S, settings: FlashSettings, say: string): FStep {
  return { state: s, marks: [], say, lines: [], level: 1, vars: vars(s, settings) };
}

const qMarks = (lo: number, hi: number, role: Mark['role']) =>
  range(lo, hi).flatMap((i) => range(0, D_K).map((c) => mark(`q-${i}-${c}`, role)));
const kvMarks = (lo: number, hi: number, role: Mark['role']) =>
  range(lo, hi).flatMap((j) =>
    range(0, D_K).flatMap((c) => [mark(`kt-${c}-${j}`, role), mark(`vt-${c}-${j}`, role)]),
  );
const tileMarks = (t: Tile, role: Mark['role']) =>
  range(t.r0, t.r1).flatMap((i) => range(t.c0, t.c1).map((j) => mark(`s-${i}-${j}`, role)));
const statMarks = (i: number, role: Mark['role']) => [
  mark(`m-${i}`, role),
  mark(`l-${i}`, role),
  ...range(0, D_K).map((c) => mark(`o-${i}-${c}`, role)),
];

// ---------------------------------------------------------------------------------------------
// Operations

const loadOp: Op = {
  label: 'Load',
  arity: 1,
  *run(s, args, { settings }) {
    const words = parseSentence(String(args[0]));
    if (words instanceof Error) {
      yield refuse(s, settings, words.message);
      return s;
    }
    const next = loaded(words);
    const unknown = [...new Set(words.filter((w) => !known(w)))];
    const odd = unknown.length
      ? ` ${list(unknown)} ${unknown.length === 1 ? 'is' : 'are'} not in the toy vocabulary, so ${unknown.length === 1 ? 'it gets' : 'they get'} made-up numbers.`
      : '';
    const n = words.length;
    yield {
      state: next,
      marks: [...qMarks(0, n, 'new'), ...kvMarks(0, n, 'new')],
      say: `${plural(n, 'word')}: ${words.join(' ')}. Q, K and V come from the hand-made head of the self-attention page, two numbers per word.${odd} With blocks of ${settings.br} and ${settings.bc}, the ${n} × ${n} table is ${plural(tileOrder(n, settings).length, 'tile')} to compute. Press Next tile.`,
      lines: ['l-sig', 'l-qkv'],
      level: 1,
      vars: vars(next, settings),
    };
    return next;
  },
};

function loaded(words: string[]): S {
  const x = words.map(embed);
  const p = project(x, DESIGNED);
  return { words, x, q: p.q, k: p.k, v: p.v };
}

export function init(): S {
  return loaded(parseSentence(START_TEXT) as string[]);
}

/** The narration of one row's update. */
function rowSay(s: S, u: RowUpdate, causal: boolean, t: Tile): string {
  const nm = names(s)[u.i]!;
  const hidden = causal && t.c1 - 1 > u.i ? ' (the later keys are masked)' : '';
  const scores = u.s.map(two);
  const sc =
    scores.length === 1 ? `its score here is ${scores[0]}` : `its scores here are ${list(scores)}`;
  if (u.before.m === -Infinity)
    return u.s.length === 1
      ? `Row ${nm} sees its first key${hidden}: score ${scores[0]}. So m = ${two(u.m)}, ℓ = e^0 = 1, and O is that key's value: ${vec(u.o)}.`
      : `Row ${nm} sees its first keys${hidden}: scores ${list(scores)}. So m = ${two(u.m)}, ℓ = ${u.p.map((p) => two(p)).join(' + ')} = ${two(u.l)}, and O blends their values with weights e^(s − m) / ℓ: ${vec(u.o)}.`;
  const grew = u.m > u.before.m;
  const why = grew
    ? `The tile's largest, ${two(u.tileMax)}, beats the running max ${two(u.before.m)}, so m becomes ${two(u.m)}, and the old sum and output shrink by e^(${two(u.before.m)} − ${two(u.m)}) = ${two(u.a)}.`
    : `The tile's largest, ${two(u.tileMax)}, is no more than the running max ${two(u.m)}, so m stays, and the new terms count e^(${two(u.tileMax)} − ${two(u.m)}) = ${two(u.b)} as much.`;
  return `Row ${nm}: ${sc}${hidden}. ${why} ℓ = ${two(u.a)} × ${two(u.before.l)} + ${two(u.b)} × ${two(u.tileSum)} = ${two(u.l)}; O = ${vec(u.o)}.`;
}

/** Steps for tiles from..to−1 of the run, each ending with its tile done. */
function* tileSteps(s0: S, settings: FlashSettings, count: number): Generator<FStep, S, void> {
  const n = s0.words.length;
  const order = tileOrder(n, settings);
  const nm = names(s0);
  let s: S = s0.flash ? s0 : { ...s0, flash: startRun(n), plain: undefined };
  const vs = () => vars(s, settings);
  const edit = (f: (r: FlashRun) => void) => {
    const run: FlashRun = {
      done: s.flash!.done,
      m: [...s.flash!.m],
      l: [...s.flash!.l],
      o: s.flash!.o.map((r) => [...r]),
      traffic: { ...s.flash!.traffic },
    };
    f(run);
    s = { ...s, flash: run };
  };
  const start = s.flash!.done;
  const end = Math.min(order.length, start + count);
  for (let k = start; k < end; k++) {
    const t = order[k]!;
    const x = tileTraffic(n, settings, k);
    const prev = order[k - 1];
    const rowsT = rowsText(s, t.r0, t.r1, 'row');
    const keysT = rowsText(s, t.c0, t.c1, 'key');
    if (k === 0 && settings.order === 'kv') {
      edit((r) => (r.traffic.oml += x.init));
      const skipped = allTiles(n, settings).length - order.length;
      yield {
        state: s,
        marks: range(0, n).flatMap((i) => statMarks(i, 'new')),
        say: `Start every row with m = −∞, ℓ = 0 and O = 0, written to HBM: ${x.init} numbers.${skipped ? ` The causal mask hides every key of ${plural(skipped, 'tile')} above the diagonal, so ${skipped === 1 ? 'it is' : 'they are'} skipped.` : ''}`,
        lines: ['k-init'],
        level: 2,
        vars: vs(),
        extra: {},
      };
    }
    // The outer loop moves on: read the next K/V block (order kv) or Q block (order q).
    const outerKv = settings.order === 'kv' && (!prev || prev.b !== t.b);
    const outerQ = settings.order === 'q' && (!prev || prev.a !== t.a);
    if (outerKv || outerQ) {
      edit((r) => (outerKv ? (r.traffic.kv += x.outer) : (r.traffic.q += x.outer)));
      const skipped =
        k === 0 && settings.order === 'q' ? allTiles(n, settings).length - order.length : 0;
      yield {
        state: s,
        marks: outerKv ? kvMarks(t.c0, t.c1, 'compare') : qMarks(t.r0, t.r1, 'active'),
        say: outerKv
          ? `Outer loop: K/V block ${t.b + 1}, ${keysT}. Read their keys and values from HBM, ${x.outer} numbers. They stay on chip while the Q blocks go by.`
          : `Outer loop: Q block ${t.a + 1}, ${rowsT}. Read it from HBM, ${x.outer} numbers. Its rows start on chip with m = −∞, ℓ = 0 and O = 0.${skipped ? ` The causal mask hides every key of ${plural(skipped, 'tile')} above the diagonal, so ${skipped === 1 ? 'it is' : 'they are'} skipped.` : ''}`,
        lines: outerKv ? ['k-outer', 'k-loadkv'] : ['q-outer', 'q-loadq'],
        level: 2,
        vars: vs(),
        extra: {},
      };
    }
    // Load the tile's other blocks and work out its scores.
    edit((r) => {
      if (settings.order === 'kv') {
        r.traffic.q += x.q;
        r.traffic.oml += x.load - x.q;
      } else r.traffic.kv += x.load;
    });
    const cells = range(t.r0, t.r1).reduce(
      (c, i) => c + range(t.c0, t.c1).filter((j) => !settings.causal || j <= i).length,
      0,
    );
    yield {
      state: s,
      marks: [
        ...qMarks(t.r0, t.r1, 'active'),
        ...kvMarks(t.c0, t.c1, 'compare'),
        ...tileMarks(t, 'active'),
      ],
      say:
        settings.order === 'kv'
          ? `Tile ${k + 1} of ${order.length}: ${rowsT} against ${keysT}. Read Q block ${t.a + 1} and its O, m and ℓ from HBM (${x.load} numbers), and work out ${plural(cells, 'score')} on chip: q · k / √${D_K}.`
          : `Tile ${k + 1} of ${order.length}: ${rowsT} against ${keysT}. Read K/V block ${t.b + 1} from HBM (${x.load} numbers), and work out ${plural(cells, 'score')} on chip: q · k / √${D_K}.`,
      lines:
        settings.order === 'kv'
          ? ['k-inner', 'k-loadq', 'k-score']
          : ['q-inner', 'q-loadkv', 'q-score'],
      level: 2,
      vars: vs(),
      extra: { tile: k },
    };
    // The online softmax, row by row.
    const changed: number[] = [];
    for (let i = t.r0; i < t.r1; i++) {
      const u = updateRow(s, i, t, settings.causal, s.flash!);
      if (!u) {
        yield {
          state: s,
          marks: range(t.c0, t.c1).map((j) => mark(`s-${i}-${j}`, 'stale')),
          say: `Row ${nm[i]} sees none of these keys: they all come after it, so its m, ℓ and O stay as they are.`,
          lines: [settings.order === 'kv' ? 'k-update' : 'q-update'],
          level: 3,
          vars: vs(),
          extra: { tile: k },
        };
        continue;
      }
      edit((r) => {
        r.m[i] = u.m;
        r.l[i] = u.l;
        r.o[i] = u.o;
      });
      changed.push(i);
      yield {
        state: s,
        marks: [
          ...u.js.map((j) => mark(`s-${i}-${j}`, 'active')),
          ...u.js.flatMap((j) => range(0, D_K).map((c) => mark(`vt-${c}-${j}`, 'visit'))),
          ...statMarks(i, 'new'),
        ],
        say: rowSay(s, u, settings.causal, t),
        lines: [settings.order === 'kv' ? 'k-update' : 'q-update'],
        level: 3,
        vars: vs(),
        extra: { tile: k },
      };
    }
    // The tile is done: its scores are dropped.
    edit((r) => {
      r.done = k + 1;
      r.traffic.oml += x.store;
    });
    const last = k === order.length - 1;
    const kvSay = `Write O, m and ℓ of ${rowsT} back to HBM (${x.store} numbers). The scores are dropped: they were never written.`;
    const qSay = x.store
      ? `Q block ${t.a + 1} has seen every key it may: write its O to HBM (${x.store} numbers). The scores are dropped: they were never written.`
      : `${rowsT[0]!.toUpperCase()}${rowsT.slice(1)} keep m, ℓ and O on chip for the next K/V block. The scores are dropped: they were never written.`;
    const isFinal = k === end - 1;
    if (isFinal && last) {
      yield* doneSteps(s, settings, settings.order === 'kv' ? kvSay : qSay, changed);
      return s;
    }
    yield {
      state: s,
      marks: changed.flatMap((i) => statMarks(i, 'found')),
      say: `${settings.order === 'kv' ? kvSay : qSay}${isFinal ? ` ${k + 1} of ${order.length} tiles done.` : ''}`,
      lines: settings.order === 'kv' ? ['k-store'] : x.store ? ['q-store'] : ['q-inner'],
      level: isFinal ? 1 : 2,
      vars: vs(),
      extra: {},
    };
  }
  return s;
}

/** The last tile's store, then the comparison with plain attention. */
function* doneSteps(
  s: S,
  settings: FlashSettings,
  storeSay: string,
  changed: number[],
): Generator<FStep, void, void> {
  const n = s.words.length;
  yield {
    state: s,
    marks: changed.flatMap((i) => statMarks(i, 'found')),
    say: storeSay,
    lines: settings.order === 'kv' ? ['k-store'] : ['q-store'],
    level: 2,
    vars: vars(s, settings),
    extra: {},
  };
  const plain = attention(s.x, DESIGNED, settings.causal, true);
  let diff = 0;
  s.flash!.o.forEach((row, i) =>
    row.forEach((v, c) => (diff = Math.max(diff, Math.abs(v - plain.z[i]![c]!)))),
  );
  const order = tileOrder(n, settings);
  const scores = settings.causal ? (n * (n + 1)) / 2 : n * n;
  const biggest = Math.max(...order.map((x) => (x.r1 - x.r0) * (x.c1 - x.c0)));
  const flash = totalOf(s.flash!.traffic);
  const plainT = plainTraffic(n);
  const same =
    diff === 0
      ? 'exactly, to the last bit'
      : `to within ${tenAbove(diff)}, rounding in the last bits of a float`;
  yield {
    state: s,
    marks: range(0, n).flatMap((i) => range(0, D_K).map((c) => mark(`o-${i}-${c}`, 'found'))),
    say: `All ${plural(order.length, 'tile')} done: ${plural(scores, 'score')} computed, never more than ${biggest} at a time, and none of them written to HBM. O is what plain attention gives (the self-attention page), ${same}. FlashAttention moved ${flash} numbers to and from HBM; plain attention moves ${totalOf(plainT)}, ${plainT.table} of them the table. ${flash < totalOf(plainT) ? `${totalOf(plainT) - flash} fewer.` : `At this toy size that is ${flash - totalOf(plainT)} more: see why on the Learn tab.`}`,
    lines: [settings.order === 'kv' ? 'k-ret' : 'q-ret'],
    level: 1,
    vars: vars(s, settings),
    extra: {},
  };
}

const tileOp: Op = {
  label: 'Next tile',
  arity: 0,
  *run(s, _args, { settings }) {
    const order = tileOrder(s.words.length, settings);
    if (s.flash && s.flash.done >= order.length) {
      yield refuse(
        s,
        settings,
        'Every tile is done. Load a sentence, or change the block sizes, to run it again.',
      );
      return s;
    }
    return yield* tileSteps(s, settings, 1);
  },
};

const flashOp: Op = {
  label: 'All tiles',
  arity: 0,
  *run(s, _args, { settings }) {
    const order = tileOrder(s.words.length, settings);
    if (s.flash && s.flash.done >= order.length) {
      yield refuse(
        s,
        settings,
        'Every tile is done. Load a sentence, or change the block sizes, to run it again.',
      );
      return s;
    }
    return yield* tileSteps(s, settings, order.length);
  },
};

const plainOp: Op = {
  label: 'Plain attention',
  arity: 0,
  *run(s0, _args, { settings }) {
    const n = s0.words.length;
    const r = attention(s0.x, DESIGNED, settings.causal, true);
    const sm = r.s.map((row) => softmax(row));
    const nm = names(s0);
    const t = noTraffic();
    const run = (): PlainRun => ({
      s: r.s,
      p: r.a,
      m: sm.map((x) => x.max),
      l: sm.map((x) => x.sum),
      o: r.z,
      traffic: { ...t },
    });
    let s: S = { ...s0, flash: undefined, plain: run() };
    const step = (say: string, lines: string[], level: Level, marks: Mark[], extra: X): FStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: vars(s, settings),
      extra,
    });
    t.q += n * D_K;
    t.kv += n * D_K;
    for (let i = 0; i < n; i++) {
      if (i === n - 1) {
        t.table += n * n;
        s = { ...s, plain: run() };
      }
      const seen = r.s[i]!.filter((v) => v !== -Infinity).map(two);
      yield step(
        `Row ${nm[i]}: q · k / √${D_K} against every key: ${list(seen)}${settings.causal && i < n - 1 ? `, and −∞ for the ${plural(n - 1 - i, 'key')} after it` : ''}.${i === n - 1 ? ` All ${n * n} scores are written to HBM.` : ''}`,
        ['p-score'],
        3,
        [...qMarks(i, i + 1, 'active'), ...range(0, n).map((j) => mark(`s-${i}-${j}`, 'new'))],
        { plain: { stage: 'scores', rows: i + 1 } },
      );
    }
    yield step(
      `Read Q and K from HBM (${2 * n * D_K} numbers), work out every score, S = Q·Kᵀ / √${D_K}${settings.causal ? ' with the mask' : ''}, and write all ${n * n} of them to HBM.`,
      ['p-score', 'p-write'],
      2,
      [],
      { plain: { stage: 'scores', rows: n } },
    );
    t.table += 2 * n * n;
    s = { ...s, plain: run() };
    yield step(
      `Read S back (${n * n} numbers). For each row take its largest score m, add up ℓ = Σ e^(s − m), and divide: P = softmax(S). Write P to HBM (${n * n} more).`,
      ['p-soft'],
      2,
      range(0, n).flatMap((i) => [mark(`m-${i}`, 'new'), mark(`l-${i}`, 'new')]),
      { plain: { stage: 'weights', rows: n } },
    );
    t.table += n * n;
    t.kv += n * D_K;
    t.oml += n * D_K;
    s = { ...s, plain: run() };
    yield step(
      `Read P (${n * n} numbers) and V (${n * D_K}), blend: O = P·V, and write O (${n * D_K}).`,
      ['p-out'],
      2,
      range(0, n).flatMap((i) => range(0, D_K).map((c) => mark(`o-${i}-${c}`, 'new'))),
      { plain: { stage: 'out', rows: n } },
    );
    const total = totalOf(t);
    yield step(
      `Plain attention moved ${total} numbers to and from HBM, and ${4 * n * n} of them were the ${n} × ${n} table: written, read, written again and read again. FlashAttention never writes it. Its m and ℓ end up the same as these.`,
      ['p-ret'],
      1,
      [],
      { plain: { stage: 'out', rows: n } },
    );
    return s;
  },
};

export const ops = { load: loadOp, tile: tileOp, flash: flashOp, plain: plainOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: FlashSettings): PseudoBlock[] {
  const br = settings.br;
  const bc = settings.bc;
  const mask = settings.causal ? ' (skip a tile the mask hides)' : '';
  const update = (id: string, indent: number) => [
    L(
      id,
      indent,
      'for each row: m′ = max(m, rowmax S); ℓ = e^(m−m′)·ℓ + Σ e^(S−m′); O = (rescaled old O + e^(S−m′)·V) / ℓ',
      'each row keeps its largest score m, its sum ℓ and its output O, and rescales the old ones if m grows.',
    ),
  ];
  const tiles =
    settings.order === 'kv'
      ? [
          L('k-sig', 0, 'FLASH-ATTENTION(Q, K, V)', 'Attention one tile at a time:'),
          L('k-init', 1, 'O = 0, ℓ = 0, m = −∞ in HBM', 'every row starts with nothing seen;'),
          L(
            'k-outer',
            1,
            `for each K/V block j (${bc} rows):`,
            'for each block of keys and values,',
          ),
          L('k-loadkv', 2, 'read K_j, V_j into SRAM', 'bring them onto the chip, once;'),
          L(
            'k-inner',
            2,
            `for each Q block i (${br} rows)${mask}:`,
            'then for each block of queries,',
          ),
          L(
            'k-loadq',
            3,
            'read Q_i, O_i, ℓ_i, m_i into SRAM',
            'bring the queries and their running numbers on chip,',
          ),
          L('k-score', 3, 'S = Q_i·K_jᵀ / √d_k', 'score them against these keys,'),
          ...update('k-update', 3),
          L('k-store', 3, 'write O_i, ℓ_i, m_i to HBM', 'and put the running numbers back.'),
          L('k-ret', 1, 'return O', 'O is plain attention’s answer.'),
        ]
      : [
          L('q-sig', 0, 'FLASH-ATTENTION(Q, K, V)', 'Attention one tile at a time:'),
          L('q-outer', 1, `for each Q block i (${br} rows):`, 'for each block of queries,'),
          L(
            'q-loadq',
            2,
            'read Q_i into SRAM; O_i = 0, ℓ_i = 0, m_i = −∞',
            'bring it on chip, with nothing seen yet;',
          ),
          L(
            'q-inner',
            2,
            `for each K/V block j (${bc} rows)${mask}:`,
            'then for each block of keys and values,',
          ),
          L('q-loadkv', 3, 'read K_j, V_j into SRAM', 'bring them on chip,'),
          L('q-score', 3, 'S = Q_i·K_jᵀ / √d_k', 'score the queries against them,'),
          ...update('q-update', 3),
          L('q-store', 2, 'write O_i to HBM', 'Write the block’s outputs, once.'),
          L('q-ret', 1, 'return O', 'O is plain attention’s answer.'),
        ];
  return [
    {
      op: 'load',
      lines: [
        L('l-sig', 0, 'LOAD(words)', 'Start from a sentence:'),
        L(
          'l-qkv',
          1,
          'Q = X·W_Q, K = X·W_K, V = X·W_V',
          'each word gets its query, key and value.',
        ),
      ],
    },
    { op: 'tile', lines: tiles },
    { op: 'flash', lines: tiles },
    {
      op: 'plain',
      lines: [
        L('p-sig', 0, 'ATTENTION(Q, K, V)', 'Plain attention, the whole table at once:'),
        L(
          'p-score',
          1,
          `S = Q·Kᵀ / √d_k${settings.causal ? ', masked' : ''}`,
          'score every query against every key,',
        ),
        L('p-write', 1, 'write S to HBM', 'and store the whole table in slow memory;'),
        L(
          'p-soft',
          1,
          'read S; P = softmax(S) by rows; write P',
          'read it back and turn each row into weights;',
        ),
        L('p-out', 1, 'read P, V; O = P·V; write O', 'read those back and blend the values.'),
        L('p-ret', 1, 'return O', 'Done.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S, settings: FlashSettings): string {
  const n = s.words.length;
  return `${plural(n, 'word')}: ${s.words.join(' ')}, with Q, K and V from the self-attention page's head. FlashAttention cuts the ${n} × ${n} table of scores into ${plural(tileOrder(n, settings).length, 'tile')} and never stores it. Press Next tile, All tiles, or Plain attention to compare.`;
}

export const initialVars = (s: S, settings: FlashSettings) => vars(s, settings);

export function describe(s: S, settings: FlashSettings): string {
  const base = `Words: ${s.words.join(' ')}.`;
  const nm = names(s);
  const row = (m: number[], l: number[], o: number[][]) =>
    nm
      .map((w, i) => `${w}: m ${short(m[i]!)}, ℓ ${short(l[i]!)}, O ${o[i]!.map(short).join(' ')}`)
      .join('; ');
  if (s.flash)
    return `${base} FlashAttention, ${s.flash.done} of ${tileOrder(s.words.length, settings).length} tiles done. ${row(s.flash.m, s.flash.l, s.flash.o)}.`;
  if (s.plain) return `${base} Plain attention done. ${row(s.plain.m, s.plain.l, s.plain.o)}.`;
  return `${base} Nothing computed yet.`;
}
