/**
 * The Burrows-Wheeler transform. Write every rotation of S = text + $ (the end marker sorts
 * before every letter), sort them, and read the last column L. Equal letters bunch up in L,
 * which is what makes it compress well after move-to-front and run lengths. The sorted order is
 * the suffix array of S.
 *
 * The inverse needs only L. F, the first column, is L sorted. The k-th a in L and the k-th a in
 * F are the same character of the text (LF-mapping), and L[r] is the character just before F[r].
 * So start at the row that begins with $, and walk: prepend L[r], go to the row where that same
 * character sits in F. A setting drops the $ and keeps the original row's index instead, as the
 * original 1994 paper did.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { L, plural, q } from '../_strings/kit';

export interface BwtSettings {
  [key: string]: Scalar;
  /** 'sentinel': append $; 'index': no $, keep the row of the original. */
  end: 'sentinel' | 'index';
}

export const defaults: BwtSettings = { end: 'sentinel' };

export const MAX_N = 10;
export const END = '$';

export interface Inverse {
  l: string;
  f: string;
  /** LF[r]: the row of F holding the same character as L[r]. */
  lf: number[];
  /** Show the occurrence numbers. */
  ranked: boolean;
  /** Show F. */
  sorted: boolean;
  /** The current row, null before the walk. */
  row: number | null;
  /** The text recovered so far (its last characters). */
  out: string;
  /** Rows visited, in order. */
  path: number[];
  done: boolean;
}

export interface BwtState {
  text: string;
  /** The string rotated: text + $, or the text. */
  s: string;
  phase: 'none' | 'rotations' | 'sorted' | 'inverse';
  /** Rotation starts, in the order drawn. */
  order: number[];
  /** L read so far. */
  l: string;
  /** The row of the original string after sorting (index mode). */
  index: number | null;
  /** The whole transform once finished, kept for the inverse. */
  bwt: { l: string; index: number | null } | null;
  inv: Inverse | null;
}

export interface BwtExtra {
  /** LF arrow from L[from] to F[to]. */
  lf?: { from: number; to: number };
}

export type BwtStep = Step<BwtState, BwtExtra>;
type Op = OpSpec<BwtState, BwtSettings, BwtExtra>;

export const START = 'banana';

export const rowId = (k: number) => `rot-${k}`;
export const cellId = (k: number, j: number) => `rot-${k}-${j}`;
export const lOutId = (i: number) => `lo-${i}`;
export const fId = (r: number) => `f-${r}`;
export const lId = (r: number) => `l-${r}`;
export const outId = (j: number) => `out-${j}`;

const working = (text: string, settings: BwtSettings) =>
  settings.end === 'sentinel' ? text + END : text;

function fresh(text: string, settings: BwtSettings): BwtState {
  return {
    text,
    s: working(text, settings),
    phase: 'none',
    order: [0],
    l: '',
    index: null,
    bwt: null,
    inv: null,
  };
}

export const init = (settings: BwtSettings): BwtState => fresh(START, settings);

export const rotation = (s: string, k: number) => s.slice(k) + s.slice(0, k);

/** Rotation starts in sorted order (ties by start, so the sort is stable). */
export function sortedRotations(s: string): number[] {
  return [...s]
    .map((_, k) => k)
    .sort((a, b) => {
      const x = rotation(s, a);
      const y = rotation(s, b);
      return x < y ? -1 : x > y ? 1 : a - b;
    });
}

/** The transform by its definition: the reference for tests and the inverse's input. */
export function bwtOf(text: string, settings: BwtSettings): { l: string; index: number | null } {
  const s = working(text, settings);
  const order = sortedRotations(s);
  const l = order.map((k) => s[(k + s.length - 1) % s.length]).join('');
  return { l, index: settings.end === 'index' ? order.indexOf(0) : null };
}

/** Maximal runs of equal characters. */
export const runs = (l: string) => [...l].filter((c, i) => i === 0 || c !== l[i - 1]).length;

