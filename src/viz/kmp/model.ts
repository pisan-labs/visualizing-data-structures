/**
 * Knuth-Morris-Pratt. First build π from the pattern alone: π[j] is the length of the longest
 * proper prefix of P[0..j] that is also a suffix of it (its longest border). Building it is
 * KMP run on P against itself, and the drawing shows it that way: P on top and a copy of P
 * slid under it. Then match: compare at shift s from P[q] on, where q characters are already
 * known to match. After a mismatch at P[q], slide P so its longest border lines up with the
 * end of what matched: s grows by q - π[q - 1], and q becomes π[q - 1]. The text pointer
 * i = s + q never moves back.
 *
 * CLRS calls the table the prefix function π; a setting calls it the failure function f
 * instead. The numbers are the same.
 */
import type { OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { AlignRow, Cmp } from '../../layouts/align';
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
  selfTopId,
  textId,
  type Engine,
  type Gen,
  type MatchExtra,
  type MatchState,
  type MatchStep,
} from '../_strings/kit';

export interface KmpSettings {
  [key: string]: Scalar;
  /** What to call the table: CLRS's prefix function π, or the failure function f. */
  name: 'pi' | 'failure';
}

export const defaults: KmpSettings = { name: 'pi' };

export interface KmpPre {
  /** π[j], or null while it is being built. */
  pi: (number | null)[];
  /** Comparisons made while building it. */
  comparisons: number;
}

type S = MatchState<KmpPre>;
type R = Run<KmpPre>;

/** A row of the copy of P while the table is built; its cells change as it is compared. */
interface SelfRow extends AlignRow {
  cells: (Cmp | null)[];
}
type Op = OpSpec<S, KmpSettings, MatchExtra>;

export const init = (): S => initState<KmpPre>();

/** The table's symbol and its name, for narration and code. */
export function names(settings: KmpSettings) {
  return settings.name === 'failure'
    ? { sym: 'f', title: 'failure function', fn: 'failureFunction' }
    : { sym: 'π', title: 'prefix function', fn: 'computePrefix' };
}

/** Shape id of table cell j (src/layouts/table.ts names cells cell-<row>-<col>). */
export const piCell = (j: number) => `cell-0-${j}`;

/** The table as numbers, once it is complete. */
export const piOf = (pre: KmpPre | null): number[] => (pre?.pi ?? []).map((v) => v ?? 0);

const tableText = (pi: readonly (number | null)[]) => `[${pi.map((v) => v ?? '·').join(', ')}]`;

// ----- Building the table: P against a shifted copy of itself -----

