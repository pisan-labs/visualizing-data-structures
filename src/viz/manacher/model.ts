/**
 * Manacher's algorithm: the longest palindromic substring in O(n). Put a separator between the
 * characters and at both ends (abba becomes #a#b#b#a#), so every palindrome, odd or even, has a
 * center cell. P[i] is the radius of the longest palindrome centered at T[i]; it is also that
 * palindrome's length in the original string.
 *
 * The algorithm keeps the palindrome that reaches furthest right, centered at C and ending at
 * R = C + P[C]. For i < R, the mirror i' = 2C − i has the same surroundings up to R, so P[i]
 * starts at min(P[i'], R − i) without a comparison. Only cells past R are compared, and R only
 * moves right, so the work is linear. A setting turns the mirror off (expand every center from
 * scratch) to count what it saves.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { L, plural, q } from '../_strings/kit';

export interface ManacherSettings {
  [key: string]: Scalar;
  /** 'mirror': Manacher; 'naive': expand around every center from scratch. */
  method: 'mirror' | 'naive';
}

export const defaults: ManacherSettings = { method: 'mirror' };

/** The longest word: its transformed string has 2n + 1 = 21 cells. */
export const MAX_N = 10;
export const SEP = '#';

export interface Best {
  center: number;
  radius: number;
}

export interface ManacherState {
  s: string;
  t: string;
  p: (number | null)[];
  /** The next center; -1 before a build; t.length when done. */
  i: number;
  c: number;
  r: number;
  comparisons: number;
  best: Best | null;
  /** The center worked on last. */
  last: number | null;
}

export interface ManacherExtra {
  /** The two cells compared now. */
  pair?: [number, number];
  /** P[from] copied to P[to]. */
  copy?: { from: number; to: number };
}

export type ManacherStep = Step<ManacherState, ManacherExtra>;
type Op = OpSpec<ManacherState, ManacherSettings, ManacherExtra>;

export const START = 'abacabad';

export const transform = (s: string) => `${SEP}${[...s].join(SEP)}${SEP}`;
export const textId = (k: number) => `t-${k}`;
export const pId = (k: number) => `hv-${k}`;

function fresh(s: string): ManacherState {
  const t = transform(s);
  return {
    s,
    t,
    p: Array.from({ length: t.length }, () => null),
    i: -1,
    c: 0,
    r: 0,
    comparisons: 0,
    best: null,
    last: null,
  };
}

export const init = (): ManacherState => fresh(START);

/** The palindrome of the original string a center and radius stand for. */
export function palindromeOf(s: string, b: Best | null): string {
  if (!b) return '';
  return s.slice((b.center - b.radius) / 2, (b.center - b.radius) / 2 + b.radius);
}

// ----- Input -----

export function parseWord(raw: Value | undefined): string | { error: string } {
  const t = String(raw ?? '').trim();
  if (!t) return { error: 'Type a word, such as abacabad.' };
  if (/\s/.test(t)) return { error: 'Type one word, with no spaces.' };
  const bad = /[^A-Za-z0-9]/.exec(t);
  if (bad) return { error: `"${t}" has "${bad[0]}" in it. Use letters and digits only.` };
  if (t.length > MAX_N)
    return {
      error: `That word has ${t.length} characters. Keep it to ${MAX_N}: with the separators it becomes ${2 * t.length + 1} cells.`,
    };
  return t;
}

export function parseInput(token: string): Value | Error {
  const r = parseWord(token);
  return typeof r === 'string' ? r : new Error(r.error);
}

// ----- Reference -----

/** P by expanding around every center of the transformed string. */
export function refRadii(s: string): number[] {
  const t = transform(s);
  return [...t].map((_, i) => {
    let k = 0;
    while (i - k - 1 >= 0 && i + k + 1 < t.length && t[i - k - 1] === t[i + k + 1]) k++;
    return k;
  });
}

/** The longest palindromic substring, leftmost among the longest. */
export function refLongest(s: string): string {
  let best = '';
  for (let a = 0; a < s.length; a++)
    for (let b = a + 1; b <= s.length; b++) {
      const w = s.slice(a, b);
      if (w.length > best.length && w === [...w].reverse().join('')) best = w;
    }
  return best;
}

// ----- Running -----

const started = (st: ManacherState) => st.i >= 0;
const isDone = (st: ManacherState) => st.i >= st.t.length;
const mk = (id: string, role: Mark['role']): Mark => ({ id, role });

function counters(st: ManacherState): Record<string, Scalar> {
  return { comparisons: st.comparisons, longest: st.best ? palindromeOf(st.s, st.best) : '' };
}

class Run {
  st: ManacherState;
  constructor(s: ManacherState) {
    this.st = structuredClone(s);
  }
  step(
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    marks: Mark[] = [],
    vars: Record<string, Scalar> = {},
    extra?: ManacherExtra,
  ): ManacherStep {
    return {
      state: structuredClone(this.st),
      marks,
      say,
      lines,
      level,
      vars: { ...vars, ...counters(this.st) },
      ...(extra ? { extra } : {}),
    };
  }
}

