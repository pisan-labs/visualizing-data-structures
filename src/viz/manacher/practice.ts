import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { randomWord } from '../_strings/kit';
import { choice } from '../_strings/practice';
import {
  defaults,
  palindromeOf,
  type ManacherExtra,
  type ManacherSettings,
  type ManacherState,
} from './model';

type Def = VizDef<ManacherState, ManacherSettings, ManacherExtra>;

/** A word with a palindrome planted in it, over a few letters. */
function word(rng: Rng, n: number): string {
  const half = randomWord(rng, rng.int(1, 3), 'abc');
  const pal = rng.int(0, 1)
    ? half + [...half].reverse().join('')
    : half + randomWord(rng, 1, 'abc') + [...half].reverse().join('');
  const rest = Math.max(0, n - pal.length);
  const left = rng.int(0, rest);
  return (randomWord(rng, left, 'abcd') + pal + randomWord(rng, rest - left, 'abcd')).slice(0, n);
}

/** Every distinct palindromic substring, longest first. */
function palindromes(s: string): string[] {
  const out = new Set<string>();
  for (let a = 0; a < s.length; a++)
    for (let b = a + 1; b <= s.length; b++) {
      const w = s.slice(a, b);
      if (w === [...w].reverse().join('')) out.add(w);
    }
  return [...out].sort((x, y) => y.length - x.length);
}

/**
 * Practice questions for Manacher's algorithm. Every answer comes from running the model with
 * the default settings. `def` is a getter to avoid an import cycle.
 */
export function manacherPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[]) => new Timeline(def(), defaults, 1, ops);
  const built = (s: string) => run([['load', s], ['build']]).endState();

  return [
    {
      id: 'longest',
      title: 'The longest palindrome',
      make(rng) {
        const s = word(rng, rng.int(6, 9));
        const end = built(s);
        const right = palindromeOf(s, end.best);
        const others = palindromes(s).filter((w) => w.length < right.length);
        // Wrong options: shorter palindromes, and a stretch around them that is not one.
        const near = s.slice(0, Math.min(s.length, right.length + 1));
        return {
          prompt: `What is the longest palindromic substring of \`${s}\`? (On a tie, the leftmost.)`,
          setup: [['load', s]],
          answer: choice(rng, right, [...others.slice(0, 2), near, s.slice(-right.length)]),
          explain: `\`${right}\`, length ${right.length}: the largest value in P is ${end.best!.radius}, at T[${end.best!.center}].`,
          watch: [['build']],
        };
      },
    },
    {
      id: 'radius',
      title: 'One value of P',
      make(rng) {
        const s = word(rng, rng.int(5, 8));
        const end = built(s);
        const p = end.p.map((v) => v ?? 0);
        const some = p.map((v, k) => (v > 1 ? k : -1)).filter((k) => k >= 0);
        const k =
          some.length && rng.int(0, 2)
            ? some[rng.int(0, some.length - 1)]!
            : rng.int(0, p.length - 1);
        const v = p[k]!;
        const pal = end.t.slice(k - v, k + v + 1);
        return {
          prompt: `With separators, \`${s}\` becomes T = \`${end.t}\`. What is P[${k}], the radius of the longest palindrome centered at T[${k}] = ${end.t[k]}?`,
          setup: [['load', s]],
          answer: { kind: 'number', value: v },
          explain: v
            ? `T[${k - v}..${k + v}] = \`${pal}\` reads the same both ways${k - v > 0 && k + v + 1 < end.t.length ? `, and T[${k - v - 1}] ≠ T[${k + v + 1}]` : ' and reaches the edge of T'}, so P[${k}] = ${v}.`
            : `T[${k - 1}] ≠ T[${k + 1}], or T[${k}] is at an edge, so P[${k}] = 0.`,
          watch: [['build']],
        };
      },
    },
    {
      id: 'mirror-start',
      title: 'What the mirror gives',
      make(rng) {
        for (let tries = 0; tries < 500; tries++) {
          const s = word(rng, rng.int(6, 9));
          const steps = run([['load', s], ['build']]).entries[1]!.steps;
          const inside = steps
            .filter((st) => st.lines.includes('copy'))
            .map((st) => st.vars!.i as number);
          if (!inside.length) continue;
          const i = inside[rng.int(0, inside.length - 1)]!;
          const setup: OpCall[] = [
            ['load', s],
            ...Array.from({ length: i }, (): OpCall => ['next']),
          ];
          const before = run(setup).endState();
          const first = run([...setup, ['next']])
            .entries.at(-1)!
            .steps.find((st) => st.lines.includes('copy'))!;
          const start = first.vars!['P[i]'] as number;
          const j = 2 * before.c - i;
          return {
            prompt: `T = \`${before.t}\`. P is filled up to P[${i - 1}], C = ${before.c} and R = ${before.r}. Before any comparison, what value does P[${i}] start at?`,
            setup,
            answer: { kind: 'number', value: start },
            explain: `The mirror of ${i} is 2C − i = ${j}, so P[${i}] = min(R − i, P[${j}]) = min(${before.r - i}, ${before.p[j]}) = ${start}.`,
            watch: [['next']],
          };
        }
        throw new Error('No center inside a palindrome turned up.');
      },
    },
    {
      id: 'comparisons',
      title: 'How many comparisons?',
      make(rng) {
        const s = word(rng, rng.int(4, 6));
        const end = built(s);
        return {
          prompt: `How many character comparisons does Manacher's algorithm make on \`${s}\` (T = \`${end.t}\`)? Count every test of the cells just outside a palindrome, matches and mismatches, but not the edge checks.`,
          setup: [['load', s]],
          answer: { kind: 'number', value: end.comparisons },
          explain: `P = ${end.p.join(' ')}. Each center compares until a mismatch or the edge of T, starting from what its mirror gave it: ${end.comparisons} in all.`,
          watch: [['build']],
        };
      },
    },
  ];
}