/** Occurrence number of each character among the equal ones before it, 1-based. */
export function ranks(x: string): number[] {
  const seen = new Map<string, number>();
  return [...x].map((c) => {
    const k = (seen.get(c) ?? 0) + 1;
    seen.set(c, k);
    return k;
  });
}

export function lfOf(l: string): { f: string; lf: number[] } {
  const f = [...l].sort().join('');
  const rl = ranks(l);
  const lf = [...l].map((c, r) => f.indexOf(c) + rl[r]! - 1);
  return { f, lf };
}

// ----- Input -----

export function parseWord(raw: Value | undefined): string | { error: string } {
  const t = String(raw ?? '').trim();
  if (!t) return { error: 'Type a word, such as banana.' };
  if (/\s/.test(t)) return { error: 'Type one word, with no spaces.' };
  const bad = /[^A-Za-z0-9]/.exec(t);
  if (bad)
    return {
      error: `"${t}" has "${bad[0]}" in it. Use letters and digits only; the page adds the $.`,
    };
  if (t.length > MAX_N)
    return { error: `That word has ${t.length} characters. Keep it to ${MAX_N}.` };
  return t;
}

export function parseInput(token: string): Value | Error {
  const r = parseWord(token);
  return typeof r === 'string' ? r : new Error(r.error);
}

// ----- Operations -----

const mk = (id: string, role: Mark['role']): Mark => ({ id, role });

function vars(st: BwtState, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  const v: Record<string, Scalar> = { n: st.s.length, ...more };
  if (st.l) v.L = st.l;
  if (st.bwt) v['runs in L'] = runs(st.bwt.l);
  if (st.index !== null) v.index = st.index;
  return v;
}

const snap = (st: BwtState) => structuredClone(st);

function step(
  st: BwtState,
  say: string,
  lines: string[],
  level: 1 | 2 | 3,
  marks: Mark[] = [],
  more: Record<string, Scalar> = {},
  extra?: BwtExtra,
): BwtStep {
  return {
    state: snap(st),
    marks,
    say,
    lines,
    level,
    vars: vars(st, more),
    ...(extra ? { extra } : {}),
  };
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg], { settings }) {
    const w = parseWord(arg);
    if (typeof w !== 'string') {
      yield step(s, `Nothing loaded. ${w.error}`, [], 1, [mk('t-name', 'error')]);
      return s;
    }
    const st = fresh(w, settings);
    yield step(
      st,
      `The word is ${q(w)}, ${plural(w.length, 'character')}. Press Transform to sort its rotations and read the last column.`,
      [],
      1,
    );
    return st;
  },
};

function* transformSteps(st: BwtState, settings: BwtSettings): Generator<BwtStep, void, void> {
  const sentinel = settings.end === 'sentinel';
  const n = st.s.length;
  Object.assign(st, fresh(st.text, settings), { phase: 'rotations' });
  yield step(
    st,
    sentinel
      ? `Append ${q(END)}, a marker that occurs nowhere else and sorts before every letter: S = ${q(st.s)}. Row 0 is S itself.`
      : `No end marker: rotate S = ${q(st.s)} itself, and remember which row it lands in. Row 0 is S.`,
    ['app', 'rot'],
    2,
    [mk(rowId(0), 'new')],
  );
  for (let k = 1; k < n; k++) {
    st.order.push(k);
    yield step(
      st,
      `Rotation ${k}: move the first character to the end. ${q(rotation(st.s, k))}.`,
      ['rot'],
      3,
      [mk(rowId(k), 'new')],
    );
  }
  yield step(
    st,
    `All ${n} rotations of ${q(st.s)}. Every column holds the same characters; only the order differs.`,
    ['rot'],
    2,
  );
  st.order = sortedRotations(st.s);
  st.phase = 'sorted';
  if (!sentinel) st.index = st.order.indexOf(0);
  const marker = sentinel
    ? ` ${q(END)} sorts first, so the row that starts with it is row 0. Because ${q(END)} occurs once, sorting the rotations is the same as sorting the suffixes: the starts, ${st.order.join(' ')}, are the suffix array of S.`
    : ` The original word is now row ${st.index}. Keep that number: without it the transform cannot be undone.`;
  yield step(
    st,
    `Sort the rotations.${marker}`,
    ['sort'],
    2,
    st.order.map((k) => mk(cellId(k, 0), 'visit')),
    {},
  );
  for (let r = 0; r < n; r++) {
    const k = st.order[r]!;
    const c = st.s[(k + n - 1) % n]!;
    st.l += c;
    yield step(
      st,
      `Row ${r} ends with ${q(c)}: L[${r}] = ${q(c)}. It is the character just before this rotation's first one in S.`,
      ['last'],
      3,
      [mk(cellId(k, n - 1), 'active'), mk(lOutId(r), 'new')],
    );
  }
  st.bwt = { l: st.l, index: st.index };
}

