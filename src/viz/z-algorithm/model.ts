/**
 * The Z-algorithm. Z[i] is the length of the longest substring starting at S[i] that is also a
 * prefix of S. The algorithm keeps a box [l, r]: the match with the prefix that reaches furthest
 * right so far, so S[l..r] = S[0..r − l]. For i inside the box, S[i..r] is a copy of
 * S[i − l..r − l], so Z[i] starts at min(Z[i − l], r − i + 1) without a comparison, and only
 * characters past r are ever compared. r never moves left, so there are fewer than 2n
 * comparisons in all.
 *
 * For pattern matching, run it on S = P$T, where $ occurs in neither: Z[i] = m exactly where P
 * occurs in T, at shift i − m − 1. A setting turns the box off (every Z[i] from scratch), to
 * count what the box saves.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import type { Cmp } from '../../layouts/align';
import { andList, L, plural, q } from '../_strings/kit';

export interface ZSettings {
  [key: string]: Scalar;
  /** 'box': the Z-algorithm; 'naive': compare every Z[i] from scratch. */
  method: 'box' | 'naive';
}

export const defaults: ZSettings = { method: 'box' };

/** The longest S the drawing keeps readable on a phone. */
export const MAX_S = 20;

export interface ZRow {
  /** The prefix of S slid under S[i]. */
  i: number;
  cells: (Cmp | null)[];
}

export interface ZState {
  /** T and P when S = P$T; both null for a plain string. */
  text: string | null;
  pattern: string | null;
  s: string;
  /** Z[i], null while unknown; Z[0] stays null (it would be the whole of S). */
  z: (number | null)[];
  /** The next position to fill; 0 before a build; n when done. */
  i: number;
  l: number;
  r: number;
  comparisons: number;
  /** Shifts in T where P occurs, found so far. */
  found: number[];
  /** The last position worked on, drawn as the prefix slid under it. */
  row: ZRow | null;
}

export interface ZExtra {
  /** The S column and prefix position compared now. */
  pair?: { i: number; j: number };
  /** Z[from] is copied to Z[to]: the box's mirror trick. */
  copy?: { from: number; to: number };
  /** Show the box's mirror, S[0..r − l]. */
  mirror?: boolean;
}

export type ZStep = Step<ZState, ZExtra>;
type Op = OpSpec<ZState, ZSettings, ZExtra>;

export const START_TEXT = 'ABAABAABAB';
export const START_PATTERN = 'ABAB';

export const textId = (k: number) => `t-${k}`;
export const zId = (k: number) => `hv-${k}`;
export const rowCell = (j: number) => `rz-${j}`;

function fresh(text: string | null, pattern: string | null, s: string): ZState {
  return {
    text,
    pattern,
    s,
    z: Array.from({ length: s.length }, () => null),
    i: 0,
    l: 0,
    r: 0,
    comparisons: 0,
    found: [],
    row: null,
  };
}

export const init = (): ZState =>
  fresh(START_TEXT, START_PATTERN, `${START_PATTERN}$${START_TEXT}`);

// ----- Input -----

const EXAMPLE = 'ABAABAABAB / ABAB';

export function parseZ(
  raw: Value | undefined,
): { text: string | null; pattern: string | null; s: string } | string {
  const t = String(raw ?? '').trim();
  if (!t) return `Type a text and a pattern, such as ${EXAMPLE}, or one word.`;
  let parts: string[];
  if (t.includes('/')) {
    parts = t.split('/').map((p) => p.trim());
    if (parts.length !== 2)
      return `Use one slash, between the text and the pattern, as in ${EXAMPLE}.`;
    if (!parts[0] || !parts[1]) return `Type a text, a slash and a pattern, as in ${EXAMPLE}.`;
  } else {
    parts = t.split(/\s+/);
    if (parts.length > 2)
      return `That is ${parts.length} words. Type the text, a slash and the pattern, as in ${EXAMPLE}.`;
  }
  for (const p of parts) {
    const bad = /[^A-Za-z0-9]/.exec(p);
    if (bad)
      return `"${p}" has "${bad[0]}" in it. Use letters and digits only; the page puts the $ in.`;
  }
  if (parts.length === 1) {
    const s = parts[0]!;
    if (s.length > MAX_S) return `That word has ${s.length} characters. Keep it to ${MAX_S}.`;
    return { text: null, pattern: null, s };
  }
  const [text, pattern] = parts as [string, string];
  const len = text.length + pattern.length + 1;
  if (len > MAX_S)
    return `P$T would have ${len} characters. Keep the text and the pattern to ${MAX_S - 1} together.`;
  return { text, pattern, s: `${pattern}$${text}` };
}

