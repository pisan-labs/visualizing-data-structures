import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { defaults, type PalExtra, type PalSettings, type PalState } from './model';

type Def = VizDef<PalState, PalSettings, PalExtra>;
type PalStep = Step<PalState, PalExtra>;

/** A word over a few letters, so repeats (and palindromes) are common. */
export function randomWord(rng: Rng, n: number, letters = 'ABC'): string {
  return Array.from({ length: n }, () => letters[rng.int(0, letters.length - 1)]).join('');
}

/**
 * Practice questions for the longest palindromic subsequence. Answers come from running the
 * model with seed 1, the way the practice panel replays a question. `def` is a getter to avoid
 * an import cycle.
 */
export function palPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[]) => new Timeline(def(), { ...defaults }, 1, ops);
  const last = (ops: OpCall[]): PalStep => run(ops).entries.at(-1)!.steps.at(-1)!;

  return [
    {
      id: 'cell',
      title: 'Fill the next diagonal',
      make(rng) {
        const w = randomWord(rng, rng.int(5, 7));
        const done = rng.int(2, w.length - 2);
        const len = done + 1;
        const i = rng.int(1, w.length - len + 1);
        const j = i + len - 1;
        const setup: OpCall[] = [
          ['load', w],
          ...Array.from({ length: done }, () => ['diagonal'] as OpCall),
        ];
        const L = run([...setup, ['diagonal']]).endState().L;
        const v = L[i - 1]![j - 1]!;
        const a = w[i - 1]!;
        const b = w[j - 1]!;
        return {
          prompt: `The string is ${w}. Lengths 1 to ${done} are filled. What is L[${i}][${j}], the longest palindromic subsequence of ${w.slice(i - 1, j)}?`,
          setup,
          answer: { kind: 'number', value: v },
          explain:
            a === b
              ? `The ends match (${a}), so L[${i}][${j}] = L[${i + 1}][${j - 1}] + 2 = ${L[i]![j - 2]} + 2 = ${v}.`
              : `${a} ≠ ${b}, so L[${i}][${j}] = max(L[${i + 1}][${j}], L[${i}][${j - 1}]) = max(${L[i]![j - 1]}, ${L[i - 1]![j - 2]}) = ${v}.`,
          watch: [['diagonal']],
        };
      },
    },
    {
      id: 'length',
      title: 'How long is it?',
      make(rng) {
        const w = randomWord(rng, rng.int(5, 8), 'ABCD');
        const setup: OpCall[] = [['load', w]];
        const end = last([...setup, ['fill'], ['trace']]);
        const rev = [...w].reverse().join('');
        return {
          prompt: `How long is the longest palindromic subsequence of ${w}?`,
          setup,
          answer: { kind: 'number', value: Number(end.vars?.length) },
          explain: `One is ${String(end.vars?.palindrome)}. The LCS of ${w} and its reverse ${rev} has the same length.`,
          watch: [['fill'], ['trace']],
        };
      },
    },
    {
      id: 'walk',
      title: 'Walk in from both ends',
      make(rng) {
        const w = randomWord(rng, rng.int(5, 8));
        const setup: OpCall[] = [['load', w], ['fill']];
        const end = last([...setup, ['trace']]);
        const pal = String(end.vars?.palindrome);
        return {
          prompt: `The table for ${w} is full. Walk in from both ends: take matching ends, and otherwise drop the left end unless the cell to the left is strictly larger. Type the palindrome you find.`,
          setup,
          answer: { kind: 'sequence', value: [pal] },
          explain: `The walk finds ${pal}, ${pal.length === 1 ? '1 character' : `${pal.length} characters`}.`,
          watch: [['trace']],
        };
      },
    },
  ];
}
