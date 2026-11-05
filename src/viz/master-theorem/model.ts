import type { OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { L, mark, plural } from '../_recursion/kit';

export const LIMITS = { a: [1, 16], b: [2, 8], d: [0, 3], k: [-2, 2] } as const;

/** T(n) = a·T(n/b) + f(n) with f(n) = n^d lg^k n. */
export interface Rec {
  a: number;
  b: number;
  d: number;
  k: number;
}

/** Which part of the tree does most of the work. */
export type Kind = 'leaves' | 'equal' | 'root' | 'gap';

export interface CheckRow {
  m: number;
  /** T(b^m), exact when f has no log factor. */
  t: string;
  ratio: string;
}

export interface MtState {
  rec: Rec | null;
  /** Deepest tree level drawn so far (-1: none). */
  depth: number;
  /** Show the summary rows (all levels, leaves). */
  summary: boolean;
  /** Show the per-level growth comparison. */
  compared: boolean;
  result: { kind: Kind; answer: string } | null;
  check: CheckRow[] | null;
}

export interface MtSettings {
  [key: string]: Scalar;
  /** clrs: the three cases of CLRS with f(n) = Θ(n^d lg^k n). simple: f(n) = Θ(n^d) only. */
  form: 'clrs' | 'simple';
}

type S = MtState;
type Op = OpSpec<S, MtSettings, undefined>;
type MtStep = Step<S, undefined>;

export const defaults: MtSettings = { form: 'clrs' };

export function init(): S {
  return { rec: null, depth: -1, summary: false, compared: false, result: null, check: null };
}

// ----- Text -----

const SUP: Record<string, string> = {
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
  '-': '⁻',
};
export const sup = (n: number) => [...String(n)].map((c) => SUP[c] ?? c).join('');
const SUB: Record<string, string> = {
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
};
export const sub = (n: number) => [...String(n)].map((c) => SUB[c] ?? c).join('');

/** x^p for a size like "n" or "n/4"; p may be a decimal. */
export function power(x: string, p: number): string {
  if (p === 0) return '1';
  const base = x.includes('/') ? `(${x})` : x;
  if (p === 1) return base;
  return Number.isInteger(p) ? `${base}${sup(p)}` : `${base}^${p}`;
}

/** f at size x: n^d lg^k x, written the way a textbook would. */
export function fText(d: number, k: number, x = 'n'): string {
  const arg = x.includes('/') ? `(${x})` : ` ${x}`;
  const lg = k === 0 ? '' : `lg${Math.abs(k) === 1 ? '' : sup(Math.abs(k))}${arg}`;
  const poly = d === 0 ? '' : power(x, d);
  if (!lg) return poly || '1';
  if (k > 0) return poly ? `${poly} ${lg}` : lg;
  return `${poly || '1'} / ${lg}`;
}

export const recText = (r: Rec) => `T(n) = ${r.a === 1 ? '' : r.a}T(n/${r.b}) + ${fText(r.d, r.k)}`;

/** log_b a, and whether it is a whole number. */
export function critical(r: Rec): { c: number; exact: boolean; text: string } {
  for (let m = 0; m <= 4; m++) {
    if (r.b ** m === r.a) return { c: m, exact: true, text: String(m) };
  }
  const c = Math.log(r.a) / Math.log(r.b);
  return { c, exact: false, text: `log${sub(r.b)} ${r.a} ≈ ${c.toFixed(3)}` };
}

/** n^c written with a rounded exponent when it is not whole. */
function nPow(r: Rec): string {
  const { c, exact } = critical(r);
  return exact ? power('n', c) : `n^${c.toFixed(3)}`;
}

/** The order of growth of n^p lg^q n as text, e.g. "n² lg n", "lg n", "1". */
function growth(poly: string, q: number): string {
  const lg =
    q === 0 ? '' : q > 0 ? `lg${q === 1 ? '' : sup(q)} n` : `1/lg${q === -1 ? '' : sup(-q)} n`;
  if (poly === '1') return lg || '1';
  if (!lg) return poly;
  return q > 0 ? `${poly} ${lg}` : `${poly}/lg${q === -1 ? '' : sup(-q)} n`;
}

/** Which case applies and what it gives. */
export function classify(r: Rec): { kind: Kind; answer: string } {
  const { c } = critical(r);
  const eq = Math.abs(r.b ** r.d - r.a) < 1e-9;
  if (!eq && r.d < c) return { kind: 'leaves', answer: `Θ(${nPow(r)})` };
  if (!eq) return { kind: 'root', answer: `Θ(${growth(power('n', r.d), r.k)})` };
  if (r.k >= 0) return { kind: 'equal', answer: `Θ(${growth(nPow(r), r.k + 1)})` };
  // The gap between cases 2 and 3. The extended theorem still answers it.
  const answer = r.k === -1 ? `Θ(${growth(nPow(r), 0)} lg lg n)` : `Θ(${nPow(r)})`;
  return { kind: 'gap', answer: answer.replace('Θ(1 lg lg n)', 'Θ(lg lg n)') };
}

export const caseNumber = (kind: Kind) =>
  kind === 'leaves' ? '1' : kind === 'equal' ? '2' : kind === 'root' ? '3' : 'none';

/** a^i / b^(d i) as a reduced fraction, e.g. "9/4", "1", "1/2". */
export function levelFactor(r: Rec, i: number): string {
  const num = r.a ** i;
  const den = r.b ** (r.d * i);
  const g = gcd(num, den);
  return den / g === 1 ? String(num / g) : `${num / g}/${den / g}`;
}

function gcd(x: number, y: number): number {
  return y === 0 ? x : gcd(y, x % y);
}

/** Size of a call on level i, e.g. "n", "n/4". */
export const sizeAt = (r: Rec, i: number) => (i === 0 ? 'n' : `n/${r.b ** i}`);

/** Work on level i, e.g. "4 × n/2 = 2n" or "2 × (n/2)² = n²/2". */
export function levelNote(r: Rec, i: number): string {
  const calls = r.a ** i;
  const each = fText(r.d, r.k, sizeAt(r, i));
  if (i === 0) return `1 call: ${each}`;
  const factor = levelFactor(r, i);
  const total =
    r.k === 0
      ? scaled(factor, fText(r.d, 0))
      : `${scaled(factor, fText(r.d, 0))} × ${fText(0, r.k, sizeAt(r, i))}`;
  return `${calls} calls × ${each} = ${total}`;
}

function scaled(factor: string, f: string): string {
  if (factor === '1') return f;
  if (f === '1') return factor;
  return `${factor} ${f}`;
}

/** How the work changes from one level to the next. */
export function trend(r: Rec): string {
  const ratio = r.a / r.b ** r.d;
  const f = levelFactor(r, 1);
  if (Math.abs(ratio - 1) < 1e-9)
    return `a / b^d = ${r.a}/${r.b ** r.d} = 1: every level does about the same work.`;
  return ratio > 1
    ? `a / b^d = ${f} > 1: each level does more work than the one above, so the leaves dominate.`
    : `a / b^d = ${f} < 1: each level does less work than the one above, so the root dominates.`;
}

// ----- Reading recurrences -----

const inRange = (v: number, [lo, hi]: readonly [number, number]) =>
  Number.isInteger(v) && v >= lo && v <= hi;

const USAGE =
  'Type a, b and d (and optionally k) for T(n) = aT(n/b) + n^d lg^k n, such as 2 2 1, or the recurrence itself, such as T(n) = 2T(n/2) + n.';

/** Read "a b d [k]" or "T(n) = 2T(n/2) + n lg n" into a recurrence, or say what is wrong. */
export function readRec(raw: Value | undefined): Rec | string {
  const text = String(raw ?? '').trim();
  const nums = text.split(/[\s,]+/).filter(Boolean);
  let a: number;
  let b: number;
  let d: number;
  let k: number;
  if (nums.length >= 3 && nums.length <= 4 && nums.every((x) => /^-?\d+$/.test(x))) {
    [a, b, d, k = 0] = nums.map(Number) as [number, number, number, number?];
  } else {
    const t = text
      .toLowerCase()
      .replace(/log/g, 'lg')
      .replace(/²/g, '^2')
      .replace(/³/g, '^3')
      .replace(/[\s*·]/g, '');
    const m = /^t\(n\)=(\d*)t\(n\/(\d+)\)\+(.+)$/.exec(t);
    if (!m) return USAGE;
    a = m[1] ? Number(m[1]) : 1;
    b = Number(m[2]);
    const f = /^(1|n(?:\^(\d))?)?(?:(\/)?\(?lg(?:\^(\d))?\(?n\)?\)?)?$/.exec(
      m[3]!.replace(/[()]/g, ''),
    );
    if (!f || (!f[1] && f[3]) || m[3] === '') return USAGE;
    d = f[1] === undefined || f[1] === '1' ? 0 : f[2] ? Number(f[2]) : 1;
    const hasLg = /lg/.test(m[3]!);
    k = hasLg ? (f[4] ? Number(f[4]) : 1) * (f[3] ? -1 : 1) : 0;
  }
  if (!inRange(a, LIMITS.a)) return `Keep a from ${LIMITS.a[0]} to ${LIMITS.a[1]}.`;
  if (!inRange(b, LIMITS.b)) return `Keep b from ${LIMITS.b[0]} to ${LIMITS.b[1]}.`;
  if (!inRange(d, LIMITS.d)) return `Keep the power d from ${LIMITS.d[0]} to ${LIMITS.d[1]}.`;
  if (!inRange(k, LIMITS.k)) return `Keep the log power k from ${LIMITS.k[0]} to ${LIMITS.k[1]}.`;
  return { a, b, d, k };
}

// ----- Drawing plan -----

/** How many tree levels below the root get boxes: up to 3, and at most 16 leaves drawn. */
export function drawDepth(a: number): number {
  let d = 0;
  while (d < 3 && a ** (d + 1) <= 16) d++;
  return Math.max(1, d);
}

// ----- Operations -----

function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  if (!s.rec) return { ...more };
  const { a, b, d, k } = s.rec;
  return { a, b, d, k, 'log_b a': Number(critical(s.rec).c.toFixed(3)), ...more };
}