function* begin(run: Run, settings: ManacherSettings): Generator<ManacherStep, void, void> {
  const again = isDone(run.st) ? 'Start again. ' : '';
  run.st = fresh(run.st.s);
  run.st.i = 0;
  const how =
    settings.method === 'mirror'
      ? ' C and R mark the palindrome that reaches furthest right; none yet.'
      : ' Without the mirror, every center expands from scratch.';
  yield run.step(
    `${again}Put ${q(SEP)} between the characters and at both ends: ${q(run.st.s)} becomes T = ${q(run.st.t)}, ${plural(run.st.t.length, 'cell')}. Now every palindrome, odd or even, has a center cell.${how}`,
    ['tr', 'init'],
    2,
    [],
    settings.method === 'mirror' ? { i: 0, C: 0, R: 0 } : { i: 0 },
  );
}

function* center(run: Run, settings: ManacherSettings): Generator<ManacherStep, void, void> {
  const st = run.st;
  const t = st.t;
  const N = t.length;
  const i = st.i;
  const mirror = settings.method === 'mirror';
  st.last = i;
  const vars = (k: number) =>
    mirror ? { i, C: st.c, R: st.r, 'P[i]': k } : ({ i, 'P[i]': k } as Record<string, Scalar>);
  let k = 0;
  if (mirror && i < st.r) {
    const j = 2 * st.c - i;
    const pj = st.p[j] ?? 0;
    const room = st.r - i;
    k = Math.min(pj, room);
    st.p[i] = k;
    const why =
      pj < room
        ? `P[${j}] = ${pj} fits inside, so P[${i}] = ${k} for sure.`
        : `P[${j}] = ${pj}, but only R − i = ${room} of that is inside, so P[${i}] starts at ${k} and must be checked past R.`;
    yield run.step(
      `i = ${i} is inside the palindrome around C = ${st.c}, which reaches R = ${st.r}. Its mirror is i' = 2C − i = ${j}, and the palindrome makes both sides look the same. ${why}`,
      ['loop', 'in', 'copy'],
      2,
      [mk(pId(j), 'compare'), mk(pId(i), 'new')],
      vars(k),
      { copy: { from: j, to: i } },
    );
  } else {
    st.p[i] = 0;
    yield run.step(
      mirror
        ? `i = ${i} is not inside any palindrome found so far (R = ${st.r}), so start at P[${i}] = 0 and expand.`
        : `i = ${i}: start at P[${i}] = 0 and expand.`,
      mirror ? ['loop', 'in', 'zero'] : ['loop', 'zero'],
      2,
      [mk(pId(i), 'new')],
      vars(0),
    );
  }
  let edge = '';
  for (;;) {
    const a = i - k - 1;
    const b = i + k + 1;
    if (a < 0 || b >= N) {
      edge = ` It reaches the ${a < 0 ? 'start' : 'end'} of T, so it cannot grow.`;
      break;
    }
    const same = t[a] === t[b];
    st.comparisons++;
    if (same) {
      k++;
      st.p[i] = k;
    }
    yield run.step(
      same
        ? `Compare T[${a}] = ${q(t[a]!)} with T[${b}] = ${q(t[b]!)}: they match, so P[${i}] = ${k}.`
        : `Compare T[${a}] = ${q(t[a]!)} with T[${b}] = ${q(t[b]!)}: they differ, so P[${i}] stays ${k}.`,
      same ? ['ext', 'inc'] : ['ext'],
      3,
      [mk(textId(a), same ? 'compare' : 'error'), mk(textId(b), same ? 'compare' : 'error')],
      vars(k),
      { pair: [a, b] },
    );
    if (!same) break;
  }
  const pal = t.slice(i - k, i + k + 1).replaceAll(SEP, '');
  let say = `P[${i}] = ${k}${k ? `: T[${i - k}..${i + k}] is a palindrome, ${q(pal)} in the word` : ''}.${edge}`;
  const lines = ['set'];
  if (mirror && i + k > st.r) {
    st.c = i;
    st.r = i + k;
    say += ` It reaches past the old R, so C = ${i} and R = ${st.r}.`;
    lines.push('grow');
  }
  if (!st.best || k > st.best.radius) {
    st.best = { center: i, radius: k };
    if (k > 0) {
      say += ` The longest so far: ${q(pal)}, length ${k}.`;
      lines.push('best');
    }
  }
  st.i = i + 1;
  yield run.step(say, lines, 2, [mk(pId(i), 'done')], vars(k));
}

function finish(run: Run, settings: ManacherSettings): ManacherStep {
  const st = run.st;
  const n = st.s.length;
  const N = st.t.length;
  const best = palindromeOf(st.s, st.best);
  const b = st.best!;
  const bound =
    settings.method === 'mirror'
      ? ` R only moves right, so Manacher stays under 2N = ${2 * N}.`
      : ' Without the mirror, a word like aaaa takes about N²/4.';
  return run.step(
    `Done. The longest palindrome is ${q(best)}, length ${b.radius}, centered at T[${b.center}]: the largest value in P. That took ${plural(st.comparisons, 'comparison')} for a word of ${plural(n, 'character')}.${bound}`,
    ['ret'],
    1,
    [mk(pId(b.center), 'found')],
  );
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const w = parseWord(arg);
    if (typeof w !== 'string') {
      yield {
        state: s,
        marks: [mk('t-name', 'error')],
        say: `Nothing loaded. ${w.error}`,
        lines: [],
        level: 1,
        vars: { n: s.s.length },
      };
      return s;
    }
    const next = fresh(w);
    yield {
      state: next,
      marks: [],
      say: `The word is ${q(w)}, ${plural(w.length, 'character')}. With separators it becomes T = ${q(next.t)}. Press Build P to find the longest palindrome.`,
      lines: [],
      level: 1,
      vars: { n: w.length },
    };
    return next;
  },
};

