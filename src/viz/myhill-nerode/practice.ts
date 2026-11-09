import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { wordText as w } from './language';
import { defaults, pairKey, type MnSettings, type MnState } from './model';

type Def = VizDef<MnState, MnSettings, unknown>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
const code = (s: string) => `\`${s}\``;

/** Regular languages the questions use, with a word each that is plain to say. */
const LANGUAGES = ['(a|b)*ab', '(a|b)*a(a|b)', 'a*b*', '(ab)*', 'a(a|b)*b', '(a|b)*bb', 'b*ab*'];

const randomWord = (rng: Rng, lo: number, hi: number) =>
  Array.from({ length: rng.int(lo, hi) }, () => 'ab'[rng.int(0, 1)]).join('');

/**
 * Practice for the Myhill–Nerode page. Every answer comes from running the model. `def` is a
 * getter to avoid an import cycle.
 */
export function mnPractice(def: () => Def): PracticeKind[] {
  const end = (calls: OpCall[]) => new Timeline(def(), defaults, 1, calls).endState();
  /** The suffix the model finds for x and y in L (null: equivalent). */
  const suffix = (lang: string, x: string, y: string): string | null => {
    // A word is always equivalent to itself (and Words apart takes different words).
    if (x === y) return null;
    const p = end([
      ['load', lang],
      ['apart', `${x || 'eps'} ${y || 'eps'}`],
    ]).panel;
    return p?.kind === 'apart' ? (p.table[pairKey(1, 0)] ?? null) : null;
  };
  const twoWords = (rng: Rng) => {
    const x = randomWord(rng, 0, 3);
    let y = randomWord(rng, 0, 3);
    for (let i = 0; i < 10 && y === x; i++) y = randomWord(rng, 0, 3);
    return y === x ? [x, `${x}a`] : [x, y];
  };

  return [
    {
      id: 'equivalent',
      title: 'Equivalent or not?',
      make(rng) {
        const lang = pick(rng, LANGUAGES);
        const [x, y] = twoWords(rng) as [string, string];
        const z = suffix(lang, x, y);
        return {
          prompt: `L = L(${code(lang)}). Is ${w(x)} ≡ ${w(y)}: does every suffix z put both xz and yz in L, or both out?`,
          setup: [['load', lang]],
          answer: {
            kind: 'choice',
            options: ['Yes, equivalent', 'No, a suffix tells them apart'],
            correct: z === null ? 0 : 1,
          },
          explain:
            z === null
              ? `No suffix tells ${w(x)} from ${w(y)}: they are in the same class, and the minimal DFA sends both to the same state.`
              : `The suffix ${w(z)} does: one of ${w(x + z)} and ${w(y + z)} is in L and the other is not.`,
          watch: [['apart', `${x || 'eps'} ${y || 'eps'}`]],
        };
      },
    },
    {
      id: 'suffix',
      title: 'The shortest suffix',
      make(rng) {
        let lang = pick(rng, LANGUAGES);
        let [x, y] = twoWords(rng) as [string, string];
        let z = suffix(lang, x, y);
        for (let i = 0; i < 20 && (z === null || z === ''); i++) {
          [x, y] = twoWords(rng) as [string, string];
          z = suffix(lang, x, y);
        }
        if (z === null || z === '') {
          // a and b, for words ending in ab: told apart by b.
          [lang, x, y] = [LANGUAGES[0]!, 'a', 'b'];
          z = suffix(lang, x, y);
        }
        return {
          prompt: `L = L(${code(lang)}). How long is the shortest suffix z that puts exactly one of ${w(x)}z and ${w(y)}z in L?`,
          setup: [['load', lang]],
          answer: { kind: 'number', value: (z ?? '').length },
          explain: `${z === null ? 'None does: they are equivalent.' : `${w(z)}, of length ${(z ?? '').length}: ${w(x + z)} and ${w(y + z)} land on different sides of L, and no shorter suffix does that.`}`,
          watch: [['apart', `${x || 'eps'} ${y || 'eps'}`]],
        };
      },
    },
    {
      id: 'count',
      title: 'How many classes?',
      make(rng) {
        const lang = pick(rng, LANGUAGES);
        const p = end([['load', lang], ['classes']]).panel!;
        const n = p.kind === 'classes' ? p.reps.length : 0;
        const reps = p.kind === 'classes' ? p.reps.map(w).join(', ') : '';
        return {
          prompt: `L = L(${code(lang)}). How many classes does ≡_L have, counting the class of words that can never reach L if there is one? That is the number of states of the minimal complete DFA.`,
          setup: [['load', lang]],
          answer: { kind: 'number', value: n },
          explain: `${n} classes, one for each of the words ${reps}: they are pairwise told apart, and every other word is equivalent to one of them.`,
          watch: [['classes']],
        };
      },
    },
    {
      id: 'class-of',
      title: 'Which class?',
      make(rng) {
        const lang = pick(rng, LANGUAGES);
        const p = end([['load', lang], ['classes']]).panel!;
        const reps = p.kind === 'classes' ? p.reps : [''];
        const x = randomWord(rng, 2, 4);
        const at = reps.findIndex((r) => suffix(lang, x, r) === null);
        return {
          prompt: `L = L(${code(lang)}), whose classes are named by the words ${reps.map(w).join(', ')}. Which class is ${x} in?`,
          setup: [['load', lang], ['classes']],
          answer: {
            kind: 'choice',
            options: reps.map((r) => `[${w(r)}]`),
            correct: Math.max(0, at),
          },
          explain: `${x} ≡ ${w(reps[Math.max(0, at)]!)}: no suffix tells them apart. Follow ${x} through the minimal DFA and it ends in that class's state.`,
          watch:
            reps[Math.max(0, at)] === x
              ? [['classes']]
              : [['apart', `${x} ${reps[Math.max(0, at)] || 'eps'}`]],
        };
      },
    },
  ];
}
