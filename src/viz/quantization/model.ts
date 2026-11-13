/**
 * Quantization: a small weight matrix (4 × 6) stored as 8-bit or 4-bit integer codes, one scale
 * per group of weights, then decoded back to see what was lost.
 *
 *   absmax (symmetric)      s = (2^(b−1) − 1) / max |w|,  q = round(s · w),  ŵ = q / s
 *                           int8 codes run from −127 to 127, int4 from −7 to 7
 *   zero-point (asymmetric) s = (2^b − 1) / (max − min),  z = round(−min · s),
 *                           q = clamp(round(s · w) + z, 0, 2^b − 1),  ŵ = (q − z) / s
 *                           with min ≤ 0 ≤ max, so 0 is exactly code z
 *
 * Both follow Dettmers et al. 2022 (LLM.int8()), where s is the scaling constant; round takes
 * halves away from zero. A group is the whole matrix (per-tensor), one row, or a block of three
 * neighbours in a row (block-wise, as in QLoRA's blocks of 64). One large weight, an outlier,
 * sets the scale of its whole group: per-tensor, every small weight then gets only a few codes.
 *
 *   load(numbers)   up to 24 weights, row by row (the rest are 0)
 *   set(r, c, v)    change one weight (an outlier, say)
 *   quantize        scales, codes, decoded weights and errors
 *
 * Settings
 *   bits    '8' (the default) or '4'
 *   scheme  'absmax' (the default) or 'zeropoint'
 *   group   'tensor' (the default), 'row' or '3'
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { round3, two } from '../_lm/numbers';

export type Bits = '8' | '4';
export type Scheme = 'absmax' | 'zeropoint';
export type Grouping = 'tensor' | 'row' | '3';

export interface QuantSettings {
  [key: string]: Scalar;
  bits: Bits;
  scheme: Scheme;
  group: Grouping;
}

export const defaults: QuantSettings = { bits: '8', scheme: 'absmax', group: 'tensor' };

export const ROWS = 4;
export const COLS = 6;
export const BLOCK = 3;
/** The largest weight the toy takes, so every number fits its cell. */
export const MAX_W = 9.99;
/** Bits for one stored scale (a 32-bit float, as QLoRA counts it) and for the original weights. */
export const SCALE_BITS = 32;
export const FP16 = 16;

export interface Group {
  /** Where its scale is drawn: row r, column k of the scale panel. */
  r: number;
  k: number;
  cells: [number, number][];
  /** The range the codes cover: −absmax to absmax, or min to max (0 always inside). */
  lo: number;
  hi: number;
  s: number;
  /** The code for 0 (zero-point); 0 for absmax. */
  z: number;
}

export interface QuantState {
  w: number[][] | null;
  groups: Group[];
  /** Codes so far (null until a weight is coded). */
  q: (number | null)[][];
  /** Decoded weights, once quantize has got that far. */
  deq: number[][] | null;
}

type S = QuantState;
type Op = OpSpec<S, QuantSettings, unknown>;
type QStep = Step<S, unknown>;

const empty = () => Array.from({ length: ROWS }, () => Array<number | null>(COLS).fill(null));

export function init(): S {
  return { w: null, groups: [], q: empty(), deq: null };
}

// ---------------------------------------------------------------------------------------------
// The arithmetic, in the order the code tabs do it

/** Round to the nearest whole number, halves away from zero. */
export const roundHalfAway = (x: number): number =>
  // + 0 turns −0 into 0.
  Math.sign(x) * Math.floor(Math.abs(x) + 0.5) + 0;

export const qmaxOf = (settings: QuantSettings): number =>
  settings.scheme === 'absmax'
    ? 2 ** (Number(settings.bits) - 1) - 1
    : 2 ** Number(settings.bits) - 1;

