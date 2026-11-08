import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { conv, defaults, type DHeapExtra, type DHeapSettings, type DHeapState } from './model';

type Def = VizDef<DHeapState, DHeapSettings, DHeapExtra>;

function distinct(rng: Rng, n: number, avoid: number[] = []): number[] {
  const out = new Set<number>();
  while (out.size < n) {
    const k = rng.int(1, 99);
    if (!avoid.includes(k)) out.add(k);
  }
  return [...out];
}

function randomSettings(rng: Rng): DHeapSettings {
  return {
    ...defaults,
    d: rng.int(2, 4),
    order: rng.int(0, 2) ? 'max' : 'min',
    index: rng.int(0, 2) ? 'one' : 'zero',
  };
}

const heapName = (st: DHeapSettings) => {
  const K = conv(st);
  return `${K.kind} indexed from ${K.base}`;
};

/**
 * Practice for d-ary heaps. Every answer comes from running the model. `def` is a getter to
 * avoid an import cycle.
 */
export function dAryPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], st: DHeapSettings) => new Timeline(def(), st, 1, cs);
  const lastStep = (cs: OpCall[], st: DHeapSettings) => {
    const t = run(cs, st);
    const steps = t.entries[t.entries.length - 1]!.steps;
    return steps[steps.length - 1]!;
  };
  const setupOf = (rng: Rng, lo: number, hi: number, avoid: number[] = []): OpCall[] => [
    ['build', distinct(rng, rng.int(lo, hi), avoid).join(' ')],
  ];

  return [
    {
      id: 'insert-index',
      title: 'Where does the new key end up?',
      make(rng) {
        const settings = randomSettings(rng);
        const setup = setupOf(rng, 5, 10);
        const key = distinct(rng, 1, String(setup[0]![1]).split(' ').map(Number))[0]!;
        const end = run([...setup, ['insert', key]], settings).endState();
        const p = end.items.findIndex((x) => x.key === key);
        const K = conv(settings);
        return {
          prompt: `This is a ${heapName(settings)}. Run \`insert(${key})\`. At which index does ${key} end up?`,
          setup,
          settings,
          answer: { kind: 'number', value: K.ix(p) },
          explain: `${key} starts in the first free slot and swaps with its parent while it is ${K.bigger}. It stops at A[${K.ix(p)}].`,
          watch: [['insert', key]],
        };
      },
    },
    {
      id: 'extract-comparisons',
      title: 'How many comparisons does extract make?',
      make(rng) {
        const settings = randomSettings(rng);
        const setup = setupOf(rng, 6, 12);
        const end = lastStep([...setup, ['extract']], settings);
        const n = Number(end.vars?.comparisons);
        const K = conv(settings);
        return {
          prompt: `This is a ${heapName(settings)}. How many key comparisons does \`${K.extract}()\` make? Count each comparison of the moving key or the best so far with a child.`,
          setup,
          settings,
          answer: { kind: 'number', value: n },
          explain: `On each level the sift-down compares the best so far with every child that exists: up to ${K.d} per level. Here that adds up to ${n}.`,
          watch: [['extract']],
        };
      },
    },
    {
      id: 'array-after-extract',
      title: 'What is the array after extract?',
      make(rng) {
        const settings = randomSettings(rng);
        const setup = setupOf(rng, 5, 9);
        const end = run([...setup, ['extract']], settings).endState();
        const keys = end.items.map((x) => String(x.key));
        const K = conv(settings);
        return {
          prompt: `This is a ${heapName(settings)}. Run \`${K.extract}()\` and type the array afterwards, from A[${K.base}] on.`,
          setup,
          settings,
          answer: { kind: 'sequence', value: keys },
          explain: `The last key moves to the root and sifts down, swapping with its ${K.largest} child each time. The array ends as ${keys.join(', ')}.`,
          watch: [['extract']],
        };
      },
    },
    {
      id: 'update-root',
      title: 'Which key is on top after the update?',
      make(rng) {
        const settings = randomSettings(rng);
        const setup = setupOf(rng, 6, 11);
        const n = String(setup[0]![1]).split(' ').length;
        const K = conv(settings);
        const i = K.ix(rng.int(1, n - 1));
        const key = K.max ? rng.int(1, 120) : rng.int(-20, 99);
        const end = run([...setup, ['update', i, key]], settings).endState();
        const root = String(end.items[0]!.key);
        const before = run(setup, settings).endState();
        const options = [
          ...new Set([
            root,
            String(before.items[0]!.key),
            String(key),
            String(before.items[i - K.base]!.key),
          ]),
        ];
        const sorted = options.sort((a, b) => Number(a) - Number(b));
        return {
          prompt: `This is a ${heapName(settings)}. Run \`updateKey(${i}, ${key})\`. Which key is at the root afterwards?`,
          setup,
          settings,
          answer:
            sorted.length >= 2
              ? { kind: 'choice', options: sorted, correct: sorted.indexOf(root) }
              : { kind: 'number', value: Number(root) },
          explain: `A key that moves toward the top sifts up one comparison per level; one that moves away sifts down. The root ends as ${root}.`,
          watch: [['update', i, key]],
        };
      },
    },
  ];
}
