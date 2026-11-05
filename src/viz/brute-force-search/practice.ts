import type { PracticeKind } from '../../engine/types';
import { andList, plural, type MatchState } from '../_strings/kit';
import { input, nexts, pair, stateAfter, type MatchDef } from '../_strings/practice';

/** How many comparisons each attempt of a finished search made. */
const costs = (state: MatchState) =>
  state.search!.attempts.map((a) => a.cells.filter((c) => c !== null).length);

/**
 * Practice questions for brute-force search. Every answer comes from running the model.
 * `def` is a getter to avoid an import cycle.
 */
export function brutePractice(def: () => MatchDef): PracticeKind[] {
  return [
    {
      id: 'alignment',
      title: 'How many comparisons at this shift?',
      make(rng) {
        const { text, pattern, load } = input(rng, rng.int(10, 13), rng.int(3, 4), 'AB');
        const n = text.length;
        const m = pattern.length;
        // A shift that gets somewhere, most of the time.
        const all = costs(stateAfter(def(), {}, [load, ['search']]));
        const busy = all.map((c, s) => (c > 1 ? s : -1)).filter((s) => s >= 0);
        const s =
          busy.length && rng.int(0, 3) ? busy[rng.int(0, busy.length - 1)]! : rng.int(0, n - m);
        const setup = [load, ...nexts(s)];
        const before = stateAfter(def(), {}, setup).search;
        const after = stateAfter(def(), {}, [...setup, ['next']]).search!;
        const count = after.comparisons - (before?.comparisons ?? 0);
        const attempt = after.attempts[s]!;
        const matched = attempt.cells.filter((c) => c === 'match').length;
        return {
          prompt: `${pair(text, pattern)}. Brute force has tried ${s === 0 ? 'no shift yet' : `shifts 0 to ${s - 1}`}, and P now waits at shift ${s}. How many character comparisons does shift ${s} take?`,
          setup,
          answer: { kind: 'number', value: count },
          explain:
            attempt.end === 'match'
              ? `All ${m} characters match, so it compares all ${m}: P occurs at shift ${s}.`
              : matched === 0
                ? `T[${s}] ≠ P[0], so the shift fails on its first comparison.`
                : `${plural(matched, 'character')} match, then T[${s + matched}] ≠ P[${matched}] stops it: ${plural(count, 'comparison')} in all.`,
          watch: [['next']],
        };
      },
    },
    {
      id: 'total',
      title: 'How many comparisons in all?',
      make(rng) {
        const { text, pattern, load } = input(rng, rng.int(7, 9), rng.int(2, 3), 'AB');
        const end = stateAfter(def(), {}, [load, ['search']]);
        const each = costs(end);
        return {
          prompt: `${pair(text, pattern)}. How many character comparisons does brute force make to find every match?`,
          setup: [load],
          answer: { kind: 'number', value: end.search!.comparisons },
          explain: `Shift by shift, from s = 0: ${each.join(' + ')} = ${end.search!.comparisons}. Each shift stops at its first mismatch, or after all ${pattern.length} characters on a match.`,
          watch: [['search']],
        };
      },
    },
    {
      id: 'found',
      title: 'Where does P occur?',
      make(rng) {
        const m = rng.int(2, 4);
        const { text, pattern, load } = input(rng, rng.int(9, 12), m, rng.int(0, 2) ? 'AB' : 'ABC');
        const found = stateAfter(def(), {}, [load, ['search']]).search!.found.map(String);
        return {
          prompt: `${pair(text, pattern)}. Type every shift where P occurs, from left to right. Matches may overlap.`,
          setup: [load],
          answer: { kind: 'sequence', value: found },
          explain: found.length
            ? `P occurs at ${found.length === 1 ? 'shift' : 'shifts'} ${andList(found)}: at each one, T[s..s + ${m - 1}] spells ${pattern}.`
            : `No shift spells ${pattern}, so the answer is blank.`,
          watch: [['search']],
        };
      },
    },
    {
      id: 'again',
      title: 'How often is one character compared?',
      make(rng) {
        const { text, pattern, load } = input(rng, rng.int(9, 11), rng.int(3, 4), 'AB');
        const end = stateAfter(def(), {}, [load, ['search']]);
        const m = pattern.length;
        // A character in the middle of the text, where shifts overlap.
        const i = rng.int(m - 1, text.length - m);
        const shifts = end.search!.attempts.filter(
          (a) => a.s <= i && i < a.s + m && a.cells[i - a.s] !== null,
        );
        return {
          prompt: `${pair(text, pattern)}. Over the whole search, how many times does brute force compare T[${i}] with a character of P?`,
          setup: [load],
          answer: { kind: 'number', value: shifts.length },
          explain: shifts.length
            ? `T[${i}] is compared at ${shifts.length === 1 ? 'shift' : 'shifts'} ${andList(shifts.map((a) => a.s))}, once at each shift that gets that far. Brute force goes back over characters it has already seen.`
            : `No shift gets as far as T[${i}]: each one stops at a mismatch before it.`,
          watch: [['search']],
        };
      },
    },
  ];
}