/** Each group's cells, row by row. */
export function groupCells(
  settings: QuantSettings,
): { r: number; k: number; cells: [number, number][] }[] {
  const all = (pred: (r: number, c: number) => boolean) => {
    const out: [number, number][] = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(r, c)) out.push([r, c]);
    return out;
  };
  if (settings.group === 'tensor') return [{ r: 0, k: 0, cells: all(() => true) }];
  if (settings.group === 'row')
    return Array.from({ length: ROWS }, (_, r) => ({ r, k: 0, cells: all((rr) => rr === r) }));
  return Array.from({ length: ROWS * (COLS / BLOCK) }, (_, g) => {
    const r = Math.floor(g / (COLS / BLOCK));
    const k = g % (COLS / BLOCK);
    return { r, k, cells: all((rr, c) => rr === r && Math.floor(c / BLOCK) === k) };
  });
}

/** The scale (and zero point) for one group of weights. */
export function scaleOf(values: readonly number[], settings: QuantSettings) {
  const qmax = qmaxOf(settings);
  if (settings.scheme === 'absmax') {
    let m = 0;
    for (const v of values) m = Math.max(m, Math.abs(v));
    // Every weight 0: any scale gives code 0 and decodes to 0.
    return { lo: -m, hi: m, s: m === 0 ? 1 : qmax / m, z: 0 };
  }
  let lo = 0;
  let hi = 0;
  for (const v of values) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const s = hi === lo ? 1 : qmax / (hi - lo);
  return { lo, hi, s, z: roundHalfAway(-lo * s) };
}

export function codeOf(w: number, g: { s: number; z: number }, settings: QuantSettings): number {
  const q = roundHalfAway(g.s * w);
  if (settings.scheme === 'absmax') return q;
  return Math.max(0, Math.min(qmaxOf(settings), q + g.z));
}

export const decode = (q: number, g: { s: number; z: number }): number => (q - g.z) / g.s;

/** The whole round trip, for tests and practice. */
export function quantizeMatrix(w: number[][], settings: QuantSettings) {
  const groups: Group[] = groupCells(settings).map((g) => ({
    ...g,
    ...scaleOf(
      g.cells.map(([r, c]) => w[r]![c]!),
      settings,
    ),
  }));
  const q = empty() as number[][];
  const deq = w.map((row) => row.map(() => 0));
  for (const g of groups)
    for (const [r, c] of g.cells) {
      q[r]![c] = codeOf(w[r]![c]!, g, settings);
      deq[r]![c] = decode(q[r]![c]!, g);
    }
  return { groups, q, deq };
}

export const groupOfCell = (s: S, r: number, c: number): Group | undefined =>
  s.groups.find((g) => g.cells.some(([gr, gc]) => gr === r && gc === c));

// ---------------------------------------------------------------------------------------------
// Readouts

export interface ErrorStats {
  max: number;
  total: number;
  at: [number, number];
  /** Weights that are not 0 but decode to 0. */
  zeroed: number;
}

export function errorStats(s: S): ErrorStats | null {
  if (!s.w || !s.deq) return null;
  let max = 0;
  let total = 0;
  let at: [number, number] = [0, 0];
  let zeroed = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const e = Math.abs(s.deq[r]![c]! - s.w[r]![c]!);
      total += e;
      if (e > max) {
        max = e;
        at = [r, c];
      }
      if (s.w[r]![c]! !== 0 && s.deq[r]![c]! === 0) zeroed++;
    }
  return { max, total, at, zeroed };
}

/** Bits per weight: the codes plus each group's scale (and zero point). */
export function bitsPerWeight(settings: QuantSettings): number {
  const b = Number(settings.bits);
  const groups = groupCells(settings).length;
  const extra = groups * (SCALE_BITS + (settings.scheme === 'zeropoint' ? b : 0));
  return b + extra / (ROWS * COLS);
}