export function parseInput(token: string): Value | Error {
  const r = parseZ(token);
  if (typeof r === 'string') return new Error(r);
  return r.text === null ? r.s : `${r.text} / ${r.pattern}`;
}

// ----- Running -----

/** Z by its definition, the reference for tests and practice. */
export function refZ(s: string): number[] {
  return [...s].map((_, i) => {
    if (i === 0) return 0;
    let k = 0;
    while (i + k < s.length && s[k] === s[i + k]) k++;
    return k;
  });
}

const isDone = (st: ZState) => st.i >= st.s.length && st.i > 0;

function counters(st: ZState): Record<string, Scalar> {
  const v: Record<string, Scalar> = { comparisons: st.comparisons };
  if (st.pattern !== null) v.found = st.found.length ? st.found.join(', ') : 'none';
  return v;
}

function zText(z: readonly (number | null)[]): string {
  return `[${z.map((v, k) => (k === 0 ? '–' : (v ?? '·'))).join(', ')}]`;
}

class Run {
  st: ZState;
  constructor(s: ZState) {
    this.st = structuredClone(s);
  }
  step(
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    marks: Mark[] = [],
    vars: Record<string, Scalar> = {},
    extra?: ZExtra,
  ): ZStep {
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

const mk = (id: string, role: Mark['role']): Mark => ({ id, role });

function* begin(run: Run, settings: ZSettings): Generator<ZStep, void, void> {
  const again = isDone(run.st) ? 'Start again. ' : '';
  const { text, pattern, s } = run.st;
  run.st = fresh(text, pattern, s);
  run.st.i = 1;
  const what =
    pattern !== null
      ? `S = P$T = ${q(s)}: the pattern, a $ that occurs nowhere else, then the text. Z[i] = ${pattern.length} will mean P starts at S[i].`
      : `S = ${q(s)}.`;
  const how =
    settings.method === 'box'
      ? ' The box [l, r] starts empty. Z[0] is left out: the whole of S matches itself.'
      : ' Without the box, every Z[i] is compared from scratch. Z[0] is left out: the whole of S matches itself.';
  yield run.step(`${again}${what}${how}`, ['init'], 2, [], { i: 1, l: 0, r: 0 });
}

/** One position: Z[run.st.i]. */
function* position(run: Run, settings: ZSettings): Generator<ZStep, void, void> {
  const st = run.st;
  const { s } = st;
  const n = s.length;
  const i = st.i;
  const box = settings.method === 'box';
  const cells: (Cmp | null)[] = Array.from({ length: n - i }, () => null);
  st.row = { i, cells };
  let k = 0;
  if (box && i <= st.r) {
    const mirror = i - st.l;
    const zm = st.z[mirror] ?? 0;
    const room = st.r - i + 1;
    k = Math.min(zm, room);
    for (let j = 0; j < k; j++) cells[j] = 'known';
    st.z[i] = k;
    const why =
      zm < room
        ? `Z[${mirror}] = ${zm} is less than r − i + 1 = ${room}, so Z[${i}] starts at ${k}.`
        : `Z[${mirror}] = ${zm}, but only r − i + 1 = ${room} of that is inside the box, so Z[${i}] starts at ${k}; past r we must compare.`;
    yield run.step(
      `i = ${i} is inside the box [${st.l}, ${st.r}]. S[${st.l}..${st.r}] matches S[0..${st.r - st.l}], so S[${i}..${st.r}] is a copy of S[${mirror}..${st.r - st.l}]. ${why}`,
      ['loop', 'inbox', 'copy'],
      2,
      [mk(zId(mirror), 'compare'), mk(zId(i), 'new')],
      { i, l: st.l, r: st.r, 'Z[i]': k },
      { copy: { from: mirror, to: i }, mirror: true },
    );
  } else {
    st.z[i] = 0;
    yield run.step(
      box
        ? `i = ${i} is past r = ${st.r}, so the box says nothing: start at Z[${i}] = 0 and compare.`
        : `i = ${i}: start at Z[${i}] = 0 and compare S[${i}..] with the prefix.`,
      box ? ['loop', 'inbox', 'zero'] : ['loop', 'zero'],
      2,
      [mk(zId(i), 'new')],
      box ? { i, l: st.l, r: st.r, 'Z[i]': 0 } : { i, 'Z[i]': 0 },
    );
  }
  while (i + k < n) {
    const same = s[k] === s[i + k];
    st.comparisons++;
    cells[k] = same ? 'match' : 'mismatch';
    const head = `Compare S[${i + k}] = ${q(s[i + k]!)} with S[${k}] = ${q(s[k]!)}`;
    if (same) {
      k++;
      st.z[i] = k;
    }
    yield run.step(
      same
        ? `${head}: they match, so Z[${i}] = ${k}.`
        : `${head}: they differ, so Z[${i}] stays ${k}.`,
      same ? ['ext', 'inc'] : ['ext'],
      3,
      [mk(textId(i + (same ? k - 1 : k)), 'compare')],
      box ? { i, l: st.l, r: st.r, 'Z[i]': k } : { i, 'Z[i]': k },
      { pair: { i: i + (same ? k - 1 : k), j: same ? k - 1 : k } },
    );
    if (!same) break;
  }
  const z = k;
  const end = i + z === n && z > 0 ? ` It reaches the end of S.` : '';
  let say = `Z[${i}] = ${z}${z ? `: S[${i}..${i + z - 1}] = ${q(s.slice(i, i + z))} matches the prefix S[0..${z - 1}]` : ': S[' + i + '] does not match S[0]'}.${end}`;
  const marks: Mark[] = [mk(zId(i), 'done')];
  const lines = ['set'];
  if (box && i + z - 1 > st.r) {
    st.l = i;
    st.r = i + z - 1;
    say += ` It reaches past the old r, so the box moves: [l, r] = [${st.l}, ${st.r}].`;
    lines.push('grow');
  }
  if (st.pattern !== null && z === st.pattern.length) {
    const shift = i - z - 1;
    st.found.push(shift);
    say += ` Z[${i}] = m = ${z}, so P occurs in T at shift ${i} − m − 1 = ${shift}.`;
    lines.push('hit');
    marks.push(mk(textId(i), 'found'));
  }
  st.i = i + 1;
  yield run.step(say, lines, 2, marks, box ? { i, l: st.l, r: st.r, 'Z[i]': z } : { i, 'Z[i]': z });
}

function finish(run: Run, settings: ZSettings): ZStep {
  const st = run.st;
  const n = st.s.length;
  const where =
    st.pattern === null
      ? ''
      : st.found.length
        ? ` P occurs at ${st.found.length === 1 ? 'shift' : 'shifts'} ${andList(st.found)}.`
        : ' P does not occur in T: no Z[i] equals m.';
  const bound =
    settings.method === 'box'
      ? ` r only moves right, so the box version always stays under 2n = ${2 * n}.`
      : ` Without the box, a repetitive string can take about n²/2.`;
  return run.step(
    `Done. Z = ${zText(st.z)}.${where} That took ${plural(st.comparisons, 'comparison')}.${bound}`,
    ['ret'],
    1,
    st.found.map((f) => mk(textId(f + (st.pattern?.length ?? 0) + 1), 'found')),
  );
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const p = parseZ(arg);
    if (typeof p === 'string') {
      yield {
        state: s,
        marks: [mk('t-name', 'error')],
        say: `Nothing loaded. ${p}`,
        lines: [],
        level: 1,
        vars: { n: s.s.length },
      };
      return s;
    }
    const next = fresh(p.text, p.pattern, p.s);
    const say =
      p.text === null
        ? `S = ${q(p.s)}, ${plural(p.s.length, 'character')}. Press Build Z to find, for each i, how far S[i..] matches the start of S.`
        : `T = ${q(p.text)} and P = ${q(p.pattern!)}. The page runs the Z-algorithm on S = P$T = ${q(p.s)}, ${plural(p.s.length, 'character')}. Press Build Z.`;
    yield { state: next, marks: [], say, lines: [], level: 1, vars: { n: p.s.length } };
    return next;
  },
};

const build: Op = {
  label: 'Build Z',
  arity: 0,
  *run(s, _a, { settings }) {
    const run = new Run(s);
    if (run.st.i === 0 || isDone(run.st)) yield* begin(run, settings);
    while (run.st.i < run.st.s.length) yield* position(run, settings);
    yield finish(run, settings);
    return run.st;
  },
};

const next: Op = {
  label: 'Next position',
  arity: 0,
  *run(s, _a, { settings }) {
    const run = new Run(s);
    if (run.st.i === 0 || isDone(run.st)) yield* begin(run, settings);
    if (run.st.i < run.st.s.length) yield* position(run, settings);
    if (run.st.i >= run.st.s.length) yield finish(run, settings);
    return run.st;
  },
};

export const ops: Record<string, Op> = { load, build, next };

export function pseudocode(settings: ZSettings): PseudoBlock[] {
  const lines =
    settings.method === 'box'
      ? [
          L('sig', 0, 'zArray(S)', 'To find Z[i] for every i:'),
          L('init', 1, 'l = 0; r = 0', 'Start with an empty box.'),
          L('loop', 1, 'for i = 1 to n − 1', 'For each position after the first,'),
          L('inbox', 2, 'if i ≤ r', 'if i is inside the box,'),
          L(
            'copy',
            3,
            'Z[i] = min(r − i + 1, Z[i − l])',
            'copy the value from the mirror position, cut off at r.',
          ),
          L('zero', 2, 'else Z[i] = 0', 'Otherwise start from nothing.'),
          L(
            'ext',
            2,
            'while i + Z[i] < n and S[Z[i]] == S[i + Z[i]]',
            'While the next character matches the prefix,',
          ),
          L('inc', 3, 'Z[i] = Z[i] + 1', 'the match grows by one.'),
          L('set', 2, '// Z[i] is final', 'Z[i] is done.'),
          L(
            'grow',
            2,
            'if i + Z[i] − 1 > r: l = i; r = i + Z[i] − 1',
            'If this match reaches further right, it becomes the box.',
          ),
          L(
            'hit',
            2,
            'if Z[i] == m: report shift i − m − 1',
            'With S = P$T, Z[i] = m means a match.',
          ),
          L('ret', 1, 'return Z', 'Hand back Z.'),
        ]
      : [
          L('sig', 0, 'zNaive(S)', 'To find Z[i] for every i, the slow way:'),
          L('init', 1, '// no box', 'Keep nothing between positions.'),
          L('loop', 1, 'for i = 1 to n − 1', 'For each position after the first,'),
          L('zero', 2, 'Z[i] = 0', 'start from nothing,'),
          L(
            'ext',
            2,
            'while i + Z[i] < n and S[Z[i]] == S[i + Z[i]]',
            'and while the next character matches the prefix,',
          ),
          L('inc', 3, 'Z[i] = Z[i] + 1', 'the match grows by one.'),
          L('set', 2, '// Z[i] is final', 'Z[i] is done.'),
          L(
            'hit',
            2,
            'if Z[i] == m: report shift i − m − 1',
            'With S = P$T, Z[i] = m means a match.',
          ),
          L('ret', 1, 'return Z', 'Hand back Z.'),
        ];
  return [
    { op: 'build', lines },
    { op: 'next', lines },
  ];
}

export function initialSay(st: ZState): string {
  return `T = ${q(st.text ?? '')} and P = ${q(st.pattern ?? '')}, so S = P$T = ${q(st.s)}. Z[i] is how far S[i..] matches the start of S. Press Build Z, or Load your own text and pattern.`;
}

export const initialVars = (st: ZState) => ({ n: st.s.length });

export function describe(st: ZState): string {
  const head =
    st.pattern !== null
      ? `S = P$T = ${st.s}, with P = ${st.pattern} and T = ${st.text}.`
      : `S = ${st.s}.`;
  if (st.i === 0) return `${head} Z is not built yet.`;
  const z = ` Z = ${st.z.map((v, k) => (k === 0 ? '–' : (v ?? 'unknown'))).join(' ')}.`;
  const box = ` Box [${st.l}, ${st.r}].`;
  const found =
    st.pattern !== null ? ` Found at ${st.found.length ? andList(st.found) : 'no shift yet'}.` : '';
  const where = isDone(st) ? ' Done.' : ` Next i = ${st.i}.`;
  return head + z + box + found + where;
}