const reject = (s: S, say: string): MtStep => ({
  state: s,
  marks: [],
  say,
  lines: [],
  vars: vars(s),
  level: 1,
});

const solve: Op = {
  label: 'Solve',
  arity: 1,
  *run(s, [raw], { settings }) {
    const rec = readRec(raw);
    if (typeof rec === 'string') {
      yield reject(s, `${rec} Nothing ran.`);
      return s;
    }
    if (settings.form === 'simple' && rec.k !== 0) {
      yield reject(
        s,
        'The simplified form takes f(n) = n^d only, with no log factor. Switch the form to CLRS to use k. Nothing ran.',
      );
      return s;
    }
    const simple = settings.form === 'simple';
    const r = rec;
    const D = drawDepth(r.a);
    let st: S = { ...init(), rec: r, depth: 0 };
    yield {
      state: st,
      marks: [mark('call-r', 'active'), mark('level-0', 'active')],
      say: `${recText(r)}: a problem of size n makes ${plural(r.a, 'call')} on size n/${r.b} and does ${fText(r.d, r.k)} work of its own. That is level 0, the root.`,
      lines: ['solve.sig'],
      vars: vars(st, { level: 0 }),
      level: 2,
    };
    for (let i = 1; i <= D; i++) {
      st = { ...st, depth: i };
      yield {
        state: st,
        marks: [mark(`level-${i}`, 'active')],
        say: `Level ${i}: ${plural(r.a ** i, 'call')}, each on size ${sizeAt(r, i)}. Their work adds up to ${levelNote(r, i).split(' = ').at(-1)}.`,
        lines: ['solve.level'],
        vars: vars(st, { level: i, calls: r.a ** i }),
        level: i === 1 ? 2 : 3,
      };
    }
    st = { ...st, summary: true };
    const { c, exact, text } = critical(r);
    const leaves =
      r.a === 1
        ? 'one leaf'
        : `a^(log_b n) = n^(log_b a) = ${exact ? power('n', c) : `n^${c.toFixed(3)}`} leaves`;
    yield {
      state: st,
      marks: [mark('sum-levels', 'active'), mark('sum-leaves', 'active')],
      say: `The size shrinks by a factor of ${r.b} per level and reaches 1 after log${sub(r.b)} n levels, so the tree has log${sub(r.b)} n + 1 levels and ${leaves}.`,
      lines: ['solve.height'],
      vars: vars(st),
      level: 2,
    };
    st = { ...st, compared: true };
    yield {
      state: st,
      marks: [mark('trend', 'active')],
      say: simple
        ? `Compare a = ${r.a} with b^d = ${r.b ** r.d}. ${trend(r)}`
        : `log_b a = ${text}, against d = ${r.d}${r.k ? ` (with lg${sup(r.k)} n)` : ''}. ${trend(r)}`,
      lines: ['solve.crit'],
      vars: vars(st),
      level: 2,
    };
    const result = classify(r);
    st = { ...st, result };
    yield {
      state: st,
      marks: [mark('result', result.kind === 'gap' ? 'error' : 'found')],
      say: resultSay(r, result, simple),
      lines: [`case.${result.kind}`],
      vars: vars(st, { case: simple ? result.kind : caseNumber(result.kind) }),
      level: 1,
    };
    return st;
  },
};