export function vars(s: S, settings: QuantSettings): Record<string, Scalar> {
  const e = errorStats(s);
  return {
    bits: Number(settings.bits),
    scales: groupCells(settings).length,
    'bits per weight': bitsPerWeight(settings).toFixed(2),
    'max |error|': e ? round3(e.max) : '–',
    'total |error|': e ? round3(e.total) : '–',
    'lost to 0': e ? e.zeroed : '–',
  };
}

// ---------------------------------------------------------------------------------------------
// Numbers in words and cells

/** Two decimals, as a weight is shown: .53, −1.2, 4. */
export { short } from '../_lm/numbers';

/** Three significant digits for a scale: 137, 26.5, 7.53, .701. */
export function sig3(x: number): string {
  const a = Math.abs(x);
  const s = a >= 100 ? String(Math.round(a)) : a.toFixed(a >= 10 ? 1 : a >= 1 ? 2 : 3);
  const t = s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  const u = t.startsWith('0.') ? t.slice(1) : t;
  return x < 0 ? `−${u}` : u;
}

/** A decoded weight or an error: three decimals below 1, two above, no leading zero. */
export function fine(x: number): string {
  const a = Math.abs(x);
  const k = a < 1 ? Math.round(a * 1000) / 1000 : Math.round(a * 100) / 100;
  if (k === 0) return '0';
  let t = k
    .toFixed(k < 1 ? 3 : 2)
    .replace(/0+$/, '')
    .replace(/\.$/, '');
  if (t.startsWith('0.')) t = t.slice(1);
  return x < 0 ? `−${t}` : t;
}

