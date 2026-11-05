import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import {
  defaults,
  totalBits,
  treeName,
  type HuffExtra,
  type HuffSettings,
  type HuffState,
} from './model';

type Def = VizDef<HuffState, HuffSettings, HuffExtra>;

const code = (s: string) => `\`${s}\``;
const LETTERS = 'abcdefgh';

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** k symbols a, b, c... with random counts from lo to hi, as symbol:count pairs. */
function randomPairs(rng: Rng, k: number, lo: number, hi: number): string {
  return Array.from({ length: k }, (_, i) => `${LETTERS[i]}:${rng.int(lo, hi)}`).join(' ');
}

const ruleSentence = (ties: HuffSettings['ties']) =>
  ties === 'leaves'
    ? 'When weights tie, leaves come first (a before b...), then merged trees, oldest first.'
    : 'When weights tie, merged trees come first (oldest first), then leaves (a before b...).';

const merges = (n: number): OpCall[] => Array.from({ length: n }, () => ['merge'] as OpCall);

/**
 * Practice questions for Huffman coding. Every answer comes from running the model, so it always
 * agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function huffmanPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: HuffSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);
  const randomRule = (rng: Rng): HuffSettings => ({
    ...defaults,
    ties: rng.int(0, 2) ? 'leaves' : 'merged',
  });

  return [
    {
      id: 'code-of',
      title: 'What is the code of this symbol?',
      make(rng) {
        const settings = randomRule(rng);
        const k = rng.int(4, 5);
        const setup: OpCall[] = [['load', randomPairs(rng, k, 1, 12)]];
        const watch = merges(k - 1);
        const end = run([...setup, ...watch], settings).endState();
        const sym = LETTERS[rng.int(0, k - 1)]!;
        const answer = end.codes![sym]!;
        return {
          prompt: `Build the Huffman tree from the leaves shown: take the two lightest trees, merge them, put the result back. The first tree out goes left (0). ${ruleSentence(settings.ties)} What is the code of ${code(sym)}? Type its bits, such as 010.`,
          setup,
          settings,
          answer: { kind: 'sequence', value: [answer] },
          explain: `After ${k - 1} merges one tree is left. The path from its root down to ${sym} goes ${[...answer].map((b) => (b === '0' ? 'left' : 'right')).join(', ')}, so its code is ${answer}.`,
          watch,
        };
      },
    },
    {
      id: 'total-bits',
      title: 'How many bits does the encoding take?',
      make(rng) {
        const k = rng.int(3, 5);
        const setup: OpCall[] = [['build', randomPairs(rng, k, 1, 9)]];
        const end = run(setup).endState();
        const total = totalBits(end);
        const terms = end.freq.map(([s, n]) => `${n} × ${end.codes![s]!.length}`);
        return {
          prompt: `The counts are under the leaves and the codes are in the table. How many bits does the whole encoded message take?`,
          setup,
          answer: { kind: 'number', value: total },
          explain: `Each symbol costs its count times the length of its code: ${terms.join(' + ')} = ${total}. Any Huffman tree for these counts gives the same total, whatever the tie rule.`,
          watch: [['encode']],
        };
      },
    },
    {
      id: 'next-merge',
      title: 'Which two trees are merged next?',
      make(rng) {
        for (;;) {
          const settings = randomRule(rng);
          const k = rng.int(4, 6);
          const done = rng.int(0, k - 3);
          const setup: OpCall[] = [['load', randomPairs(rng, k, 1, 4)], ...merges(done)];
          const s = run(setup, settings).endState();
          if (s.queue.length < 3) continue;
          const name = (a: number, b: number) =>
            `${treeName(s, s.queue[a]!)} and ${treeName(s, s.queue[b]!)}`;
          const right = name(0, 1);
          const wrong = [name(0, 2), name(1, 2)];
          if (s.queue.length > 3) wrong.push(name(2, 3));
          const options = shuffle(rng, [...new Set([right, ...wrong])]);
          const [x, y] = s.queue;
          const tie = s.nodes[s.queue[1]!]!.weight === s.nodes[s.queue[2]!]!.weight;
          return {
            prompt: `The queue shows the trees left, lightest first. ${ruleSentence(settings.ties)} Which two trees does the next merge take?`,
            setup,
            settings,
            answer: { kind: 'choice', options, correct: options.indexOf(right) },
            explain: `The two lightest trees are ${treeName(s, x!)} and ${treeName(s, y!)}${tie ? `, by the tie rule: ${treeName(s, s.queue[2]!)} weighs the same but comes later` : ''}.`,
            watch: [['merge']],
          };
        }
      },
    },
    {
      id: 'decode',
      title: 'Decode these bits',
      make(rng) {
        const k = rng.int(3, 5);
        const setup: OpCall[] = [['build', randomPairs(rng, k, 1, 9)]];
        const end = run(setup).endState();
        const length = rng.int(3, 5);
        const message = Array.from({ length }, () => LETTERS[rng.int(0, k - 1)]!).join('');
        const bits = [...message].map((s) => end.codes![s]!).join('');
        const steps = run([...setup, ['decode', bits]]).entries.at(-1)!.steps;
        const out = String(steps.at(-1)!.vars?.out ?? '');
        return {
          prompt: `Decode ${code(bits)} with the tree shown. Type the message.`,
          setup,
          answer: { kind: 'sequence', value: [out] },
          explain: `Start at the root, go left on 0 and right on 1, and write the symbol at each leaf before going back to the root: ${[...message].map((s) => `${end.codes![s]} → ${s}`).join(', ')}.`,
          watch: [['decode', bits]],
        };
      },
    },
  ];
}
