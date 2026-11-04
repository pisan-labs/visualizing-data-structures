/**
 * Brute-force string search: put the pattern at every shift s from 0 to n - m, compare left to
 * right until a mismatch, and report the shifts where all m characters agree. The text pointer
 * i = s + j goes back to s + 1 after every alignment, which is the work KMP saves.
 */
import type { OpSpec, PseudoBlock, Scalar } from '../../engine/types';
import {
  foundText,
  initState,
  L,
  loadOp,
  mark,
  plural,
  q,
  Run,
  searchOps,
  textId,
  type Engine,
  type MatchExtra,
  type MatchState,
} from '../_strings/kit';

export interface BruteSettings {
  [key: string]: Scalar;
}

export const defaults: BruteSettings = {};

type S = MatchState<null>;
type Op = OpSpec<S, BruteSettings, MatchExtra>;

export const init = (): S => initState<null>();

const shiftsVar = (run: Run<null>) => run.search?.attempts.length ?? 0;

function vars(run: Run<null>, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return { ...more, ...run.counters(), shifts: shiftsVar(run) };
}

/** Where the pattern goes after shift s, and what that does to the text pointer. */
function moveOn(run: Run<null>, s: number, i: number): string {
  const { n, m } = run;
  if (s + 1 > n - m) return `That was the last shift, s = n − m = ${n - m}.`;
  const back = i - (s + 1);
  const pointer =
    back > 0
      ? ` The text pointer goes back ${plural(back, 'place')}, from T[${i}] to T[${s + 1}], to compare characters it has already seen.`
      : '';
  return `Slide P one place, to s = ${s + 1}.${pointer}`;
}

const engine: Engine<null, BruteSettings> = {
  *start(run) {
    const { n, m } = run;
    const again = run.restarted ? 'Start a new search. ' : '';
    run.begin();
    if (m > n) {
      yield run.step(
        `${again}P has ${plural(m, 'character')} and T only ${n}, so no shift fits: n − m = ${n - m}, and the loop does not run at all.`,
        ['init', 'loop'],
        2,
        [],
        vars(run),
      );
      return;
    }
    yield run.step(
      `${again}Look for P = ${q(run.pattern)} in T. Try every shift s from 0 to n − m = ${n - m}, comparing left to right until two characters differ.`,
      ['init', 'loop'],
      2,
      [],
      vars(run, { s: 0 }),
    );
  },

  *attempt(run) {
    const { m, text, pattern } = run;
    const live = run.enter();
    const s = live.s;
    let j = 0;
    for (; j < m; j++) {
      const i = s + j;
      const same = run.compare(j);
      const t = q(text[i]!);
      const p = q(pattern[j]!);
      yield run.step(
        same
          ? `s = ${s}: T[${i}] = ${t} matches P[${j}] = ${p}.`
          : `s = ${s}: T[${i}] = ${t} does not match P[${j}] = ${p}.`,
        j === 0
          ? ['loop', 'start', 'cmp', ...(same ? ['inc'] : [])]
          : same
            ? ['cmp', 'inc']
            : ['cmp'],
        3,
        [mark(textId(i), 'compare')],
        vars(run, { s, j, i }),
        { pair: { i, j }, pointer: { name: 'i', at: i } },
      );
      if (!same) break;
    }
    const next = { s: s + 1, known: 0, by: { amount: 1 } };
    if (j === m) {
      run.close('match', next);
      const i = s + m;
      yield run.step(
        `All ${m} characters match: P occurs at shift ${s}. That took ${plural(m, 'comparison')}. ${moveOn(run, s, i - 1)}`,
        ['check', 'add'],
        1,
        [mark(`found-${s}`, 'found')],
        vars(run, { s }),
      );
      return;
    }
    run.close('mismatch', next);
    const i = s + j;
    const before =
      j === 0
        ? 'the first characters differ'
        : `${plural(j, 'character')} matched before T[${i}] ≠ P[${j}]`;
    yield run.step(
      `Shift ${s} fails: ${before}. That took ${plural(j + 1, 'comparison')}. ${moveOn(run, s, i)}`,
      ['check', 'loop'],
      2,
      [],
      vars(run, { s }),
    );
  },

  finish(run) {
    const s = run.s;
    const { n, m } = run;
    const where = s.found.length
      ? `P occurs at ${s.found.length === 1 ? 'shift' : 'shifts'} ${foundText(s.found)}`
      : 'P does not occur in T';
    const work =
      m > n
        ? 'No shift fits, so there was nothing to compare.'
        : `Brute force tried all ${plural(s.attempts.length, 'shift')} and made ${plural(s.comparisons, 'comparison')}, ${(s.comparisons / s.attempts.length).toFixed(1)} per shift.`;
    return run.step(
      `Done. ${where}. ${work}`,
      ['ret'],
      1,
      s.found.map((f) => mark(`found-${f}`, 'found')),
      vars(run),
    );
  },
};

export const ops: Record<string, Op> = {
  load: loadOp<null, BruteSettings>(),
  ...searchOps(engine),
};

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'search',
      lines: [
        L('sig', 0, 'bruteForce(T, P)', 'To find every shift where P occurs in T:'),
        L('init', 1, 'found = []; n = |T|; m = |P|', 'Start with no matches found.'),
        L('loop', 1, 'for s = 0 to n − m', 'Try each shift s where P fits under T.'),
        L('start', 2, 'j = 0', "Start at P's first character."),
        L('cmp', 2, 'while j < m and T[s + j] == P[j]', 'While the two characters lined up agree,'),
        L('inc', 3, 'j = j + 1', 'move one place to the right.'),
        L('check', 2, 'if j == m', 'If all m characters agreed,'),
        L('add', 3, 'append s to found', 'P occurs at shift s.'),
        L('ret', 1, 'return found', 'Hand back every shift found.'),
      ],
    },
  ];
}

export function initialSay(state: S): string {
  const n = state.text.length;
  const m = state.pattern.length;
  return `T = ${q(state.text)} and P = ${q(state.pattern)}. Brute force puts P at each of the ${n - m + 1} shifts in turn. Press Search, or Load your own text and pattern.`;
}

export function initialVars(state: S) {
  return { n: state.text.length, m: state.pattern.length };
}