/** Three decimals with a leading zero, for narration. */
const three = (x: number) => {
  const t = round3(x);
  return t.startsWith('-') ? `−${t.slice(1)}` : t;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function groupName(g: { r: number; k: number }, settings: QuantSettings): string {
  if (settings.group === 'tensor') return 'the whole matrix';
  if (settings.group === 'row') return `row ${g.r + 1}`;
  return `row ${g.r + 1}, columns ${g.k * BLOCK + 1} to ${g.k * BLOCK + BLOCK}`;
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const cellMarks = (panel: string, cells: readonly [number, number][], role: Mark['role']) =>
  cells.map(([r, c]) => mark(`${panel}-${r}-${c}`, role));
const scaleMarks = (s: S, g: Group, settings: QuantSettings, role: Mark['role']) => {
  const rows = settings.group === 'tensor' ? Array.from({ length: ROWS }, (_, r) => r) : [g.r];
  return rows.flatMap((r) => [
    mark(`s-${r}-${g.k}`, role),
    ...(settings.scheme === 'zeropoint' ? [mark(`z-${r}-${g.k}`, role)] : []),
  ]);
};

function refuse(s: S, settings: QuantSettings, say: string): QStep {
  return { state: s, marks: [], say, lines: [], level: 1, vars: vars(s, settings) };
}

/** A weight as typed: a number up to MAX_W in size, kept to two decimals. */
export function parseWeight(v: Value | undefined): number | null {
  const t = String(v ?? '')
    .trim()
    .replace(/^[−–]/, '-');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const x = Math.round(Number(t) * 100) / 100 || 0;
  return Math.abs(x) <= MAX_W ? x : null;
}

// ---------------------------------------------------------------------------------------------
// Operations

const loadOp: Op = {
  label: 'Load',
  arity: 1,
  *run(s, args, { settings }) {
    const tokens = String(args[0] ?? '')
      .split(/[\s,;]+/)
      .filter(Boolean);
    const xs = tokens.map(parseWeight);
    if (!tokens.length || tokens.length > ROWS * COLS || xs.some((x) => x === null)) {
      yield refuse(
        s,
        settings,
        `Type up to ${ROWS * COLS} weights, row by row, separated by spaces, each between −${MAX_W} and ${MAX_W}, such as .5 −.3 1.2. Missing ones are 0.`,
      );
      return s;
    }
    const flat = [...(xs as number[]), ...Array<number>(ROWS * COLS - xs.length).fill(0)];
    const w = Array.from({ length: ROWS }, (_, r) => flat.slice(r * COLS, (r + 1) * COLS));
    const state: S = { w, groups: [], q: empty(), deq: null };
    const top = Math.max(...flat.map(Math.abs));
    yield {
      state,
      marks: [],
      say: `A ${ROWS} × ${COLS} matrix of weights${xs.length < ROWS * COLS ? ` (${xs.length} typed, the other ${ROWS * COLS - xs.length} are 0)` : ''}, stored as 16-bit floats: ${ROWS * COLS * FP16} bits. The largest in size is ${two(top)}. Press Quantize.`,
      lines: ['l-sig'],
      level: 1,
      vars: vars(state, settings),
    };
    return state;
  },
};

const setOp: Op = {
  label: 'Set',
  arity: 3,
  *run(s, args, { settings }) {
    const r = Number(args[0]);
    const c = Number(args[1]);
    const v = parseWeight(args[2]);
    if (!s.w) {
      yield refuse(s, settings, 'Load some weights first, or press Random matrix.');
      return s;
    }
    if (
      !Number.isInteger(r) ||
      !Number.isInteger(c) ||
      r < 1 ||
      r > ROWS ||
      c < 1 ||
      c > COLS ||
      v === null
    ) {
      yield refuse(
        s,
        settings,
        `Set takes a row (1 to ${ROWS}), a column (1 to ${COLS}) and a weight between −${MAX_W} and ${MAX_W}, such as 2 3 6.5.`,
      );
      return s;
    }
    const w = s.w.map((row) => [...row]);
    const old = w[r - 1]![c - 1]!;
    w[r - 1]![c - 1] = v;
    const state: S = { w, groups: [], q: empty(), deq: null };
    const top = Math.max(...w.flat().map(Math.abs));
    yield {
      state,
      marks: [mark(`W-${r - 1}-${c - 1}`, 'new')],
      say: `Row ${r}, column ${c}: ${two(old)} becomes ${two(v)}.${
        Math.abs(v) === top &&
        Math.abs(v) >
          2 *
            Math.max(
              ...w
                .flat()
                .filter((_, i) => i !== (r - 1) * COLS + c - 1)
                .map(Math.abs),
            )
          ? ' It is now an outlier, more than twice the size of any other weight.'
          : ''
      } Press Quantize to see what it does to the codes.`,
      lines: ['e-sig'],
      level: 1,
      vars: vars(state, settings),
    };
    return state;
  },
};

const quantizeOp: Op = {
  label: 'Quantize',
  arity: 0,
  *run(s, _args, { settings }) {
    if (!s.w) {
      yield refuse(
        s,
        settings,
        'Load some weights first: type a few numbers and press Load, or press Random matrix.',
      );
      return s;
    }
    const w = s.w;
    const b = Number(settings.bits);
    const qmax = qmaxOf(settings);
    const abs = settings.scheme === 'absmax';
    let state: S = { w, groups: [], q: empty(), deq: null };
    const shapes = groupCells(settings);
    for (const [gi, shape] of shapes.entries()) {
      const values = shape.cells.map(([r, c]) => w[r]![c]!);
      const g: Group = { ...shape, ...scaleOf(values, settings) };
      state = { ...state, groups: [...state.groups, g] };
      const where = groupName(g, settings);
      const big = shape.cells.reduce((best, cell) =>
        Math.abs(w[cell[0]]![cell[1]]!) > Math.abs(w[best[0]]![best[1]]!) ? cell : best,
      );
      const intro =
        gi === 0
          ? `${b}-bit ${abs ? 'absmax' : 'zero-point'} codes, ${plural(shapes.length, 'scale')}. `
          : '';
      const flat = g.hi === g.lo;
      yield {
        state,
        marks: [
          ...cellMarks('W', shape.cells, 'active'),
          mark(`W-${big[0]}-${big[1]}`, 'found'),
          ...scaleMarks(state, g, settings, 'new'),
        ],
        say: flat
          ? `${intro}${where[0]!.toUpperCase()}${where.slice(1)}: every weight is 0, so any scale will do; take s = 1${abs ? '' : ' and z = 0'}.`
          : abs
            ? `${intro}${where[0]!.toUpperCase()}${where.slice(1)}: the largest in size is ${two(g.hi)}, so s = ${qmax} / ${two(g.hi)} = ${sig3(g.s)}. Code ±${qmax} stands for ±${two(g.hi)}, and one code step is 1 / s = ${three(1 / g.s)}.`
            : `${intro}${where[0]!.toUpperCase()}${where.slice(1)}: the weights run from ${two(g.lo)} to ${two(g.hi)} (0 included), so s = ${qmax} / ${two(g.hi - g.lo)} = ${sig3(g.s)}, and z = round(${two(-g.lo)} × ${sig3(g.s)}) = ${g.z}: code ${g.z} stands for 0.`,
        lines: abs ? ['q-group', 's-abs'] : ['q-group', 's-range', 's-zero'],
        level: 2,
        vars: vars(state, settings),
      };
      for (const [r, c] of shape.cells) {
        const x = w[r]![c]!;
        const code = codeOf(x, g, settings);
        const q = state.q.map((row) => [...row]);
        q[r]![c] = code;
        state = { ...state, q };
        const raw = roundHalfAway(g.s * x);
        const clamped = !abs && raw + g.z !== code;
        yield {
          state,
          marks: [mark(`W-${r}-${c}`, 'active'), mark(`q-${r}-${c}`, 'new')],
          say: abs
            ? `w = ${two(x)}: s · w = ${sig3(g.s)} × ${two(x)} = ${two(g.s * x)}, which rounds to ${code}.`
            : `w = ${two(x)}: s · w = ${two(g.s * x)} rounds to ${raw}; plus z = ${g.z} gives ${raw + g.z}${clamped ? `, clamped to ${code}` : ''}.`,
          lines: ['q-code'],
          level: 3,
          vars: vars(state, settings),
        };
      }
      const codes = shape.cells.map(([r, c]) => state.q[r]![c]!);
      const few = new Set(codes).size;
      yield {
        state,
        marks: [...cellMarks('q', shape.cells, 'new'), ...scaleMarks(state, g, settings, 'active')],
        say: `Codes for ${where}: ${codes.join(', ')}. ${plural(few, 'different code')} out of the ${abs ? `${2 * qmax + 1} there are (−${qmax} to ${qmax})` : `${qmax + 1} there are (0 to ${qmax})`}.`,
        lines: ['q-code'],
        level: 2,
        vars: vars(state, settings),
      };
    }
    const { deq } = quantizeMatrix(w, settings);
    state = { ...state, deq };
    const all: [number, number][] = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) all.push([r, c]);
    yield {
      state,
      marks: cellMarks('d', all, 'new'),
      say: `Decode every weight: ŵ = ${abs ? 'q / s' : '(q − z) / s'}. These are the numbers the model computes with; QLoRA, for one, decodes its 4-bit weights to 16-bit numbers for each matrix product.`,
      lines: ['q-deq'],
      level: 2,
      vars: vars(state, settings),
    };
    const e = errorStats(state)!;
    const [mr, mc] = e.at;
    yield {
      state,
      marks: [...cellMarks('e', all, 'active'), mark(`e-${mr}-${mc}`, 'found')],
      say: `The error ŵ − w. Total |error| ${three(e.total)}; the largest is ${three(e.max)}, at row ${mr + 1}, column ${mc + 1}, no more than half a code step of its group.${e.zeroed ? ` ${plural(e.zeroed, 'weight')} that ${e.zeroed === 1 ? 'is' : 'are'} not 0 ${e.zeroed === 1 ? 'decodes' : 'decode'} to 0: ${e.zeroed === 1 ? 'it is' : 'they are'} lost.` : ''} Storage: ${bitsPerWeight(settings).toFixed(2)} bits per weight against 16.`,
      lines: ['q-err'],
      level: 1,
      vars: vars(state, settings),
    };
    return state;
  },
};

export const ops = { load: loadOp, set: setOp, quantize: quantizeOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: QuantSettings): PseudoBlock[] {
  const qmax = qmaxOf(settings);
  const over =
    settings.group === 'tensor'
      ? 'the whole matrix (one group)'
      : settings.group === 'row'
        ? 'each row G'
        : `each block G of ${BLOCK} in a row`;
  const plainOver =
    settings.group === 'tensor'
      ? 'Take all the weights together:'
      : settings.group === 'row'
        ? 'For each row on its own:'
        : `For each run of ${BLOCK} neighbours in a row:`;
  const scale =
    settings.scheme === 'absmax'
      ? [
          L(
            's-abs',
            2,
            `s = ${qmax} / max |w| over G`,
            `the largest weight in size gets code ${qmax};`,
          ),
          L(
            'q-code',
            2,
            'for each w in G: q = round(s · w)',
            'every weight gets the nearest code.',
          ),
        ]
      : [
          L(
            's-range',
            2,
            `s = ${qmax} / (max G − min G), with 0 in the range`,
            `the codes 0 to ${qmax} cover the weights from smallest to largest;`,
          ),
          L('s-zero', 2, 'z = round(−min G · s)', 'z is the code that stands for 0;'),
          L(
            'q-code',
            2,
            `for each w in G: q = clamp(round(s · w) + z, 0, ${qmax})`,
            'every weight gets the nearest code.',
          ),
        ];
  return [
    {
      op: 'load',
      lines: [
        L(
          'l-sig',
          0,
          `LOAD(weights): W = ${ROWS} × ${COLS}, row by row`,
          'Fill the matrix with the weights.',
        ),
      ],
    },
    {
      op: 'set',
      lines: [L('e-sig', 0, 'SET(r, c, v): W[r][c] = v', 'Change one weight.')],
    },
    {
      op: 'quantize',
      lines: [
        L(
          'q-sig',
          0,
          `QUANTIZE(W, ${settings.bits} bits)`,
          `Store every weight in ${settings.bits} bits:`,
        ),
        L('q-group', 1, `for ${over}:`, plainOver),
        ...scale,
        L(
          'q-deq',
          1,
          settings.scheme === 'absmax'
            ? 'ŵ = q / s for every weight'
            : 'ŵ = (q − z) / s for every weight',
          'Decoding turns each code back into a number,',
        ),
        L('q-err', 1, 'error = ŵ − W', 'and the difference is what was lost.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(_s: S, settings: QuantSettings): string {
  return `No weights yet. Press Random matrix, or type up to ${ROWS * COLS} numbers and press Load; then Quantize stores them as ${settings.bits}-bit codes.`;
}

export const initialVars = (s: S, settings: QuantSettings) => vars(s, settings);

export function describe(s: S, settings: QuantSettings): string {
  if (!s.w) return 'No weights yet.';
  const rows = s.w.map((row, r) => `row ${r + 1}: ${row.map(two).join(' ')}`).join('; ');
  const e = errorStats(s);
  const q = s.q.every((row) => row.every((x) => x !== null))
    ? ` Codes: ${s.q.map((row) => row.join(' ')).join('; ')}.`
    : '';
  return `${ROWS} × ${COLS} weights, ${settings.bits}-bit ${settings.scheme}, ${settings.group === 'tensor' ? 'one scale' : settings.group === 'row' ? 'a scale per row' : `a scale per block of ${BLOCK}`}. ${rows}.${q}${e ? ` Total error ${three(e.total)}, largest ${three(e.max)}.` : ''}`;
}
