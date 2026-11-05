import type { OpCall, PracticeKind } from '../../engine/types';
import { loadCall, plural } from '../_strings/kit';
import { input, nexts, pair, stateAfter, type MatchDef } from '../_strings/practice';
import { names, piOf, type KmpPre } from './model';

const sym = names({ name: 'pi' }).sym;

/**
 * Practice questions for KMP. Every answer comes from running the model with the default
 * settings. `def` is a getter to avoid an import cycle.
 */
export function kmpPractice(def: () => MatchDef): PracticeKind[] {
  const table = (pattern: string) =>
    piOf(stateAfter(def(), {}, [loadCall(pattern, pattern), ['prefix']]).pre as KmpPre);

  return [
    {
      id: 'pi-value',
      title: `One value of ${sym}`,
      make(rng) {
        const { pattern, load } = input(
          rng,
          rng.int(10, 14),
          rng.int(5, 8),
          rng.int(0, 2) ? 'AB' : 'ABC',
        );
        const setup = [load];
        const pi = table(pattern);
        // Usually a position with a border, so the answer is not always 0.
        const some = pi.map((v, j) => (v > 0 ? j : -1)).filter((j) => j > 0);
        const j =
          some.length && rng.int(0, 3)
            ? some[rng.int(0, some.length - 1)]!
            : rng.int(1, pattern.length - 1);
        const v = pi[j]!;
        return {
          prompt: `P = \`${pattern}\`. What is ${sym}[${j}], the length of the longest proper prefix of P[0..${j}] = \`${pattern.slice(0, j + 1)}\` that is also a suffix of it?`,
          setup,
          answer: { kind: 'number', value: v },
          explain: v
            ? `\`${pattern.slice(0, v)}\` starts and ends \`${pattern.slice(0, j + 1)}\`, and no longer proper prefix does, so ${sym}[${j}] = ${v}.`
            : `No proper prefix of \`${pattern.slice(0, j + 1)}\` is also a suffix of it, so ${sym}[${j}] = 0.`,
          watch: [['prefix']],
        };
      },
    },
    {
      id: 'pi-table',
      title: `The whole ${sym} table`,
      make(rng) {
        const { pattern, load } = input(
          rng,
          rng.int(10, 14),
          rng.int(5, 7),
          rng.int(0, 1) ? 'AB' : 'ABC',
        );
        const setup = [load];
        const pi = table(pattern);
        return {
          prompt: `P = \`${pattern}\`. Type ${sym}[0] to ${sym}[${pattern.length - 1}], in order.`,
          setup,
          answer: { kind: 'sequence', value: pi.map(String) },
          explain: `${sym} = ${pi.join(' ')}. Each value is one more than the one before while the next character extends the border, and falls back to a shorter border when it does not.`,
          watch: [['prefix']],
        };
      },
    },
    {
      id: 'next-shift',
      title: 'Where does P slide?',
      make(rng) {
        // An alignment that matches part of P before a mismatch, so the slide uses the table.
        for (let tries = 0; tries < 1000; tries++) {
          const { text, pattern, load } = input(rng, rng.int(10, 13), rng.int(4, 6), 'AB');
          const end = stateAfter(def(), {}, [load, ['search']]);
          const ok = end
            .search!.attempts.map((a, k) => ({ a, k }))
            .filter(
              ({ a, k }) =>
                a.end === 'mismatch' &&
                a.cells.some((c) => c === 'match' || c === 'known') &&
                k + 1 < end.search!.attempts.length,
            );
          if (!ok.length) continue;
          const { k, a } = ok[rng.int(0, ok.length - 1)]!;
          const setup: OpCall[] = [load, ['prefix'], ...nexts(k)];
          const next = end.search!.attempts[k + 1]!.s;
          const known = a.cells.filter((c) => c === 'known').length;
          const q = a.cells.filter((c) => c === 'match' || c === 'known').length;
          const pi = piOf(end.pre as KmpPre);
          return {
            prompt: `${pair(text, pattern)}. P waits at shift ${a.s}${known ? `, with its first ${plural(known, 'character')} known to match` : ''}. Compare from there until a mismatch. Which shift does KMP try next?`,
            setup,
            answer: { kind: 'number', value: next },
            explain:
              q > 0
                ? `\`${pattern.slice(0, q)}\` matches, then T[${a.s + q}] ≠ P[${q}]. ${sym}[${q - 1}] = ${pi[q - 1]}, so P slides ${q} − ${pi[q - 1]} = ${q - pi[q - 1]!} places: s = ${a.s} + ${q - pi[q - 1]!} = ${next}.`
                : `Nothing matches, so P slides one place, to s = ${next}.`,
            watch: [['next']],
          };
        }
        throw new Error('No alignment with a partial match turned up.');
      },
    },
    {
      id: 'comparisons',
      title: 'How many comparisons?',
      make(rng) {
        const { text, pattern, load } = input(rng, rng.int(8, 10), rng.int(3, 4), 'AB');
        const setup: OpCall[] = [load, ['prefix']];
        const end = stateAfter(def(), {}, [...setup, ['search']]);
        const each = end.search!.attempts.map(
          (a) => a.cells.filter((c) => c === 'match' || c === 'mismatch').length,
        );
        return {
          prompt: `${pair(text, pattern)}, and ${sym} is built. How many character comparisons does KMP make while matching?`,
          setup,
          answer: { kind: 'number', value: end.search!.comparisons },
          explain: `Alignment by alignment: ${each.join(' + ')} = ${end.search!.comparisons}. Characters known to match after a slide are not compared again.`,
          watch: [['search']],
        };
      },
    },
  ];
}