function* buildTable(run: R, settings: KmpSettings): Gen<KmpPre> {
  const { sym, title } = names(settings);
  const P = run.pattern;
  const m = P.length;
  const pi: (number | null)[] = Array.from({ length: m }, (_, j) => (j === 0 ? 0 : null));
  const pre: KmpPre = { pi, comparisons: 0 };
  run.pre = pre;
  const rows: SelfRow[] = [];
  const vars = (i: number, q: number): Record<string, Scalar> => ({
    i,
    q,
    building: pre.comparisons,
  });
  /** The copy of P under P, at shift i - q, showing P[0..q]. */
  let row: SelfRow | null = null;
  const place = (i: number, q: number, by?: number) => {
    const shift = i - q;
    if (row && row.shift === shift) {
      row.to = q;
      row.label = `q=${q}`;
      return;
    }
    row = {
      id: `s${rows.length}`,
      shift,
      from: 0,
      to: q,
      cells: Array.from({ length: m }, (_, j): Cmp | null => (j < q ? 'known' : null)),
      label: `q=${q}`,
      ...(by ? { by: `+${by}` } : {}),
    };
    rows.push(row);
  };
  const extra = (i: number, j?: number): MatchExtra => ({
    self: {
      rows: rows.map((r) => ({ ...r, cells: [...r.cells] })),
      pointer: i,
      ...(j !== undefined && row ? { pair: { i, row: String(row.id), j } } : {}),
    },
  });
  const self = (r: AlignRow | null, j: number) => `r${r?.id}-${j}`;

  yield run.step(
    `First KMP builds ${sym}, the ${title}, from P alone. ${sym}[j] is the length of the longest proper prefix of P[0..j] that is also a suffix of it. ${sym}[0] = 0: one character has no shorter prefix. Building ${sym} is KMP on P against itself: a copy of P slides along under P.`,
    ['p.sig', 'p.init'],
    2,
    [mark(piCell(0), 'new')],
    vars(1, 0),
    { self: { rows: [], pointer: 0 } },
  );

  let q = 0;
  for (let i = 1; i < m; i++) {
    place(i, q, i === 1 ? undefined : 1);
    for (;;) {
      const same = P[q] === P[i];
      pre.comparisons++;
      row!.cells[q] = same ? 'match' : 'mismatch';
      const head = `${sym}[${i}]: compare P[${i}] = ${quote(P[i]!)} with P[${q}] = ${quote(P[q]!)}`;
      if (same) {
        yield run.step(
          `${head}. They match, so the border grows: q = ${q + 1}.`,
          ['p.eq', 'p.inc'],
          3,
          [mark(selfTopId(i), 'compare')],
          vars(i, q + 1),
          extra(i, q),
        );
        q++;
        break;
      }
      if (q === 0) {
        yield run.step(
          `${head}. They differ, and q = 0, so there is no shorter border to try.`,
          ['p.back', 'p.eq'],
          3,
          [mark(selfTopId(i), 'compare')],
          vars(i, q),
          extra(i, q),
        );
        break;
      }
      const back = pi[q - 1]!;
      yield run.step(
        `${head}. They differ, so the border ${quote(P.slice(0, q))} cannot grow. Fall back to the next shorter border: q = ${sym}[${q - 1}] = ${back}${back ? `, ${quote(P.slice(0, back))}` : ''}.`,
        ['p.back', 'p.fall'],
        3,
        [mark(selfTopId(i), 'compare'), mark(piCell(q - 1), 'compare')],
        vars(i, back),
        extra(i, q),
      );
      const by = q - back;
      q = back;
      place(i, q, by);
    }
    pi[i] = q;
    const border = q
      ? `${quote(P.slice(0, q))} is the longest proper prefix of P[0..${i}] = ${quote(P.slice(0, i + 1))} that is also a suffix of it`
      : `no proper prefix of P[0..${i}] = ${quote(P.slice(0, i + 1))} is also a suffix of it`;
    const cell = row ? [mark(self(row, Math.max(0, q - 1)), 'done')] : [];
    yield run.step(
      `${sym}[${i}] = ${q}: ${border}.`,
      ['p.set'],
      2,
      [mark(piCell(i), 'new'), ...(q ? cell : [])],
      vars(i, q),
      extra(i),
    );
  }
  yield run.step(
    `${sym} is ready: ${tableText(pi)}, after ${plural(pre.comparisons, 'comparison')}. It depends on P alone, so KMP builds it once and can search any number of texts with it.`,
    ['p.ret'],
    2,
    pi.map((_, j) => mark(piCell(j), 'done')),
    { building: pre.comparisons },
  );
}

// ----- Matching -----

function vars(run: R, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return { ...more, ...run.counters(), alignments: run.search?.attempts.length ?? 0 };
}

function* start(run: R, settings: KmpSettings): Gen<KmpPre> {
  const { sym } = names(settings);
  const { n, m } = run;
  const kept = run.pre && run.search === null && !run.restarted;
  const again = run.restarted ? 'Start a new search. ' : '';
  run.begin();
  const table = kept && run.pre ? `${sym} = ${tableText(run.pre.pi)} is already built for P. ` : '';
  if (m > n) {
    yield run.step(
      `${again}${table}P has ${plural(m, 'character')} and T only ${n}, so P fits at no shift and the loop does not run.`,
      ['init', 'loop'],
      2,
      [],
      vars(run),
    );
    return;
  }
  yield run.step(
    `${again}${table}Now match: start at shift s = 0 with q = 0 characters matched. The text pointer is i = s + q.`,
    ['pi', 'init'],
    2,
    [],
    vars(run, { s: 0, q: 0, i: 0 }),
    { pointer: { name: 'i', at: 0 } },
  );
}