function resultSay(r: Rec, res: { kind: Kind; answer: string }, simple: boolean): string {
  const name = (n: string) => (simple ? '' : `Case ${n}: `);
  switch (res.kind) {
    case 'leaves':
      return `${name('1')}the leaves dominate. There are n^(log_b a) of them, so T(n) = ${res.answer}.`;
    case 'equal':
      return `${name('2')}every level does the same work, ${fText(r.d, r.k)}, and there are about lg n levels. T(n) = ${res.answer}.`;
    case 'root':
      return `${name('3')}the root dominates: the levels shrink geometrically, so the first one sets the total. ${
        simple ? '' : 'The regularity condition a·f(n/b) ≤ c·f(n) with c < 1 holds. '
      }T(n) = ${res.answer}.`;
    case 'gap':
      return `No case applies: d = log_b a but f has 1/lg${r.k === -1 ? '' : sup(-r.k)} n, which case 2 (k ≥ 0) does not cover and which is too small for case 3. Summing the levels by hand still gives ${res.answer}.`;
  }
}

/** f(n) as a number, for the numeric check. */
const fValue = (r: Rec, n: number) => n ** r.d * Math.log2(n) ** r.k;

/** The answer g(n) as a number, for the ratio T(n)/g(n). */
function gValue(r: Rec, n: number): number {
  const { c } = critical(r);
  const res = classify(r);
  const lg = Math.log2(n);
  switch (res.kind) {
    case 'leaves':
      return n ** c;
    case 'root':
      return fValue(r, n);
    case 'equal':
      return n ** c * lg ** (r.k + 1);
    case 'gap':
      return r.k === -1 ? n ** c * Math.log2(Math.max(lg, 2)) : n ** c;
  }
}

