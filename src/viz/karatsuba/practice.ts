import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { combineText, defaults, type KaraSettings, type KaraState } from './model';

type Def = VizDef<KaraState, KaraSettings, undefined>;

/** Practice for Karatsuba. Every answer comes from running the model. */
export function karatsubaPractice(def: () => Def): PracticeKind[] {
  const end = (settings: KaraSettings, calls: OpCall[]): KaraState => {
    const t = new Timeline(def(), settings, 1, calls);
    return t.entries[t.entries.length - 1]!.steps.at(-1)!.state;
  };
  return [
    {
      id: 'split',
      title: 'Split the numbers',
      make(rng) {
        const x = rng.int(1000, 9999);
        const y = rng.int(1000, 9999);
        const root = end(defaults, [['multiply', x, y]]).calls[0]!;
        return {
          prompt: `Karatsuba multiplies ${x}·${y}. It splits both at m = ${root.m} digits. Type a, b, c and d, where x = a·10^m + b and y = c·10^m + d.`,
          setup: [['multiply', 12, 34]],
          answer: { kind: 'sequence', value: [root.a, root.b, root.c, root.d].map(String) },
          explain: `${x} = ${root.a}·${10 ** root.m} + ${root.b} and ${y} = ${root.c}·${10 ** root.m} + ${root.d}.`,
          watch: [['multiply', x, y]],
        };
      },
    },
    {
      id: 'middle',
      title: 'The middle term',
      make(rng) {
        const x = rng.int(10, 99);
        const y = rng.int(10, 99);
        const s = end(defaults, [['multiply', x, y]]);
        const root = s.calls[0]!;
        const got = s.got[1]!;
        const t = combineText(root, got, 'three');
        return {
          prompt: `For ${x}·${y}, Karatsuba found z2 = a·c = ${got.ac}, z0 = b·d = ${got.bd} and (a+b)(c+d) = ${got.sum}. What is z1?`,
          setup: [['multiply', 12, 34]],
          answer: { kind: 'number', value: t.z1 },
          explain: `${t.z1Text}, which is a·d + b·c = ${root.a}·${root.d} + ${root.b}·${root.c}. Then ${t.sum}.`,
          watch: [['multiply', x, y]],
        };
      },
    },
    {
      id: 'calls',
      title: 'How many calls?',
      make(rng) {
        const x = rng.int(10, 999);
        const y = rng.int(10, 99);
        const s = end(defaults, [['multiply', x, y]]);
        return {
          prompt: `How many calls does KARATSUBA(${x}, ${y}) make in all, counting the first one and every base case?`,
          setup: [],
          answer: { kind: 'number', value: s.calls.length },
          explain: `Every call that is not a base case makes three more. The tree for ${x}·${y} has ${s.calls.length} boxes, ${s.calls.filter((c) => c.m === 0).length} of them base cases.`,
          watch: [['multiply', x, y]],
        };
      },
    },
    {
      id: 'four',
      title: 'Four products per split',
      make(rng) {
        const x = rng.int(1000, 9999);
        const y = rng.int(1000, 9999);
        const four: KaraSettings = { split: 'four' };
        const s = end(four, [['multiply', x, y]]);
        const three = end(defaults, [['multiply', x, y]]);
        return {
          prompt: `With four products per split (no Karatsuba trick), how many single-digit products does ${x}·${y} take?`,
          setup: [],
          settings: four,
          answer: { kind: 'number', value: s.digitMults },
          explain: `Each split makes four half-size products: 4 at the first split, 16 at the next, all single digits. That is 4·4 = 16, as many as the schoolbook method. Karatsuba takes ${three.digitMults}.`,
          watch: [['multiply', x, y]],
        };
      },
    },
  ];
}
