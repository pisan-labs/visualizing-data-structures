import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { defaults, sideOf, type MMExtra, type MMSettings, type MMState } from './model';

type Def = VizDef<MMState, MMSettings, MMExtra>;

function distinct(rng: Rng, n: number): number[] {
  const out = new Set<number>();
  while (out.size < n) out.add(rng.int(1, 99));
  return [...out];
}

/** A min-max heap built from a random list, as the picture shows it. */
const setupOf = (rng: Rng, lo: number, hi: number): OpCall[] => [
  ['build', distinct(rng, rng.int(lo, hi)).join(' ')],
];

const keysIn = (setup: OpCall[]) => String(setup[0]![1]).split(' ').map(Number);

/**
 * Practice for min-max heaps, indexed from 1 with the root on a min level. Every answer comes
 * from running the model. `def` is a getter to avoid an import cycle.
 */
export function minMaxPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const freshKey = (rng: Rng, setup: OpCall[]) => {
    const used = keysIn(setup);
    for (;;) {
      const k = rng.int(1, 99);
      if (!used.includes(k)) return k;
    }
  };

  return [
    {
      id: 'where-is-max',
      title: 'Where is the largest key?',
      make(rng) {
        const setup = setupOf(rng, 5, 12);
        const before = run(setup).endState();
        const t = run([...setup, ['extractMax']]);
        const max = Number(t.entries[1]!.steps.at(-1)!.vars?.returned);
        const at = before.items.findIndex((x) => x.key === max) + 1;
        return {
          prompt: 'This min-max heap is indexed from 1. At which index is the largest key?',
          setup,
          answer: { kind: 'number', value: at },
          explain: `The root is on a min level, so the largest key is on the first max level: one of the root's two children. Here it is ${max} at A[${at}].`,
          watch: [['extractMax']],
        };
      },
    },
    {
      id: 'insert-index',
      title: 'Where does the new key end up?',
      make(rng) {
        const setup = setupOf(rng, 6, 12);
        const key = freshKey(rng, setup);
        const end = run([...setup, ['insert', key]]).endState();
        const at = end.items.findIndex((x) => x.key === key) + 1;
        return {
          prompt: `Run \`insert(${key})\` on this min-max heap, indexed from 1. At which index does ${key} end up?`,
          setup,
          answer: { kind: 'number', value: at },
          explain: `${key} first compares with its parent to pick the min levels or the max levels, then climbs through grandparents only. It stops at A[${at}].`,
          watch: [['insert', key]],
        };
      },
    },
    {
      id: 'insert-level',
      title: 'Min level or max level?',
      make(rng) {
        const setup = setupOf(rng, 4, 12);
        const key = freshKey(rng, setup);
        const end = run([...setup, ['insert', key]]).endState();
        const p = end.items.findIndex((x) => x.key === key);
        const side = sideOf(p, 'min');
        const options = ['On a min level', 'On a max level'];
        return {
          prompt: `Run \`insert(${key})\`. Does ${key} end on a min level or a max level?`,
          setup,
          answer: { kind: 'choice', options, correct: side === 'min' ? 0 : 1 },
          explain: `The first comparison, with the parent, decides: a key smaller than a max-level parent (or not larger than a min-level parent) stays on the min levels. ${key} ends on a ${side} level.`,
          watch: [['insert', key]],
        };
      },
    },
    {
      id: 'array-after-extract',
      title: 'What is the array after extract-min?',
      make(rng) {
        const setup = setupOf(rng, 5, 9);
        const end = run([...setup, ['extractMin']]).endState();
        const keys = end.items.map((x) => String(x.key));
        return {
          prompt: 'Run `extractMin()` and type the array afterwards, from A[1] on.',
          setup,
          answer: { kind: 'sequence', value: keys },
          explain: `The last key moves to the root and trickles down, jumping to the smallest grandchild each round and fixing the order with the parent between. The array ends as ${keys.join(', ')}.`,
          watch: [['extractMin']],
        };
      },
    },
  ];
}
