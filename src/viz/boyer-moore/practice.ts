import type { OpCall, PracticeKind, Settings } from '../../engine/types';
import { andList, plural } from '../_strings/kit';
import { input, nexts, ordered, pair, stateAfter, type MatchDef } from '../_strings/practice';
import { badValue, type BmPre } from './model';

const FULL: Settings = { rules: 'full' };
const RULES = ['The bad-character rule', 'The good-suffix rule', 'Both give the same shift'];

/**
 * Practice questions for Boyer-Moore. Every answer comes from running the model. `def` is a
 * getter to avoid an import cycle.
 */
export function bmPractice(def: () => MatchDef): PracticeKind[] {
  /** A search whose alignment k is followed by another, with the setup that stops at k. */
  function pick(
    rng: Parameters<PracticeKind['make']>[0],
    settings: Settings,
    want: (cells: readonly (string | null)[]) => boolean,
  ) {
    for (let tries = 0; tries < 1000; tries++) {
      const { text, pattern, load } = input(rng, rng.int(11, 15), rng.int(3, 5), 'ABC');
      const end = stateAfter(def(), settings, [load, ['search']]);
      const all = end.search!.attempts;
      const ok = all.map((a, k) => k).filter((k) => k + 1 < all.length && want(all[k]!.cells));
      if (!ok.length) continue;
      const k = ok[rng.int(0, ok.length - 1)]!;
      const setup: OpCall[] = [load, ['tables'], ...nexts(k)];
      return { text, pattern, end, k, setup };
    }
    throw new Error('No suitable alignment turned up.');
  }

  return [
    {
      id: 'table-value',
      title: 'One entry of the shift table',
      make(rng) {
        const { text, pattern, load } = input(rng, rng.int(10, 14), rng.int(4, 6), 'ABCD');
        const m = pattern.length;
        const pre = stateAfter(def(), {}, [load, ['tables']]).pre as BmPre;
        // A character from P most of the time; sometimes its last one or one not in P.
        const pool = [...new Set(pattern)];
        const c = rng.int(0, 3) ? pool[rng.int(0, pool.length - 1)]! : 'ABCD'[rng.int(0, 3)]!;
        const v = badValue(pre, c);
        const j = pattern.slice(0, -1).lastIndexOf(c);
        return {
          prompt: `${pair(text, pattern)}. In Horspool's table, what is shift['${c}']?`,
          setup: [load],
          answer: { kind: 'number', value: v },
          explain:
            j >= 0
              ? `The last ${c} in P[0..${m - 2}] is at ${j}, so shift['${c}'] = m − 1 − ${j} = ${v}.`
              : `${c} is not in P[0..${m - 2}]${pattern.endsWith(c) ? ' (the last character does not count)' : ''}, so shift['${c}'] = m = ${m}.`,
          watch: [['tables']],
        };
      },
    },
    {
      id: 'next-shift',
      title: 'Where does Horspool slide P?',
      make(rng) {
        const { text, pattern, end, k, setup } = pick(rng, {}, () => true);
        const a = end.search!.attempts[k]!;
        const next = end.search!.attempts[k + 1]!.s;
        const m = pattern.length;
        const c = text[a.s + m - 1]!;
        return {
          prompt: `${pair(text, pattern)}. P waits at shift ${a.s}. Compare from the right, then slide. Which shift does Horspool try next?`,
          setup,
          answer: { kind: 'number', value: next },
          explain: `Whatever the comparisons find, Horspool slides by shift[T[${a.s + m - 1}]] = shift['${c}'] = ${next - a.s}, so s = ${a.s} + ${next - a.s} = ${next}.`,
          watch: [['next']],
        };
      },
    },
    {
      id: 'shifts',
      title: 'Which shifts does Horspool try?',
      make(rng) {
        const { text, pattern, load } = input(rng, rng.int(10, 13), rng.int(3, 4), 'ABCD');
        const end = stateAfter(def(), {}, [load, ['search']]);
        const shifts = end.search!.attempts.map((a) => String(a.s));
        return {
          prompt: `${pair(text, pattern)}. Type every shift Horspool tries, in order, starting with 0.`,
          setup: [load, ['tables']],
          answer: { kind: 'sequence', value: shifts },
          explain: `It tries ${andList(shifts)}: ${plural(shifts.length, 'alignment')} out of ${text.length - pattern.length + 1} possible shifts. Each slide is the table entry for the text character under the end of P.`,
          watch: [['search']],
        };
      },
    },
    {
      id: 'rule',
      title: 'Which rule decides?',
      make(rng) {
        const { text, pattern, end, k, setup } = pick(rng, FULL, (cells) =>
          cells.includes('mismatch'),
        );
        const a = end.search!.attempts[k]!;
        const by = end.search!.attempts[k + 1]!.by!;
        const pre = end.pre as BmPre;
        const j = a.cells.indexOf('mismatch');
        const c = text[a.s + j]!;
        const last = badValue(pre, c);
        const bc = j - last;
        const gs = pre.gs![j]!;
        const right = by.rule === 'bc' ? RULES[0]! : by.rule === 'gs' ? RULES[1]! : RULES[2]!;
        return {
          prompt: `${pair(text, pattern)}, with both rules. P waits at shift ${a.s}. Compare from the right. Which rule sets the next shift?`,
          setup,
          settings: FULL,
          answer: ordered(RULES, right),
          explain: `T[${a.s + j}] = '${c}' ≠ P[${j}]. Bad character: ${j} − last['${c}'] = ${j} − ${last < 0 ? '(−1)' : last} = ${bc < 0 ? `−${-bc}, no help` : bc}. Good suffix: gs[${j}] = ${gs}. P slides ${plural(by.amount, 'place')}.`,
          watch: [['next']],
        };
      },
    },
  ];
}
