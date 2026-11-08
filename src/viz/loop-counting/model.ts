import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { L, and, mark, plural, wholeArg } from '../_recursion/kit';
import {
  DOUBLING,
  PATTERN,
  countRun,
  formulaText,
  type Cell,
  type Ev,
  type Found,
  type Frame,
  type Order,
  type Pattern,
  type PatternId,
} from './patterns';

/** The largest n a run or a growth test starts from. */
export const MAX_N = 16;
/** How many sizes Grow tries: n, 2n, 4n, 8n. */
export const GROW_SIZES = 4;

export interface RunState {
  n: number;
  /** Cells lit so far, in the order the counted line ran for them. */
  lit: Cell[];
  count: number;
  /** The loops run, then the count is read, compared with T(n), and simplified to Big-O. */
  phase: 'run' | 'counted' | 'formula' | 'bigO';
  /** Where the early exit found x. */
  found: Cell | null;
}

export interface GrowState {
  sizes: number[];
  /** Counts for the sizes done so far. */
  counts: number[];
  done: boolean;
}

export interface LcState {
  run: RunState | null;
  grow: GrowState | null;
}

export interface LcSettings {
  [key: string]: Scalar;
  pattern: PatternId;
  found: Found;
}

type S = LcState;
type Op = OpSpec<S, LcSettings, undefined>;
type LcStep = Step<S, undefined>;

export const defaults: LcSettings = { pattern: 'triangle', found: 'missing' };

export function init(): S {
  return { run: null, grow: null };
}

export const patternOf = (settings: LcSettings): Pattern =>
  PATTERN[settings.pattern] ?? PATTERN.triangle;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const bigO = (o: Order) => `O(${o})`;

// ----- Shape ids, shared with the view -----

/** Prefix of a slice's shapes when the run draws one grid per i. */
export const slicePrefix = (frame: Frame, s: number) => (frame.sliceNames ? `s${s}-` : '');

export const cellId = (frame: Frame, [s, r, c]: Cell) => `${slicePrefix(frame, s)}cell-${r}-${c}`;

// ----- Text -----

/** T(n) worked out for this n: "8·9/2 = 36", or just "8" when there is nothing to work out. */
export function plugText(p: Pattern, n: number, found: Found): string {
  const plug = p.plug(n, found);
  const t = String(p.exact(n, found));
  return plug === t ? t : `${plug} = ${t}`;
}

/** "= n²/2 + n/2", or "< 2n" for a bound. */
export const relation = (ex: string) => (ex.startsWith('<') ? ex : `= ${ex}`);

export const commas = (v: number) => v.toLocaleString('en-US');

/** How a count changed from a to b: "×3.6", "×1", "up from 0". */
export function ratioText(a: number, b: number): string {
  if (a === 0) return b === 0 ? '×1' : 'up from 0';
  const r = b / a;
  const t = r.toFixed(r < 10 ? 2 : 1);
  return `×${t.includes('.') ? t.replace(/\.?0+$/, '') : t}`;
}

// ----- Operations -----

const reject = (s: S, say: string): LcStep => ({
  state: s,
  marks: [],
  say,
  lines: [],
  vars: {},
  level: 1,
});

/** Marks for one event of the loops. */
function evMarks(frame: Frame, run: RunState, ev: Ev): Mark[] {
  const out: Mark[] = [];
  if (ev.found) out.push(mark(cellId(frame, ev.found), 'found'));
  else if (ev.body) {
    const [s, r, c] = ev.body;
    const pre = slicePrefix(frame, s);
    out.push(mark(cellId(frame, ev.body), 'active'));
    if (frame.rows > 1) out.push(mark(`${pre}grow-${r}`, 'active'));
    out.push(mark(`${pre}gcol-${c}`, 'active'));
  }
  if (ev.probe) out.push(mark(cellId(frame, ev.probe), 'compare'));
  if (ev.row) {
    const { s, r } = ev.row;
    for (const cell of run.lit)
      if (cell[0] === s && (r === null || cell[1] === r))
        out.push(mark(cellId(frame, cell), 'active'));
    out.push(mark(r === null ? `s${s}-title` : `${slicePrefix(frame, s)}grow-${r}`, 'active'));
  }
  return out;
}