const transform: Op = {
  label: 'Transform',
  arity: 0,
  *run(s, _a, { settings }) {
    const st = snap(s);
    yield* transformSteps(st, settings);
    const r = runs(st.l);
    const tail = st.index !== null ? ` with index ${st.index}` : '';
    yield step(
      st,
      `Done. BWT(${q(st.text)}) = ${q(st.l)}${tail}. It has ${plural(r, 'run')} of equal characters in ${st.l.length}, where ${q(st.s)} has ${runs(st.s)}. Move-to-front and run-length coding turn runs like these into small numbers that compress well.`,
      ['ret'],
      1,
      [...st.l].map((_, i) => mk(lOutId(i), 'done')),
    );
    return st;
  },
};

const invert: Op = {
  label: 'Invert',
  arity: 0,
  *run(s, _a, { settings }) {
    const st = snap(s);
    const sentinel = settings.end === 'sentinel';
    const { l, index } = st.bwt ?? bwtOf(st.text, settings);
    const { f, lf } = lfOf(l);
    const n = l.length;
    st.phase = 'inverse';
    st.bwt = { l, index };
    st.index = index;
    st.l = l;
    const inv: Inverse = {
      l,
      f,
      lf,
      ranked: false,
      sorted: false,
      row: null,
      out: '',
      path: [],
      done: false,
    };
    st.inv = inv;
    yield step(
      st,
      `Start from L = ${q(l)}${index !== null ? ` and index ${index}` : ''} alone. Nothing else about the text is kept.`,
      ['i.sig'],
      2,
      [...l].map((_, r) => mk(lId(r), 'active')),
    );
    inv.sorted = true;
    yield step(
      st,
      `F, the first column, holds the same characters as L, sorted: F = ${q(f)}. Every column of the sorted rotations holds the same characters.`,
      ['i.f'],
      2,
      [...f].map((_, r) => mk(fId(r), 'new')),
    );
    inv.ranked = true;
    yield step(
      st,
      `Number the copies of each character in order, in L and in F. The k-th ${q(f[f.length - 1]!)} in L and the k-th ${q(f[f.length - 1]!)} in F are the same character of the text: rows that start with the same letter are sorted by what follows it, and so are the rows that end with it.`,
      ['i.rank'],
      2,
    );
    let row = sentinel ? 0 : index!;
    inv.row = row;
    inv.path = [row];
    yield step(
      st,
      sentinel
        ? `Row 0 starts with ${q(END)}, so it is ${q(END)} followed by the whole text, and L[0] is the text's last character. Start there.`
        : `Row ${row} is the original word, so L[${row}] is its last character. Start there.`,
      ['i.start'],
      2,
      [mk(fId(row), 'active'), mk(lId(row), 'active')],
    );
    const count = sentinel ? n - 1 : n;
    for (let k = 0; k < count; k++) {
      const c = l[row]!;
      const rk = ranks(l)[row]!;
      const to = lf[row]!;
      inv.out = c + inv.out;
      const goes =
        k < count - 1
          ? ` That ${q(c)} is copy ${rk} in L, so it is copy ${rk} in F too: row ${to}. Go there.`
          : '';
      yield step(
        st,
        `L[${row}] = ${q(c)} comes just before F[${row}] in the text. Put it in front: ${q(inv.out)}.${goes}`,
        ['i.loop', 'i.out', 'i.lf'],
        2,
        [
          mk(lId(row), 'active'),
          mk(outId(count - 1 - k), 'new'),
          ...(k < count - 1 ? [mk(fId(to), 'compare')] : []),
        ],
        { row },
        k < count - 1 ? { lf: { from: row, to } } : undefined,
      );
      row = to;
      if (k < count - 1) {
        inv.row = row;
        inv.path.push(row);
      }
    }
    inv.done = true;
    inv.row = null;
    yield step(
      st,
      `Done. The walk spelled the text backwards, one LF step per character: ${q(inv.out)}.${sentinel ? ` The next step would land on ${q(END)}, the end.` : ''} Each step is a count, so the inverse is O(n) once F is known.`,
      ['i.ret'],
      1,
      [...inv.out].map((_, j) => mk(outId(j), 'found')),
    );
    return st;
  },
};