/** T(b^m) for m = 0..rows: exact with big integers when f is a plain power. */
export function unroll(r: Rec, rows: number): { n: number; t: bigint | number }[] {
  const out: { n: number; t: bigint | number }[] = [{ n: 1, t: r.k === 0 ? 1n : 1 }];
  for (let m = 1; m <= rows; m++) {
    const n = r.b ** m;
    const prev = out[m - 1]!.t;
    const t =
      r.k === 0
        ? BigInt(r.a) * (prev as bigint) + BigInt(n) ** BigInt(r.d)
        : r.a * (prev as number) + fValue(r, n);
    out.push({ n, t });
  }
  return out;
}

export const CHECK_ROWS = 10;

/** Rows to show: up to CHECK_ROWS powers of b, with n at most 10^7. */
export function checkRows(r: Rec): number {
  let m = 0;
  while (m < CHECK_ROWS && r.b ** (m + 1) <= 1e7) m++;
  return m;
}

const big = (t: bigint | number) => {
  const s = typeof t === 'bigint' ? t.toString() : t.toPrecision(4);
  if (typeof t === 'bigint' && s.length > 12) return `${s[0]}.${s.slice(1, 3)}e${s.length - 1}`;
  return typeof t === 'bigint' ? s : Number(s).toString();
};

const check: Op = {
  label: 'Check with numbers',
  arity: 0,
  *run(s) {
    const r = s.rec;
    if (!r) {
      yield reject(s, 'Solve a recurrence first, then check it with numbers.');
      return s;
    }
    const res = s.result ?? classify(r);
    const values = unroll(r, checkRows(r));
    let rows: CheckRow[] = [];
    let st: S = { ...s, check: rows };
    yield {
      state: st,
      marks: [],
      say: `Work out T(n) exactly for n = 1, ${r.b}, ${r.b ** 2}, ..., with T(1) = 1, and divide by the answer ${res.answer.replace(/^Θ/, '')}. If the answer is right, the ratio settles to a constant.`,
      lines: ['check.base'],
      vars: vars(st),
      level: 2,
    };
    for (let m = 1; m < values.length; m++) {
      const { n, t } = values[m]!;
      const ratio = Number(t) / gValue(r, n);
      rows = [...rows, { m, t: big(t), ratio: ratio.toFixed(3) }];
      st = { ...s, check: rows };
      yield {
        state: st,
        marks: [mark(`chk-${m}-ratio`, 'active')],
        say: `n = ${n}: T(n) = ${r.a === 1 ? '' : `${r.a} · `}T(${n / r.b}) + f(${n}) = ${big(t)}. Ratio: ${ratio.toFixed(3)}.`,
        lines: ['check.rec', 'check.ratio'],
        vars: vars(st, { n, 'T(n)': big(t), ratio: Number(ratio.toFixed(3)) }),
        level: 3,
      };
    }
    const first = rows[0]?.ratio ?? '';
    const last = rows.at(-1)?.ratio ?? '';
    yield {
      state: st,
      marks: rows.length ? [mark(`chk-${rows.at(-1)!.m}-ratio`, 'found')] : [],
      say: `The ratio goes from ${first} to ${last}. ${
        res.kind === 'equal' || r.k !== 0 || res.kind === 'gap'
          ? 'Log factors settle slowly, but it is heading for a constant.'
          : 'It is levelling off, so T(n) grows like the answer.'
      }`,
      lines: ['check.ratio'],
      vars: vars(st),
      level: 1,
    };
    return st;
  },
};