const run: Op = {
  label: 'Run',
  arity: 1,
  *run(s, [raw]: Value[], { settings }) {
    const p = patternOf(settings);
    const f = settings.found;
    const n = wholeArg(raw, 1, MAX_N);
    if (n === null) {
      yield reject(s, `Pick n from 1 to ${MAX_N}. Nothing changed.`);
      return s;
    }
    if (n > p.maxN) {
      yield reject(
        s,
        `${cap(p.name)} is drawn for n up to ${p.maxN}: n = ${n} would light ${commas(p.exact(n, f))} cells. Pick a smaller n, or use Grow to count larger n without drawing. Nothing changed.`,
      );
      return s;
    }
    const frame = p.frame(n, f);
    const at = (r: RunState): S => ({ run: r, grow: null });
    let st: RunState = { n, lit: [], count: 0, phase: 'run', found: null };
    yield {
      state: at(st),
      marks: [],
      say: `Run ${p.name} for n = ${n}. ${frame.describe} A cell lights each time the highlighted line runs; count starts at 0.`,
      lines: ['init'],
      vars: { n, count: 0 },
      level: 2,
    };
    for (const ev of p.walk(n, f)) {
      if (ev.body) st = { ...st, lit: [...st.lit, ev.body], count: st.count + 1 };
      if (ev.found) st = { ...st, found: ev.found };
      yield {
        state: at(st),
        marks: evMarks(frame, st, ev),
        say: ev.say(),
        lines: ev.lines,
        vars: { n, ...ev.v },
        level: ev.level,
      };
    }

    const count = st.count;
    const exact = p.exact(n, f);
    const early = st.found !== null;
    st = { ...st, phase: 'counted' };
    yield {
      state: at(st),
      marks: [mark('f-count', 'active')],
      say: early
        ? `The loop returned early, after ${plural(count, 'comparison')}: count = ${count}.`
        : `The loops are done: the highlighted line ran ${plural(count, 'time')}. return ${count}.`,
      lines: [early ? 'found' : 'ret'],
      vars: { n, count },
      level: 2,
    };

    st = { ...st, phase: 'formula' };
    const same = exact === count;
    yield {
      state: at(st),
      marks: [mark('f-formula', 'active'), mark('f-plug', same ? 'found' : 'error')],
      say: `Now count on paper. ${p.why(f)} For n = ${n}: T(${n}) = ${plugText(p, n, f)}${same ? ', the same as the run.' : `, but the run counted ${count}.`}`,
      lines: p.counted,
      vars: { n, count, 'T(n)': formulaText(p, f) },
      level: 2,
    };

    st = { ...st, phase: 'bigO' };
    const order = p.order(f);
    const ex = p.expand(f);
    yield {
      state: at(st),
      marks: [mark('f-bigo', 'found')],
      say: `${ex ? `T(n) ${relation(ex)}. ` : ''}${p.drop(f)} So the count is ${bigO(order)}.${p.caveat?.(f) ? ` ${p.caveat(f)}` : ''}`,
      lines: p.counted,
      vars: { n, count, 'T(n)': formulaText(p, f), 'Big-O': bigO(order) },
      level: 1,
    };
    return at(st);
  },
};

/** What the growth test concludes, from the counts it saw. */
function verdict(order: Order, counts: number[]): string {
  const last = counts.length > 1 ? ratioText(counts.at(-2)!, counts.at(-1)!) : '';
  if (order === '1')
    return `The count stayed at ${commas(counts.at(-1)!)}: n does not change it. That is ${bigO(order)}.`;
  if (order === 'log n')
    return `The counts went ${and(counts.map(commas))}: each doubling of n adds about 1. That is ${bigO(order)}.`;
  if (order === '√n')
    return `Each doubling of n multiplies the count by about √2 ≈ 1.4, though the floor makes the steps uneven (${and(counts.map(commas))}). That is ${bigO(order)}.`;
  return `Each time n doubles, the count ${DOUBLING[order]} (${last} the last time). That is ${bigO(order)}.`;
}