export const ops: Record<string, Op> = { load, transform, invert };

export function pseudocode(settings: BwtSettings): PseudoBlock[] {
  const sentinel = settings.end === 'sentinel';
  const forward = [
    L('sig', 0, sentinel ? 'bwt(text)' : 'bwt(text) → (L, index)', 'To transform a word:'),
    sentinel
      ? L('app', 1, `S = text + ${END}`, 'Add an end marker that sorts first.')
      : L('app', 1, 'S = text', 'Use the word as it is.'),
    L('rot', 1, 'rows = [S[k..] + S[..k] for k = 0 to n − 1]', 'Write down every rotation.'),
    L('sort', 1, 'sort rows', 'Sort them.'),
    L('last', 1, 'L = last character of each row', 'Read the last column.'),
    L(
      'ret',
      1,
      sentinel ? 'return L' : 'return L, the row of S',
      sentinel ? 'L is the transform.' : 'Keep L and the row the word ended up in.',
    ),
  ];
  const inverse = [
    L('i.sig', 0, sentinel ? 'inverse(L)' : 'inverse(L, index)', 'To undo the transform:'),
    L('i.f', 1, 'F = sorted(L)', 'The first column is L sorted.'),
    L(
      'i.rank',
      1,
      'LF[r] = row in F of the same copy of L[r]',
      'Match the k-th copy of each character in L with the k-th in F.',
    ),
    L(
      'i.start',
      1,
      sentinel ? `r = 0  // the row starting with ${END}` : 'r = index',
      sentinel
        ? 'Start at the row that begins with the end marker.'
        : 'Start at the row of the original word.',
    ),
    L(
      'i.loop',
      1,
      sentinel ? 'repeat n − 1 times' : 'repeat n times',
      'For each character of the text, from the last:',
    ),
    L('i.out', 2, 'text = L[r] + text', 'put L[r] in front,'),
    L('i.lf', 2, 'r = LF[r]', 'and follow it to its row in F.'),
    L('i.ret', 1, 'return text', 'The text is back.'),
  ];
  return [
    { op: 'transform', lines: forward },
    { op: 'invert', lines: inverse },
  ];
}

export function initialSay(st: BwtState): string {
  return `The word is ${q(st.text)}. Press Transform to write its rotations, sort them and read the last column; then Invert to get the word back from that column alone.`;
}

export const initialVars = (st: BwtState) => ({ n: st.s.length });

export function describe(st: BwtState): string {
  const head = `Word ${st.text}, rotated as ${st.s}.`;
  if (st.phase === 'inverse' && st.inv) {
    const inv = st.inv;
    return `${head} Inverting L = ${inv.l}.${inv.sorted ? ` F = ${inv.f}.` : ''}${inv.row !== null ? ` At row ${inv.row}.` : ''} Recovered so far: ${inv.out || 'nothing'}.`;
  }
  if (st.phase === 'none') return `${head} No rotations yet.`;
  const rows = st.order.map((k) => rotation(st.s, k)).join(', ');
  const which = st.phase === 'sorted' ? 'Sorted rotations' : 'Rotations';
  return `${head} ${which}: ${rows}.${st.l ? ` L so far: ${st.l}.` : ''}${st.index !== null ? ` Index ${st.index}.` : ''}`;
}
