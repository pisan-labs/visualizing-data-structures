import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import {
  defaults,
  leavesOf,
  show,
  textOf,
  type RopeExtra,
  type RopeSettings,
  type RopeState,
} from './model';

type Def = VizDef<RopeState, RopeSettings, RopeExtra>;

const TEXTS = [
  'the quick brown fox',
  'ropes share subtrees',
  'split and concat',
  'a tree of short pieces',
  'insert in the middle',
  'weights count left',
];

/**
 * Practice for ropes. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function ropePractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const setupOf = (rng: Rng): OpCall[] => [['load', TEXTS[rng.int(0, TEXTS.length - 1)]!]];

  return [
    {
      id: 'index-char',
      title: 'Which character is at index i?',
      make(rng) {
        const setup = setupOf(rng);
        const text = String(setup[0]![1]);
        const i = rng.int(0, text.length - 1);
        const t = run([...setup, ['index', i]]);
        const ch = show(String(t.entries[1]!.steps.at(-1)!.vars?.returned));
        const pool = [...new Set([...text].map(show))].filter((c) => c !== ch);
        const options = [ch, ...pool.slice(0, 3)].sort();
        return {
          prompt: `Follow the weights from the root. What does \`index(${i})\` return? (␣ is a space.)`,
          setup,
          answer: { kind: 'choice', options, correct: options.indexOf(ch) },
          explain: `At each node, go left if i is less than the weight; otherwise subtract the weight and go right. The leaf holds "${ch}" at that spot.`,
          watch: [['index', i]],
        };
      },
    },
    {
      id: 'index-visits',
      title: 'How many nodes does index visit?',
      make(rng) {
        const setup = setupOf(rng);
        const text = String(setup[0]![1]);
        const i = rng.int(0, text.length - 1);
        const t = run([...setup, ['index', i]]);
        const visited = Number(t.entries[1]!.steps.at(-1)!.vars?.['nodes visited']);
        return {
          prompt: `How many nodes does \`index(${i})\` visit, counting the root and the leaf?`,
          setup,
          answer: { kind: 'number', value: visited },
          explain: `One node per level, from the root down to the leaf that holds position ${i}: ${visited}.`,
          watch: [['index', i]],
        };
      },
    },
    {
      id: 'root-weight',
      title: 'What is the new root’s weight?',
      make(rng) {
        const setup = setupOf(rng);
        const word = ['abc', 'xy', 'hello', 'end'][rng.int(0, 3)]!;
        const end = run([...setup, ['append', word]]).endState();
        const root = end.nodes[end.root!]!;
        const w = end.nodes[root.left!]!.len;
        return {
          prompt: `Run \`append("${word}")\`. What is the weight of the new root?`,
          setup,
          answer: { kind: 'number', value: w },
          explain: `Append makes a new root with the old rope on its left, so its weight is the old rope's length, ${w}.`,
          watch: [['append', word]],
        };
      },
    },
    {
      id: 'leaves-after-insert',
      title: 'How many leaves after an insert?',
      make(rng) {
        const setup = setupOf(rng);
        const text = String(setup[0]![1]);
        const i = rng.int(1, text.length - 1);
        const before = run(setup).endState();
        const end = run([...setup, ['insert', i, 'XY']]).endState();
        const n = leavesOf(end.nodes, end.root).length;
        const was = leavesOf(before.nodes, before.root).length;
        return {
          prompt: `The rope has ${was} leaves. Run \`insert(${i}, "XY")\`. How many leaves does it have afterwards?`,
          setup,
          answer: { kind: 'number', value: n },
          explain:
            n === was + 2
              ? `Position ${i} is inside a leaf, so split cuts that leaf in two, and the new text adds one more: ${n}. The text is now "${textOf(end.nodes, end.root)}".`
              : `Position ${i} falls between two leaves, so no leaf is cut; only the new leaf is added: ${n}.`,
          watch: [['insert', i, 'XY']],
        };
      },
    },
  ];
}
