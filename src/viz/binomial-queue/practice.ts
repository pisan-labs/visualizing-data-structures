import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import {
  binary,
  defaults,
  listFrom,
  tree,
  type BinExtra,
  type BinSettings,
  type BinState,
} from './model';

type Def = VizDef<BinState, BinSettings, BinExtra>;
type BinStep = Step<BinState, BinExtra>;

function distinct(rng: Rng, n: number, avoid: number[] = []): number[] {
  const out = new Set<number>();
  while (out.size < n) {
    const k = rng.int(1, 99);
    if (!avoid.includes(k)) out.add(k);
  }
  return [...out];
}

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const inserts = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k] as OpCall);
const keyList = (keys: number[]) => keys.map((k) => `\`${k}\``).join(', ');

/** The trees of a queue with n keys, largest first: "B₃, B₁ and B₀". */
function treesFor(n: number): string {
  const ks: string[] = [];
  for (let k = 0; 1 << k <= n; k++) if (n & (1 << k)) ks.push(tree(k));
  ks.reverse();
  if (ks.length === 0) return 'no trees';
  return ks.length === 1 ? ks[0]! : `${ks.slice(0, -1).join(', ')} and ${ks[ks.length - 1]}`;
}

/** The trees of a queue as the model has them, largest first. */
function treesIn(s: BinState): string {
  const ks = listFrom(s.nodes, s.head)
    .map((u) => s.nodes[u]!.degree)
    .sort((a, b) => b - a)
    .map(tree);
  if (ks.length === 0) return 'no trees';
  return ks.length === 1 ? ks[0]! : `${ks.slice(0, -1).join(', ')} and ${ks[ks.length - 1]}`;
}

/**
 * Practice questions for binomial queues. Every answer comes from running the model, so it
 * always agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function binomialPractice(def: () => Def): PracticeKind[] {
  const lastOp = (cs: OpCall[]): BinStep[] => {
    const t = new Timeline(def(), defaults, 1, cs);
    return t.entries[t.entries.length - 1]!.steps;
  };
  const queue = (rng: Rng, lo: number, hi: number) => {
    const keys = distinct(rng, rng.int(lo, hi));
    return { keys, setup: inserts(keys) };
  };
  const degrees = (s: BinState) => listFrom(s.nodes, s.head).map((u) => s.nodes[u]!.degree);

  return [
    {
      id: 'insert-links',
      title: 'How many links does an insert make?',
      make(rng) {
        const { keys, setup } = queue(rng, 3, 15);
        const k = distinct(rng, 1, keys)[0]!;
        const steps = lastOp([...setup, ['insert', k]]);
        const links = Number(steps[steps.length - 1]!.vars?.links);
        const n = keys.length;
        return {
          prompt: `The queue shown holds ${n} keys. Insert \`${k}\`. How many links does the insert make?`,
          setup,
          answer: { kind: 'number', value: links },
          explain:
            links === 0
              ? `n = ${n} = ${binary(n)}. Its last bit is 0, so adding 1 just sets it: no carry and no link. Afterwards n = ${binary(n + 1)}.`
              : `n = ${n} = ${binary(n)}. Adding 1 carries through the 1 bits at the right end, one link for each: ${links}. Afterwards n = ${binary(n + 1)}.`,
          watch: [['insert', k]],
        };
      },
    },
    {
      id: 'union-trees',
      title: 'Which trees does a union leave?',
      make(rng) {
        const { keys, setup } = queue(rng, 3, 9);
        const list = distinct(rng, rng.int(2, 7), keys);
        const steps = lastOp([...setup, ['merge', list.join(' ')]]);
        const end = steps[steps.length - 1]!.state;
        const ds = degrees(end).map(String);
        const a = keys.length;
        const b = list.length;
        return {
          prompt: `Build a second queue by inserting ${keyList(list)}, and unite it with the queue shown. Type the degrees of the trees in the result, smallest first, separated by spaces.`,
          setup,
          answer: { kind: 'sequence', value: ds },
          explain: `${a} + ${b} = ${a + b}, and in binary ${binary(a)} + ${binary(b)} = ${binary(a + b)}. Each 1 bit is a tree: degrees ${ds.join(', ')}.`,
          watch: [['merge', list.join(' ')]],
        };
      },
    },
    {
      id: 'extract-trees',
      title: 'How many trees after deleteMin?',
      make(rng) {
        const { keys, setup } = queue(rng, 4, 15);
        const steps = lastOp([...setup, ['deletemin']]);
        const trees = Number(steps[steps.length - 1]!.vars?.trees);
        const n = keys.length - 1;
        return {
          prompt: `Run \`extractMin()\` on the queue shown. How many trees does it have afterwards?`,
          setup,
          answer: { kind: 'number', value: trees },
          explain: `Whatever tree the minimum came from, the result holds n − 1 = ${n} keys, ${binary(n)} in binary, and a binomial queue has one tree per 1 bit: ${treesFor(n)}. That is ${trees}.`,
          watch: [['deletemin']],
        };
      },
    },
    {
      id: 'trees-after-insert',
      title: 'Which trees are there after an insert?',
      make(rng) {
        const { keys, setup } = queue(rng, 3, 14);
        const k = distinct(rng, 1, keys)[0]!;
        const steps = lastOp([...setup, ['insert', k]]);
        const end = steps[steps.length - 1]!.state;
        const right = treesIn(end);
        const options = shuffle(
          rng,
          [keys.length + 1, keys.length, keys.length + 2, keys.length - 1]
            .filter((m) => m > 0)
            .map(treesFor)
            .filter((x, i, all) => all.indexOf(x) === i),
        );
        return {
          prompt: `The queue shown holds ${keys.length} keys. Insert \`${k}\`. Which trees does it have afterwards?`,
          setup,
          answer: { kind: 'choice', options, correct: options.indexOf(right) },
          explain: `${keys.length} + 1 = ${keys.length + 1}, which is ${binary(keys.length + 1)}: one tree per 1 bit, ${right}.`,
          watch: [['insert', k]],
        };
      },
    },
  ];
}