export const ops = { solve, check };

export function pseudocode(settings: MtSettings): PseudoBlock[] {
  const tree = [
    L(
      'solve.level',
      1,
      'level i: aⁱ calls on size n/bⁱ, work aⁱ · f(n/bⁱ)',
      'Level i has a to the i calls, each on a problem b to the i times smaller.',
    ),
    L(
      'solve.height',
      1,
      'levels: log_b n + 1; leaves: a^(log_b n) = n^(log_b a)',
      'The size reaches 1 after log base b of n levels; count the leaves.',
    ),
  ];
  const solve =
    settings.form === 'simple'
      ? [
          L(
            'solve.sig',
            0,
            'T(n) = a·T(n/b) + Θ(n^d)',
            'Split into a calls of size n/b, plus n^d work.',
          ),
          ...tree,
          L('solve.crit', 1, 'compare a with b^d', 'Does the work grow, stay or shrink per level?'),
          L('case.root', 1, 'if a < b^d: return Θ(n^d)', 'It shrinks: the root dominates.'),
          L(
            'case.equal',
            1,
            'if a = b^d: return Θ(n^d log n)',
            'It stays: n^d on each of log n levels.',
          ),
          L(
            'case.leaves',
            1,
            'if a > b^d: return Θ(n^(log_b a))',
            'It grows: the leaves dominate.',
          ),
        ]
      : [
          L(
            'solve.sig',
            0,
            'T(n) = a·T(n/b) + f(n), f(n) = Θ(n^d lg^k n)',
            'Split into a calls of size n/b, plus f(n) work.',
          ),
          ...tree,
          L('solve.crit', 1, 'c = log_b a', 'Find the power of n that the leaves add up to.'),
          L('case.leaves', 1, 'case 1, d < c: return Θ(n^c)', 'f is smaller: the leaves dominate.'),
          L(
            'case.equal',
            1,
            'case 2, d = c, k ≥ 0: return Θ(n^c lg^(k+1) n)',
            'f matches: every level ties, so multiply by lg n.',
          ),
          L(
            'case.root',
            1,
            'case 3, d > c: return Θ(f(n))',
            'f is bigger (and regular): the root dominates.',
          ),
          L('case.gap', 1, 'else: no case applies', 'Otherwise the theorem says nothing.'),
        ];
  return [
    { op: 'solve', lines: solve },
    {
      op: 'check',
      lines: [
        L('check.base', 0, 'T(1) = 1', 'The smallest problem costs one step.'),
        L(
          'check.rec',
          0,
          'for n = b, b², ...: T(n) = a·T(n/b) + f(n)',
          'Build each T(n) from the one a level down.',
        ),
        L('check.ratio', 1, 'ratio = T(n) / g(n)', 'Divide by the answer; it should level off.'),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'Type a recurrence T(n) = aT(n/b) + f(n), for example 2 2 1 for merge sort, and press Solve. The tree is expanded level by level.';
}

export function initialVars(state: S) {
  return vars(state);
}

export function describe(state: S): string {
  if (!state.rec) return 'No recurrence yet.';
  const parts = [recText(state.rec)];
  if (state.depth >= 0) parts.push(`tree drawn to level ${state.depth}`);
  if (state.result) parts.push(`answer ${state.result.answer}`);
  if (state.check) parts.push(`${state.check.length} numeric checks`);
  return `${parts.join(', ')}.`;
}