function* attempt(run: R, settings: KmpSettings): Gen<KmpPre> {
  const { sym } = names(settings);
  const { m, text, pattern } = run;
  const pi = piOf(run.pre);
  const live = run.enter();
  const s = live.s;
  let q = live.cells.filter((c) => c === 'known').length;
  const known = q;
  for (; q < m; q++) {
    const i = s + q;
    const same = run.compare(q);
    const head = `s = ${s}: T[${i}] = ${quote(text[i]!)}`;
    yield run.step(
      same ? `${head} matches P[${q}].` : `${head} does not match P[${q}] = ${quote(pattern[q]!)}.`,
      q === known ? ['loop', 'cmp', ...(same ? ['inc'] : [])] : same ? ['cmp', 'inc'] : ['cmp'],
      3,
      [mark(textId(i), 'compare')],
      vars(run, { s, q, i }),
      { pair: { i, j: q }, pointer: { name: 'i', at: i } },
    );
    if (!same) break;
  }
  const i = s + q;
  const skipped = known
    ? ` The first ${plural(known, 'character')} were known to match, so ${known === 1 ? 'it was' : 'they were'} not compared.`
    : '';
  if (q === m) {
    const k = pi[m - 1]!;
    const d = m - k;
    run.close('match', { s: s + d, known: k, by: { amount: d, why: `${sym}[${m - 1}] = ${k}` } });
    const then = k
      ? `${sym}[${m - 1}] = ${k}: the match ends with ${quote(pattern.slice(0, k))}, a prefix of P. Slide P ${plural(d, 'place')}, to s = ${s + d}, so that prefix lines up with it, and carry on at T[${i}] with q = ${k}.`
      : `${sym}[${m - 1}] = 0, so no part of the match can start another one. Slide P all the way past it, to s = ${s + d}.`;
    yield run.step(
      `All ${m} characters match: P occurs at shift ${s}.${skipped} ${then}${s + d > run.n - m ? ' That is past n − m, so the search is over.' : ''}`,
      ['check', 'add', 'else', 'slide', 'keep'],
      1,
      [mark(`found-${s}`, 'found'), mark(piCell(m - 1), 'compare')],
      vars(run, { s, q: k, i }),
    );
    return;
  }
  if (q === 0) {
    run.close('mismatch', { s: s + 1, known: 0, by: { amount: 1 } });
    yield run.step(
      `Nothing matched at shift ${s}, so slide P one place, to s = ${s + 1}, and move on to T[${i + 1}].${s + 1 > run.n - m ? ' That is past n − m, so the search is over.' : ''}`,
      ['check', 'zero'],
      2,
      [],
      vars(run, { s, q: 0, i }),
    );
    return;
  }
  const k = pi[q - 1]!;
  const d = q - k;
  run.close('mismatch', { s: s + d, known: k, by: { amount: d, why: `${sym}[${q - 1}] = ${k}` } });
  const matched = quote(pattern.slice(0, q));
  const keep = k
    ? `Its longest border is ${quote(pattern.slice(0, k))}: ${sym}[${q - 1}] = ${k}. Slide P ${plural(d, 'place')}, to s = ${s + d}, so its first ${plural(k, 'character')} line up with T[${i - k}..${i - 1}], which already match them. i stays at ${i}: compare T[${i}] with P[${k}] next.`
    : `${sym}[${q - 1}] = 0: no prefix of P can start inside it. Slide P ${plural(d, 'place')}, to s = ${s + d}, and compare T[${i}] with P[0] next. i stays at ${i}.`;
  yield run.step(
    `Shift ${s} matched ${matched}, then T[${i}] ≠ P[${q}].${skipped} ${keep}${s + d > run.n - m ? ' That is past n − m, so the search is over.' : ''}`,
    ['check', 'zero', 'else', 'slide', 'keep'],
    2,
    [mark(piCell(q - 1), 'compare')],
    vars(run, { s, q: k, i }),
  );
}

function finish(run: R, settings: KmpSettings): MatchStep<KmpPre> {
  const { sym } = names(settings);
  const s = run.s;
  const { n, m } = run;
  const where = s.found.length
    ? `P occurs at ${s.found.length === 1 ? 'shift' : 'shifts'} ${foundText(s.found)}`
    : 'P does not occur in T';
  const work =
    m > n
      ? 'No shift fits, so there was nothing to compare.'
      : `Matching made ${plural(s.comparisons, 'comparison')} in ${plural(s.attempts.length, 'alignment')}; building ${sym} made ${run.pre?.comparisons ?? 0}. The text pointer never moved back, so matching can never take more than 2n − m + 1 = ${2 * n - m + 1}.`;
  return run.step(
    `Done. ${where}. ${work}`,
    ['ret'],
    1,
    s.found.map((f) => mark(`found-${f}`, 'found')),
    { ...run.counters(), alignments: s.attempts.length, building: run.pre?.comparisons ?? 0 },
  );
}