const build: Op = {
  label: 'Build P',
  arity: 0,
  *run(s, _a, { settings }) {
    const run = new Run(s);
    if (!started(run.st) || isDone(run.st)) yield* begin(run, settings);
    while (!isDone(run.st)) yield* center(run, settings);
    yield finish(run, settings);
    return run.st;
  },
};

const next: Op = {
  label: 'Next center',
  arity: 0,
  *run(s, _a, { settings }) {
    const run = new Run(s);
    if (!started(run.st) || isDone(run.st)) yield* begin(run, settings);
    if (!isDone(run.st)) yield* center(run, settings);
    if (isDone(run.st)) yield finish(run, settings);
    return run.st;
  },
};

export const ops: Record<string, Op> = { load, build, next };

export function pseudocode(settings: ManacherSettings): PseudoBlock[] {
  const lines =
    settings.method === 'mirror'
      ? [
          L('sig', 0, 'manacher(s)', 'To find the longest palindrome in s:'),
          L(
            'tr',
            1,
            `T = ${SEP} + join(s, ${SEP}) + ${SEP}`,
            'Put a separator between the characters and at both ends.',
          ),
          L('init', 1, 'C = 0; R = 0', 'No palindrome reaches anywhere yet.'),
          L('loop', 1, 'for i = 0 to N − 1', 'For each center,'),
          L('in', 2, 'if i < R', 'if it lies inside the palindrome that reaches furthest,'),
          L(
            'copy',
            3,
            'P[i] = min(R − i, P[2C − i])',
            'copy the radius of its mirror, cut off at R.',
          ),
          L('zero', 2, 'else P[i] = 0', 'Otherwise start from nothing.'),
          L(
            'ext',
            2,
            'while T[i − P[i] − 1] == T[i + P[i] + 1]',
            'While the cells just outside match (and are inside T),',
          ),
          L('inc', 3, 'P[i] = P[i] + 1', 'the palindrome grows by one on each side.'),
          L('set', 2, '// P[i] is final', 'P[i] is done.'),
          L(
            'grow',
            2,
            'if i + P[i] > R: C = i; R = i + P[i]',
            'If it reaches further right, it becomes the one to mirror.',
          ),
          L('best', 2, 'if P[i] > P[best]: best = i', 'Keep the largest radius.'),
          L(
            'ret',
            1,
            'return the P[best] characters of s around best',
            'The largest radius is the longest palindrome.',
          ),
        ]
      : [
          L('sig', 0, 'expandAll(s)', 'To find the longest palindrome in s, the slow way:'),
          L(
            'tr',
            1,
            `T = ${SEP} + join(s, ${SEP}) + ${SEP}`,
            'Put a separator between the characters and at both ends.',
          ),
          L('init', 1, '// no mirror', 'Keep nothing between centers.'),
          L('loop', 1, 'for i = 0 to N − 1', 'For each center,'),
          L('zero', 2, 'P[i] = 0', 'start from nothing,'),
          L(
            'ext',
            2,
            'while T[i − P[i] − 1] == T[i + P[i] + 1]',
            'and while the cells just outside match (and are inside T),',
          ),
          L('inc', 3, 'P[i] = P[i] + 1', 'grow by one on each side.'),
          L('set', 2, '// P[i] is final', 'P[i] is done.'),
          L('best', 2, 'if P[i] > P[best]: best = i', 'Keep the largest radius.'),
          L(
            'ret',
            1,
            'return the P[best] characters of s around best',
            'The largest radius is the longest palindrome.',
          ),
        ];
  return [
    { op: 'build', lines },
    { op: 'next', lines },
  ];
}

export function initialSay(st: ManacherState): string {
  return `The word is ${q(st.s)}. Manacher finds its longest palindrome in linear time, reusing what the palindromes found so far say. Press Build P, or Load your own word.`;
}

export const initialVars = (st: ManacherState) => ({ n: st.s.length });

export function describe(st: ManacherState): string {
  const head = `Word ${st.s}. T = ${st.t}.`;
  if (!started(st)) return `${head} P is not built yet.`;
  const p = ` P = ${st.p.map((v) => v ?? 'unknown').join(' ')}.`;
  const cr = ` C = ${st.c}, R = ${st.r}.`;
  const best = st.best ? ` Longest so far: ${palindromeOf(st.s, st.best) || 'none'}.` : '';
  const where = isDone(st) ? ' Done.' : ` Next center ${st.i}.`;
  return head + p + cr + best + where;
}
