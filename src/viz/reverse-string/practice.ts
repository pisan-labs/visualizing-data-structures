import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { ordinal, plural } from '../_recursion/kit';
import { defaults, quote, type RevSettings, type RevState, type Variant } from './model';

type Def = VizDef<RevState, RevSettings, undefined>;

const WORDS = [
  'CAT',
  'CODE',
  'TREE',
  'LOOP',
  'NODE',
  'STACK',
  'FRAME',
  'ARRAY',
  'QUEUE',
  'GRAPH',
  'STRING',
  'RETURN',
  'SEARCH',
  'BRANCH',
  'PARSER',
];

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

const wordOf = (rng: Rng, lo: number, hi: number) => {
  const fit = WORDS.filter((w) => w.length >= lo && w.length <= hi);
  return pick(rng, fit);
};

/**
 * Practice questions for reversing a string. Every answer comes from running the model, so it
 * always agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function reversePractice(def: () => Def): PracticeKind[] {
  const steps = (variant: Variant, calls: OpCall[]): Step<RevState, undefined>[] => {
    const t = new Timeline(def(), { ...defaults, variant }, 1, calls);
    return t.entries[t.entries.length - 1]!.steps;
  };
  const result = (variant: Variant, w: string) =>
    String(steps(variant, [['reverse', w]]).at(-1)!.vars?.result);

  return [
    {
      id: 'smaller',
      title: 'Trust the smaller call',
      make(rng) {
        const w = wordOf(rng, 3, 6);
        const x = pick(rng, [...'BDGHMPWZ']);
        const longer = x + w;
        const known = result('rest', w);
        const value = result('rest', longer);
        return {
          prompt: `The picture shows \`reverse(${quote(w)})\` after it finished. What does \`reverse(${quote(longer)})\` return? Type the string without quotes.`,
          setup: [['reverse', w]],
          settings: { variant: 'rest' },
          answer: { kind: 'sequence', value: [value] },
          explain: `\`reverse(${quote(longer)})\` is \`reverse(${quote(w)})\` + ${quote(x)}, and the picture shows \`reverse(${quote(w)})\` = ${quote(known)}. So it returns ${quote(value)}.`,
          watch: [['reverse', longer]],
        };
      },
    },
    {
      id: 'depth',
      title: 'How deep does the stack get?',
      make(rng) {
        const variant: Variant = rng.int(0, 1) ? 'rest' : 'swap';
        const w = wordOf(rng, 4, 6);
        const deepest = Math.max(
          ...steps(variant, [['reverse', w]]).map((s) => s.state.stack.length),
        );
        const how =
          variant === 'rest'
            ? 'reverses the rest of the string first, then adds the first character'
            : 'swaps the two ends of the array, then reverses the part inside';
        return {
          prompt: `This version ${how}. It runs on ${quote(w)}, shown in the picture. At its deepest, how many reverse frames are on the stack at once? Do not count main.`,
          setup: [['load', w]],
          settings: { variant },
          answer: { kind: 'number', value: deepest },
          explain:
            variant === 'rest'
              ? `Each call peels off one character until one is left, so there is a frame for every character: ${plural(deepest, 'frame')}, all waiting at once.`
              : `Each call handles two characters, one from each end, until i meets or passes j. For ${w.length} characters that is ${plural(deepest - 1, 'swap')} plus the base case: ${plural(deepest, 'frame')}.`,
          watch: [['reverse', w]],
        };
      },
    },
    {
      id: 'partial',
      title: 'What does this call return?',
      make(rng) {
        const w = wordOf(rng, 4, 7);
        const k = rng.int(1, w.length - 2);
        const suffix = w.slice(k);
        const run = steps('rest', [['reverse', w]]);
        const end = run.at(-1)!.state;
        const call = end.calls.find((c) => c.i === k)!;
        const value = end.result[call.id]!;
        return {
          prompt: `\`reverse(${quote(w)})\` runs on the string shown, reversing the rest first. What does the call \`reverse(${quote(suffix)})\` hand back to its caller? Type the string without quotes.`,
          setup: [['load', w]],
          settings: { variant: 'rest' },
          answer: { kind: 'sequence', value: [value] },
          explain: `Each call returns the reverse of its own part of the string, nothing more. The call on ${quote(suffix)} returns ${quote(value)}, and its caller adds ${quote(w[k - 1]!)} after that.`,
          watch: [['reverse', w]],
        };
      },
    },
    {
      id: 'swaps',
      title: 'The array after some swaps',
      make(rng) {
        const w = wordOf(rng, 5, 6);
        const k = rng.int(1, 2);
        const run = steps('swap', [['reverse', w]]);
        const after = run.filter((s) => s.lines.includes('swap'))[k - 1]!;
        const chars = after.state.cells.map((c) => c.ch);
        return {
          prompt: `\`reverse(A, 0, ${w.length - 1})\` runs on the array shown, swapping the ends first. What does A hold after the ${ordinal(k)} swap? Type the characters in order, separated by spaces.`,
          setup: [['load', w]],
          settings: { variant: 'swap' },
          answer: { kind: 'sequence', value: chars },
          explain: `The ${ordinal(1)} call swaps A[0] and A[${w.length - 1}]${k === 2 ? `, and the ${ordinal(2)} swaps A[1] and A[${w.length - 2}]` : ''}. Everything in between is untouched so far: ${chars.join(' ')}.`,
          watch: [['reverse', w]],
        };
      },
    },
  ];
}