const engine: Engine<KmpPre, KmpSettings> = { prepare: buildTable, start, attempt, finish };

/** "Build the table": the prefix function alone. */
const prefix: Op = {
  label: 'Build the table',
  arity: 0,
  *run(s, _args, { settings }) {
    const { sym } = names(settings);
    if (s.pre) {
      yield {
        state: s,
        marks: s.pre.pi.map((_, j) => mark(piCell(j), 'done')),
        say: `${sym} is already built for P = ${quote(s.pattern)}: ${tableText(s.pre.pi)}. Press Search to match with it.`,
        lines: ['p.ret'],
        level: 1,
        vars: { building: s.pre.comparisons },
      };
      return s;
    }
    const run = new Run(s);
    yield* buildTable(run, settings);
    return run.snapshot();
  },
};

export const ops: Record<string, Op> = {
  load: loadOp<KmpPre, KmpSettings>({
    keepPre: (pre) =>
      `P has not changed, so its table ${tableText((pre as KmpPre).pi)} stays: it depends on P alone.`,
  }),
  ...searchOps(engine),
  prefix,
};

// ----- Pseudocode -----

function prefixLines(settings: KmpSettings): PseudoLine[] {
  const { sym, fn } = names(settings);
  return [
    L('p.sig', 0, `${fn}(P)`, `To build ${sym} from P alone:`),
    L(
      'p.init',
      1,
      `${sym}[0] = 0; q = 0`,
      'One character has no shorter border. q is the border so far.',
    ),
    L('p.loop', 1, 'for i = 1 to m − 1', 'For each position i after the first,'),
    L('p.back', 2, 'while q > 0 and P[q] ≠ P[i]', 'while the border cannot grow by P[i],'),
    L('p.fall', 3, `q = ${sym}[q − 1]`, 'fall back to the next shorter border.'),
    L('p.eq', 2, 'if P[q] == P[i]', 'If the next character matches,'),
    L('p.inc', 3, 'q = q + 1', 'the border grows by one.'),
    L('p.set', 2, `${sym}[i] = q`, 'Write down how long the border is.'),
    L('p.ret', 1, `return ${sym}`, `${sym} is done.`),
  ];
}

function searchLines(settings: KmpSettings): PseudoLine[] {
  const { sym, fn } = names(settings);
  return [
    L('sig', 0, 'kmpSearch(T, P)', 'To find every shift where P occurs in T:'),
    L('pi', 1, `${sym} = ${fn}(P)`, `Build ${sym} from P, as above.`),
    L('init', 1, 'found = []; s = 0; q = 0', 'Start at shift 0 with nothing matched.'),
    L('loop', 1, 'while s ≤ n − m', 'While P fits under T,'),
    L(
      'cmp',
      2,
      'while q < m and T[s + q] == P[q]',
      'compare from P[q] on, while the characters agree:',
    ),
    L('inc', 3, 'q = q + 1', 'one more character matches.'),
    L('check', 2, 'if q == m', 'If all m match,'),
    L('add', 3, 'append s to found', 'P occurs at shift s.'),
    L('zero', 2, 'if q == 0: s = s + 1', 'If nothing matched, slide one place.'),
    L('else', 2, 'else', 'Otherwise,'),
    L(
      'slide',
      3,
      `s = s + q − ${sym}[q − 1]`,
      'slide P so its longest border lines up with the end of the match,',
    ),
    L('keep', 3, `q = ${sym}[q − 1]`, 'and count the border as matched already.'),
    L('ret', 1, 'return found', 'Hand back every shift found.'),
  ];
}

export function pseudocode(settings: KmpSettings): PseudoBlock[] {
  return [
    { op: 'search', lines: [...prefixLines(settings), ...searchLines(settings)] },
    { op: 'prefix', lines: prefixLines(settings) },
  ];
}

export function initialSay(state: S, settings: KmpSettings): string {
  const { sym } = names(settings);
  return `T = ${quote(state.text)} and P = ${quote(state.pattern)}. KMP first builds ${sym} from P, then matches without ever moving back in T. Press Search, or Load your own text and pattern.`;
}

export function initialVars(state: S) {
  return { n: state.text.length, m: state.pattern.length };
}
