/**
 * Boyer-Moore: compare right to left, and after a mismatch slide by a table built from the
 * pattern alone. Two variants:
 * - 'horspool' (the default): Horspool's simplification. One table, shift[c] = how far P[0..m-2]
 *   is from having c at its end. Whatever happened, slide by shift[T[s + m - 1]], the text
 *   character under P's last position.
 * - 'full': the bad-character rule (the last place each character occurs in P: slide so it lines
 *   up with the character that failed) and the good-suffix rule (slide so the part that matched
 *   lines up with another copy of itself, not preceded by the character that just failed, or
 *   with a prefix of P). The bigger shift wins, and the drawing says which rule chose it.
 */
import type { Mark, OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import {
  foundText,
  initState,
  L,
  loadOp,
  mark,
  plural,
  q as quote,
  Run,
  searchOps,
  textId,
  type Engine,
  type Gen,
  type MatchExtra,
  type MatchState,
  type MatchStep,
  type Shift,
} from '../_strings/kit';

export type Rules = 'horspool' | 'full';

export interface BmSettings {
  [key: string]: Scalar;
  rules: Rules;
}

export const defaults: BmSettings = { rules: 'horspool' };

export interface BmPre {
  /** Table columns: characters in the order they first appear in P (Horspool: in P[0..m-2]). */
  keys: string[];
  /** One value per key: Horspool's shift, or the last index of the character in P. */
  bad: (number | null)[];
  /** The value for every other character: m (Horspool) or -1 (last occurrence). */
  other: number;
  /** Full rules: the good-suffix shift for a mismatch at P[j], and after a full match. */
  gs?: (number | null)[];
  gsMatch?: number | null;
}

type S = MatchState<BmPre>;
type R = Run<BmPre>;
type Op = OpSpec<S, BmSettings, MatchExtra>;

export const init = (): S => initState<BmPre>();

/** Shape ids of the two tables' value cells (src/layouts/table.ts, with a prefix each). */
export const badCell = (k: number) => `bc-cell-0-${k}`;
export const gsCell = (j: number) => `gs-cell-0-${j}`;

/** The column of character c in the bad-character table (the last column is "any other"). */
export function badColumn(pre: BmPre, c: string): number {
  const k = pre.keys.indexOf(c);
  return k < 0 ? pre.keys.length : k;
}

/** The table's value for character c. */
export function badValue(pre: BmPre, c: string): number {
  const k = pre.keys.indexOf(c);
  return k < 0 ? pre.other : pre.bad[k]!;
}

/** Horspool's table for P, as plain numbers: shift[c] for the characters of P[0..m-2]. */
export function horspoolTable(p: string): { keys: string[]; shift: number[] } {
  const m = p.length;
  const keys: string[] = [];
  const shift: number[] = [];
  for (let j = 0; j < m - 1; j++) {
    let k = keys.indexOf(p[j]!);
    if (k < 0) {
      k = keys.length;
      keys.push(p[j]!);
      shift.push(m);
    }
    shift[k] = m - 1 - j;
  }
  return { keys, shift };
}

/**
 * The strong good-suffix shift for a mismatch at P[j], j < m - 1: the smallest k such that P
 * slid k places agrees with the matched suffix P[j+1..m-1] wherever they overlap, and does not
 * put the character P[j] (which just failed) under the text character again. A mismatch at the
 * last position has no good suffix: 1.
 */
export function goodSuffix(p: string, j: number): number {
  const m = p.length;
  if (j >= m - 1) return 1;
  for (let k = 1; k < m; k++) {
    let ok = true;
    for (let t = j + 1; t < m && ok; t++) if (t - k >= 0 && p[t - k] !== p[t]) ok = false;
    if (ok && j - k >= 0 && p[j - k] === p[j]) ok = false;
    if (ok) return k;
  }
  return m;
}

/** After a full match: slide so the longest proper prefix that is also a suffix lines up. */
export function matchShift(p: string): number {
  const m = p.length;
  for (let k = 1; k < m; k++) if (p.slice(k) === p.slice(0, m - k)) return k;
  return m;
}

/** Why goodSuffix(p, j) is what it is, as a clause. */
function gsReason(p: string, j: number, k: number): string {
  const m = p.length;
  const u = p.slice(j + 1);
  if (j >= m - 1) return 'nothing matched yet, so there is no good suffix: 1';
  if (k <= j)
    return `${quote(u)} also occurs at P[${j + 1 - k}..${m - 1 - k}], after ${quote(p[j - k]!)} instead of ${quote(p[j]!)}: ${k}`;
  if (k < m)
    return `no other copy of ${quote(u)} will do, but P starts with ${quote(p.slice(0, m - k))}, the end of ${quote(u)}: ${k}`;
  return `no other copy of ${quote(u)} will do, and no prefix of P matches its end: all ${m}`;
}

// ----- Building the tables -----

function* buildTables(run: R, settings: BmSettings): Gen<BmPre> {
  const P = run.pattern;
  const m = P.length;
  const full = settings.rules === 'full';
  const row = (j: number) => `r0-${j}`;
  // Columns: characters in the order they first appear.
  const keys: string[] = [];
  for (const c of full ? P : P.slice(0, m - 1)) if (!keys.includes(c)) keys.push(c);
  const pre: BmPre = {
    keys,
    bad: keys.map(() => null),
    other: full ? -1 : m,
    ...(full ? { gs: Array.from({ length: m }, () => null), gsMatch: null } : {}),
  };
  run.pre = pre;
  const vars = (more: Record<string, Scalar> = {}): Record<string, Scalar> => ({ m, ...more });
  if (!full) {
    yield run.step(
      `Horspool's table first. shift[c] is how far P slides when the text character under its last position is c: the distance from the end of P to the last c in P[0..${m - 2}]. Any other character, including one found only at the end of P, gets m = ${m}: P slides right past it.`,
      ['t.sig', 't.all'],
      2,
      [mark(badCell(keys.length), 'new')],
      vars(),
    );
    for (let j = 0; j < m - 1; j++) {
      const c = P[j]!;
      const k = keys.indexOf(c);
      const before = pre.bad[k];
      pre.bad[k] = m - 1 - j;
      yield run.step(
        `P[${j}] = ${quote(c)}: shift[${quote(c)}] = m − 1 − ${j} = ${m - 1 - j}${before !== null ? `, replacing ${before}: the later ${quote(c)} is closer to the end` : ''}.`,
        ['t.loop', 't.set'],
        3,
        [mark(row(j), 'active'), mark(badCell(k), 'new')],
        vars({ j }),
      );
    }
    const last = P[m - 1]!;
    yield run.step(
      `The table is ready.${keys.includes(last) ? '' : ` ${quote(last)} occurs only at the end of P, so it gets ${m}, like any character that is not in P.`} The search uses it whenever P slides.`,
      ['t.ret'],
      2,
      [...keys.map((_, k) => mark(badCell(k), 'done')), mark(badCell(keys.length), 'done')],
      vars(),
    );
    return;
  }
  yield run.step(
    `Two tables first. last[c] is the last place c occurs in P, or −1. gs[j] is how far the good-suffix rule slides P after a mismatch at P[j].`,
    ['t.sig', 't.all'],
    2,
    [mark(badCell(keys.length), 'new')],
    vars(),
  );
  for (let j = 0; j < m; j++) {
    const k = keys.indexOf(P[j]!);
    pre.bad[k] = j;
    yield run.step(
      `P[${j}] = ${quote(P[j]!)}: last[${quote(P[j]!)}] = ${j}.`,
      ['t.loop', 't.set'],
      3,
      [mark(row(j), 'active'), mark(badCell(k), 'new')],
      vars({ j }),
    );
  }
  for (let j = m - 1; j >= 0; j--) {
    const k = goodSuffix(P, j);
    pre.gs![j] = k;
    const suffix = Array.from({ length: m - 1 - j }, (_, t) => mark(row(j + 1 + t), 'found'));
    yield run.step(
      `gs[${j}]: if P[${j}] = ${quote(P[j]!)} fails ${j === m - 1 ? 'first' : `after ${quote(P.slice(j + 1))} matched`}, ${gsReason(P, j, k)}.`,
      ['g.loop', 'g.set'],
      j === m - 1 ? 3 : 2,
      [mark(row(j), 'active'), ...suffix, mark(gsCell(j), 'new')],
      vars({ j }),
    );
  }
  const k = matchShift(P);
  pre.gsMatch = k;
  yield run.step(
    `After a full match, slide so the longest proper prefix of P that is also a suffix lines up with the end of the match: ${k < m ? `${quote(P.slice(0, m - k))}, so ${k}` : `there is none, so all ${m}`}. Both tables are ready.`,
    ['g.match'],
    2,
    [mark(gsCell(m), 'new')],
    vars(),
  );
}

// ----- Matching -----

function vars(run: R, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return { ...more, ...run.counters(), alignments: run.search?.attempts.length ?? 0 };
}

function* start(run: R): Gen<BmPre> {
  const { n, m } = run;
  const again = run.restarted ? 'Start a new search. ' : '';
  run.begin();
  if (m > n) {
    yield run.step(
      `${again}P has ${plural(m, 'character')} and T only ${n}, so P fits at no shift and the loop does not run.`,
      ['init', 'loop'],
      2,
      [],
      vars(run),
    );
    return;
  }
  yield run.step(
    `${again}Now search. At each shift, compare from the right end of P, P[${m - 1}], back towards P[0].`,
    ['pre', 'init'],
    2,
    [],
    vars(run, { s: 0 }),
  );
}

const past = (run: R, s: number) =>
  s > run.n - run.m ? ` That is past n − m = ${run.n - run.m}, so the search is over.` : '';

function* attempt(run: R, settings: BmSettings): Gen<BmPre> {
  const { m, text, pattern } = run;
  const pre = run.pre!;
  const live = run.enter();
  const s = live.s;
  let j = m - 1;
  for (; j >= 0; j--) {
    const i = s + j;
    const same = run.compare(j);
    yield run.step(
      same
        ? `s = ${s}: T[${i}] = ${quote(text[i]!)} matches P[${j}].`
        : `s = ${s}: T[${i}] = ${quote(text[i]!)} does not match P[${j}] = ${quote(pattern[j]!)}.`,
      j === m - 1
        ? ['loop', 'start', 'cmp', ...(same ? ['dec'] : [])]
        : same
          ? ['cmp', 'dec']
          : ['cmp'],
      3,
      [mark(textId(i), 'compare')],
      vars(run, { s, j }),
      { pair: { i, j } },
    );
    if (!same) break;
  }
  const matched = m - 1 - j;
  const head =
    j < 0
      ? `All ${m} characters match: P occurs at shift ${s}.`
      : matched
        ? `Shift ${s}: ${quote(pattern.slice(j + 1))} matched from the right, then T[${s + j}] ≠ P[${j}].`
        : `Shift ${s}: T[${s + m - 1}] ≠ P[${m - 1}] at once.`;

  if (settings.rules === 'horspool') {
    const c = text[s + m - 1]!;
    const k = badValue(pre, c);
    const col = badColumn(pre, c);
    const next = { s: s + k, known: 0, by: { amount: k } };
    run.close(j < 0 ? 'match' : 'mismatch', next);
    const why = pre.keys.includes(c)
      ? `shift[${quote(c)}] = ${k}: slide ${plural(k, 'place')} so the last ${quote(c)} in P[0..${m - 2}] lines up with it`
      : `${quote(c)} is not in P[0..${m - 2}], so shift[${quote(c)}] = ${m}: slide P right past it`;
    yield run.step(
      `${head} Horspool looks at the text character under P's last position, T[${s + m - 1}] = ${quote(c)}. ${why}, to s = ${s + k}.${past(run, s + k)}`,
      j < 0 ? ['check', 'slide'] : ['check', 'slide'],
      j < 0 ? 1 : 2,
      [
        mark(textId(s + m - 1), 'active'),
        mark(badCell(col), 'active'),
        ...(j < 0 ? [mark(`found-${s}`, 'found')] : []),
      ],
      vars(run, { s, j }),
    );
    return;
  }

  // Full Boyer-Moore.
  if (j < 0) {
    const k = pre.gsMatch!;
    run.close('match', { s: s + k, known: 0, by: { amount: k, rule: 'gs' } });
    yield run.step(
      `${head} The bad-character rule has nothing to say after a match. The good-suffix rule slides ${plural(k, 'place')}${k < m ? `, so the prefix ${quote(pattern.slice(0, m - k))} lines up with the end of the match` : ', all the way past it'}: s = ${s + k}.${past(run, s + k)}`,
      ['check', 'add'],
      1,
      [mark(`found-${s}`, 'found'), mark(gsCell(m), 'active')],
      vars(run, { s, j }),
    );
    return;
  }
  const c = text[s + j]!;
  const last = badValue(pre, c);
  const bc = j - last;
  const gs = pre.gs![j]!;
  const k = Math.max(bc, gs);
  const rule: Shift['rule'] = bc === gs ? 'tie' : bc > gs ? 'bc' : 'gs';
  run.close('mismatch', { s: s + k, known: 0, by: { amount: k, rule } });
  const bad =
    last < 0
      ? `${quote(c)} is not in P, so the bad-character rule slides P past it: j − last[${quote(c)}] = ${j} − (−1) = ${bc}`
      : last > j
        ? `the last ${quote(c)} in P is at ${last}, right of P[${j}], so the bad-character rule says ${j} − ${last} = −${-bc}, no help`
        : `the last ${quote(c)} in P is at ${last}, so the bad-character rule says ${j} − ${last} = ${bc}`;
  const verdict =
    rule === 'tie'
      ? `Both say ${k}`
      : rule === 'bc'
        ? `The bad-character rule wins: ${k}`
        : `The good-suffix rule wins: ${k}`;
  yield run.step(
    `${head} ${bad[0]!.toUpperCase()}${bad.slice(1)}. The good-suffix rule says gs[${j}] = ${gs}. ${verdict}, so s = ${s + k}.${past(run, s + k)}`,
    ['check', 'else', 'slide'],
    2,
    [
      mark(textId(s + j), 'active'),
      mark(badCell(badColumn(pre, c)), rule === 'gs' ? 'compare' : 'active'),
      mark(gsCell(j), rule === 'bc' ? 'compare' : 'active'),
    ],
    vars(run, { s, j }),
  );
}

function finish(run: R): MatchStep<BmPre> {
  const s = run.s;
  const { n, m } = run;
  const where = s.found.length
    ? `P occurs at ${s.found.length === 1 ? 'shift' : 'shifts'} ${foundText(s.found)}`
    : 'P does not occur in T';
  const tried = s.attempts.length;
  const work =
    m > n
      ? 'No shift fits, so there was nothing to compare.'
      : `${plural(s.comparisons, 'comparison')} in ${plural(tried, 'alignment')}, out of ${n - m + 1} possible shifts${s.comparisons < n ? `: fewer comparisons than the text has characters` : ''}.`;
  return run.step(
    `Done. ${where}. ${work}`,
    ['ret'],
    1,
    s.found.map((f) => mark(`found-${f}`, 'found')),
    { ...run.counters(), alignments: tried },
  );
}

const engine: Engine<BmPre, BmSettings> = { prepare: buildTables, start, attempt, finish };

/** "Build the tables" on their own. */
const tables: Op = {
  label: 'Build the tables',
  arity: 0,
  *run(s, _args, { settings }) {
    if (s.pre) {
      const marks: Mark[] = s.pre.keys.map((_, k) => mark(badCell(k), 'done'));
      yield {
        state: s,
        marks,
        say: `The ${settings.rules === 'full' ? 'tables are' : 'table is'} already built for P = ${quote(s.pattern)}. Press Search to use ${settings.rules === 'full' ? 'them' : 'it'}.`,
        lines: settings.rules === 'full' ? ['g.match'] : ['t.ret'],
        level: 1,
      };
      return s;
    }
    const run = new Run(s);
    yield* buildTables(run, settings);
    return run.snapshot();
  },
};

export const ops: Record<string, Op> = {
  load: loadOp<BmPre, BmSettings>({
    keepPre: () => 'P has not changed, so its tables stay: they depend on P alone.',
  }),
  ...searchOps(engine),
  tables,
};

// ----- Pseudocode -----

function tableLines(rules: Rules): PseudoLine[] {
  if (rules === 'horspool')
    return [
      L('t.sig', 0, 'shiftTable(P)', "To build Horspool's table:"),
      L('t.all', 1, 'shift[c] = m for every c', 'Any character not in P lets P slide past it.'),
      L('t.loop', 1, 'for j = 0 to m − 2', 'For each character of P but the last,'),
      L('t.set', 2, 'shift[P[j]] = m − 1 − j', 'write down how far it is from the end.'),
      L('t.ret', 1, 'return shift', 'Later characters overwrite earlier ones.'),
    ];
  return [
    L('t.sig', 0, 'lastOccurrence(P)', 'To find the last place of each character:'),
    L('t.all', 1, 'last[c] = −1 for every c', 'Not in P yet.'),
    L('t.loop', 1, 'for j = 0 to m − 1', 'For each character of P, left to right,'),
    L('t.set', 2, 'last[P[j]] = j', 'remember its place; later ones overwrite.'),
    L('g.sig', 0, 'goodSuffix(P)', 'To build the good-suffix table:'),
    L('g.loop', 1, 'for j = m − 1 down to 0', 'For a mismatch at each position,'),
    L(
      'g.set',
      2,
      'gs[j] = least k ≥ 1: P slid k agrees with P[j+1..m−1], with no P[j] under T again',
      'find the smallest slide that lines P up with the part that matched again, without the character that just failed.',
    ),
    L(
      'g.match',
      1,
      'gs[m] = m − (longest proper prefix of P that is also a suffix)',
      'After a full match, line up the longest border with the end of the match.',
    ),
  ];
}

function searchLines(rules: Rules): PseudoLine[] {
  const horspool = rules === 'horspool';
  return [
    L(
      'sig',
      0,
      horspool ? 'horspool(T, P)' : 'boyerMoore(T, P)',
      'To find every shift where P occurs in T:',
    ),
    L(
      'pre',
      1,
      horspool ? 'shift = shiftTable(P)' : 'last = lastOccurrence(P); gs = goodSuffix(P)',
      horspool ? 'Build the table from P, as above.' : 'Build both tables from P, as above.',
    ),
    L('init', 1, 'found = []; s = 0', 'Start at shift 0.'),
    L('loop', 1, 'while s ≤ n − m', 'While P fits under T,'),
    L('start', 2, 'j = m − 1', "start at P's last character"),
    L('cmp', 2, 'while j ≥ 0 and T[s + j] == P[j]', 'and move left while the characters agree.'),
    L('dec', 3, 'j = j − 1', 'One more character matches.'),
    ...(horspool
      ? [
          L('check', 2, 'if j < 0: append s to found', 'If they all agree, P occurs at shift s.'),
          L(
            'slide',
            2,
            's = s + shift[T[s + m − 1]]',
            "Either way, slide by the table's entry for the text character under P's last position.",
          ),
        ]
      : [
          L('check', 2, 'if j < 0', 'If they all agree,'),
          L(
            'add',
            3,
            'append s to found; s = s + gs[m]',
            'P occurs at shift s; slide by the full-match shift.',
          ),
          L('else', 2, 'else', 'Otherwise,'),
          L(
            'slide',
            3,
            's = s + max(gs[j], j − last[T[s + j]])',
            'slide by whichever rule allows more.',
          ),
        ]),
    L('ret', 1, 'return found', 'Hand back every shift found.'),
  ];
}

export function pseudocode(settings: BmSettings): PseudoBlock[] {
  return [
    { op: 'search', lines: [...tableLines(settings.rules), ...searchLines(settings.rules)] },
    { op: 'tables', lines: tableLines(settings.rules) },
  ];
}

export function initialSay(state: S, settings: BmSettings): string {
  const how =
    settings.rules === 'full'
      ? 'builds two tables from P, then compares right to left and slides by whichever rule allows more'
      : "builds Horspool's table from P, then compares right to left and slides by the table";
  return `T = ${quote(state.text)} and P = ${quote(state.pattern)}. Boyer-Moore ${how}. Press Search, or Load your own text and pattern.`;
}

export function initialVars(state: S) {
  return { n: state.text.length, m: state.pattern.length };
}