const grow: Op = {
  label: 'Grow',
  arity: 1,
  *run(s, [raw]: Value[], { settings }) {
    const p = patternOf(settings);
    const f = settings.found;
    const n = wholeArg(raw, 1, MAX_N);
    if (n === null) {
      yield reject(s, `Pick n from 1 to ${MAX_N} to start from. Nothing changed.`);
      return s;
    }
    const sizes = Array.from({ length: GROW_SIZES }, (_, k) => n * 2 ** k);
    const at = (g: GrowState): S => ({ run: null, grow: g });
    let g: GrowState = { sizes, counts: [], done: false };
    yield {
      state: at(g),
      marks: [],
      say: `Grow: run ${p.name} for n = ${and(sizes.map(String))}, each size double the one before. The loops run without drawing; only the counts are shown.`,
      lines: ['grow.loop'],
      vars: { n },
      level: 2,
    };
    for (let k = 0; k < sizes.length; k++) {
      const m = sizes[k]!;
      const t = countRun(p, m, f);
      const prev = g.counts[k - 1];
      g = { ...g, counts: [...g.counts, t] };
      const ratio = prev === undefined ? null : ratioText(prev, t);
      yield {
        state: at(g),
        marks: [
          mark(`g-bar-${k}`, 'active'),
          ...(ratio === null ? [] : [mark(`g-ratio-${k}`, 'active')]),
        ],
        say:
          ratio === null
            ? `n = ${m}: the highlighted line runs ${plural(t, 'time')}.`
            : `n = ${m}: ${plural(t, 'time')}, ${ratio} the count for n = ${sizes[k - 1]}.`,
        lines: ratio === null ? ['grow.run'] : ['grow.run', 'grow.ratio'],
        vars: ratio === null ? { n: m, count: t } : { n: m, count: t, ratio },
        level: 2,
      };
    }
    g = { ...g, done: true };
    const order = p.order(f);
    yield {
      state: at(g),
      marks: [mark('f-bigo', 'found')],
      say: verdict(order, g.counts),
      lines: ['grow.read'],
      vars: { n, 'each doubling': DOUBLING[order], 'Big-O': bigO(order) },
      level: 1,
    };
    return at(g);
  },
};

export const ops: Record<string, Op> = { run, grow };

export function pseudocode(settings: LcSettings): PseudoBlock[] {
  return [
    { op: 'run', lines: patternOf(settings).lines },
    {
      op: 'grow',
      lines: [
        L('grow.sig', 0, 'grow(n)', 'To see how the count grows with n:'),
        L('grow.loop', 1, 'for m = n, 2n, 4n, 8n', 'try four sizes, each double the one before;'),
        L('grow.run', 2, 'T[m] = count of the loops for m', 'run the loops and count the line,'),
        L('grow.ratio', 2, 'ratio = T[m] / T[m / 2]', 'and divide by the count for half the size.'),
        L(
          'grow.read',
          1,
          'match the ratios: 2 → n, 4 → n², 8 → n³',
          'A ratio near 2 means linear, near 4 quadratic, near 8 cubic.',
        ),
      ],
    },
  ];
}

export function initialSay(_state: S, settings: LcSettings): string {
  const p = patternOf(settings);
  return `${cap(p.name)}. Type n and press Run: a cell lights each time the highlighted line runs, and at the end the count is checked against a formula. Pick other loops under Options.`;
}

export function describe(state: S, settings: LcSettings = defaults): string {
  const p = patternOf(settings);
  const f = settings.found;
  if (state.grow) {
    const g = state.grow;
    const counts = g.counts.map((t, k) => `n = ${g.sizes[k]}: ${commas(t)}`).join('; ');
    return `Counts for ${p.name}${counts ? `, ${counts}` : ''}.${g.done ? ` ${bigO(p.order(f))}.` : ''}`;
  }
  if (state.run) {
    const r = state.run;
    const frame = p.frame(r.n, f);
    const cells = frame.slices * frame.rows * frame.cols;
    const formula = r.phase === 'formula' || r.phase === 'bigO' ? ` T(n) = ${p.formula(f)}.` : '';
    const order = r.phase === 'bigO' ? ` ${bigO(p.order(f))}.` : '';
    return `${cap(p.name)} for n = ${r.n}: ${r.count} of ${cells} cells lit, count = ${r.count}.${formula}${order}`;
  }
  const code = p.card.map((id) => p.lines.find((l) => l.id === id)!.text).join('; ');
  return `${cap(p.name)}: ${code}. Not run yet.`;
}
