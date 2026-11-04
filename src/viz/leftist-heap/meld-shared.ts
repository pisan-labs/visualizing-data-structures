/**
 * Pieces of the VizDef the leftist and skew heap pages share: presets, the code-tab driver
 * protocol, and practice questions. Every answer comes from running the page's own model.
 */
import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Preset, Settings, Step, VizDef } from '../../engine/types';
import { rightPath, type MeldExtra, type MeldSettings, type MeldState, type Variant } from './meld';

type Def = VizDef<MeldState, MeldSettings, MeldExtra>;
type MeldStep = Step<MeldState, MeldExtra>;

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
const asc = (keys: number[]) => [...keys].sort((a, b) => a - b);
const keyList = (keys: number[]) => keys.map((k) => `\`${k}\``).join(', ');
/** "a", "a and b", "a, b and c". */
const and = (xs: (string | number)[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

export function meldPresets(): Preset[] {
  return [
    { label: 'Random keys', make: (rng, n) => inserts(distinct(rng, n)) },
    { label: 'Ascending', make: (rng, n) => inserts(asc(distinct(rng, n))) },
    { label: 'Descending', make: (rng, n) => inserts(asc(distinct(rng, n)).reverse()) },
    {
      label: 'Many duplicates',
      make: (rng, n) => inserts(Array.from({ length: n }, () => 10 * rng.int(1, 4))),
    },
    {
      label: 'Two heaps, merged',
      make: (rng, n) => {
        const keys = distinct(rng, n);
        const half = Math.ceil(n / 2);
        return [...inserts(keys.slice(0, half)), ['merge', keys.slice(half).join(' ')]];
      },
    },
  ];
}

/**
 * Driver protocol for the code tabs. The code prints only what every correct implementation
 * agrees on: sizes and the keys handed back. Calls the model refuses (a key it cannot read, or
 * a heap past the size this page draws) are left out of the script.
 *   insert k          ->  n afterwards
 *   deletemin         ->  the key | "empty"
 *   merge k1 k2 ...   ->  n afterwards (the second heap is built by inserting k1, k2, ...)
 *   clear             ->  "ok"
 */
export function meldCodeScript(def: Def, calls: OpCall[], settings: Settings) {
  const t = new Timeline(def, settings as MeldSettings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e) => {
    const [op, ...args] = e.call;
    const last = e.steps[e.steps.length - 1]!;
    if (last.marks.some((m) => m.id === 'arg-box')) return;
    const v = last.vars ?? {};
    input.push([op, ...args.map((a) => String(a).trim())].join(' '));
    if (op === 'deletemin') expected.push(v.returned === undefined ? 'empty' : String(v.returned));
    else if (op === 'clear') expected.push('ok');
    else expected.push(String(v.N));
  });
  return { input, expected };
}

/** Practice questions. `def` is a getter to avoid an import cycle. */
export function meldPractice(variant: Variant, def: () => Def): PracticeKind[] {
  const leftist = variant === 'leftist';
  const name = `${variant} heap`;
  const lastOp = (cs: OpCall[]): MeldStep[] => {
    const t = new Timeline(def(), def().defaults, 1, cs);
    return t.entries[t.entries.length - 1]!.steps;
  };
  const heap = (rng: Rng, lo: number, hi: number) => {
    const keys = distinct(rng, rng.int(lo, hi));
    return { keys, setup: inserts(keys) };
  };

  const swaps: PracticeKind = {
    id: 'insert-swaps',
    title: 'How many child swaps does an insert make?',
    make(rng) {
      const { keys, setup } = heap(rng, 5, 8);
      const k = distinct(rng, 1, keys)[0]!;
      const steps = lastOp([...setup, ['insert', k]]);
      const end = steps[steps.length - 1]!;
      const count = Number(end.vars?.swaps);
      const path = (steps.find((st) => st.extra?.fixed === 1)?.extra?.path ?? []).map((u) =>
        String(end.state.nodes[u]!.key),
      );
      return {
        prompt: `Insert \`${k}\` into the ${name} shown. On the way back up the merge, how many nodes get their children swapped?`,
        setup,
        answer: { kind: 'number', value: count },
        explain: leftist
          ? `The merge path is ${and(path)}. Going back up, a node swaps its children only where npl(left) < npl(right): ${count} ${count === 1 ? 'time' : 'times'} here.`
          : `The merge path is ${and(path)}. A skew heap swaps the children of every node on it, so that is ${count}.`,
        watch: [['insert', k]],
      };
    },
  };

  const pathAfterDelete: PracticeKind = {
    id: 'right-path-after-delete',
    title: 'What is the right path after deleteMin?',
    make(rng) {
      const { setup } = heap(rng, 6, 9);
      const steps = lastOp([...setup, ['deletemin']]);
      const end = steps[steps.length - 1]!.state;
      const answer = rightPath(end, end.root).map(String);
      const min = steps[0]!.vars?.min;
      return {
        prompt: `Run \`deleteMin()\` on the ${name} shown. Type the keys on the right path of the result, from the root down, separated by spaces.`,
        setup,
        answer: { kind: 'sequence', value: answer },
        explain: `${min} goes, and its two subtrees merge. Following right children from the new root gives ${answer.join(', ')}.`,
        watch: [['deletemin']],
      };
    },
  };

  const leftAfterDelete: PracticeKind = {
    id: 'left-child-after-delete',
    title: 'Which key ends up as the left child of the root?',
    make(rng) {
      const { keys, setup } = heap(rng, 6, 9);
      const steps = lastOp([...setup, ['deletemin']]);
      const end = steps[steps.length - 1]!.state;
      const root = end.nodes[end.root!]!;
      const left = String(end.nodes[root.left!]!.key);
      const others = shuffle(
        rng,
        keys
          .map(String)
          .filter((x) => x !== left && x !== String(root.key) && x !== String(steps[0]!.vars?.min)),
      ).slice(0, 3);
      const options = shuffle(rng, [left, ...others]);
      return {
        prompt: `Run \`deleteMin()\` on the ${name} shown. Afterwards, which key is the left child of the root?`,
        setup,
        answer: { kind: 'choice', options, correct: options.indexOf(left) },
        explain: `The root becomes ${root.key}, the smaller of the two subtree roots. ${
          leftist
            ? 'Its children end up wherever the npl check on the way back up leaves them'
            : 'Every node on the merge path swaps its children on the way back up'
        }, so its left child is ${left}.`,
        watch: [['deletemin']],
      };
    },
  };

  const nplAfterMerge: PracticeKind = {
    id: 'npl-after-merge',
    title: 'What is the npl of the root after a merge?',
    make(rng) {
      const { keys, setup } = heap(rng, 4, 7);
      const list = distinct(rng, rng.int(3, 5), keys);
      const steps = lastOp([...setup, ['merge', list.join(' ')]]);
      const end = steps[steps.length - 1]!;
      const npl = Number(end.vars?.['npl(root)']);
      const path = rightPath(end.state, end.state.root);
      return {
        prompt: `Build a second ${name} by inserting ${keyList(list)} in that order, and merge it with the heap shown. What is the npl of the root afterwards? Here npl(nil) = −1.`,
        setup,
        answer: { kind: 'number', value: npl },
        explain: `The npl of a leftist heap's root is one less than the number of nodes on its right path. After the merge the right path is ${path.join(', ')}, so npl(root) = ${npl}.`,
        watch: [['merge', list.join(' ')]],
      };
    },
  };

  const mergePath: PracticeKind = {
    id: 'merge-path',
    title: 'Which nodes are on the merge path?',
    make(rng) {
      const { keys, setup } = heap(rng, 5, 8);
      const k = distinct(rng, 1, keys)[0]!;
      const steps = lastOp([...setup, ['insert', k]]);
      const final = steps[steps.length - 1]!.state;
      const pathStep = steps.find((st) => st.extra?.fixed === 1);
      const path = (pathStep?.extra?.path ?? []).map((u) => String(final.nodes[u]!.key));
      return {
        prompt: `Insert \`${k}\` into the ${name} shown. Type the keys whose children get swapped, top down.`,
        setup,
        answer: { kind: 'sequence', value: path },
        explain: `The merge walks down the right path, and the smaller root wins at each call: ${path.join(', ')}. Every winner swaps its children on the way back up.`,
        watch: [['insert', k]],
      };
    },
  };

  const NO_RIGHT = 'It has no right child';
  const rightAfterInsert: PracticeKind = {
    id: 'right-child-after-insert',
    title: 'Which key is the right child of the root after an insert?',
    make(rng) {
      const { keys, setup } = heap(rng, 5, 8);
      const k = distinct(rng, 1, keys)[0]!;
      const steps = lastOp([...setup, ['insert', k]]);
      const before = steps[0]!.state;
      const end = steps[steps.length - 1]!.state;
      const root = end.nodes[end.root!]!;
      const right = root.right === null ? NO_RIGHT : String(end.nodes[root.right]!.key);
      const old = before.nodes[before.root!]!;
      const near = [old.left, old.right]
        .filter((u): u is number => u !== null)
        .map((u) => String(before.nodes[u]!.key));
      const options = shuffle(
        rng,
        [right, String(k), ...near, NO_RIGHT].filter((x, i, all) => all.indexOf(x) === i),
      );
      const why =
        root.key === k
          ? `${k} is the new minimum, so it wins at once and the old heap becomes its right subtree. Then the swap moves it to the left, and the right side is empty.`
          : right === NO_RIGHT
            ? `The root ${root.key} wins the first call, its right subtree takes the merge, and then it swaps its children. Its left side was empty, so now its right side is.`
            : `The root ${root.key} wins the first call, its right subtree takes the merge, and then it swaps its children. So its old left child, ${right}, ends up on the right.`;
      return {
        prompt: `Insert \`${k}\` into the ${name} shown. Afterwards, which key is the right child of the root?`,
        setup,
        answer: { kind: 'choice', options, correct: options.indexOf(right) },
        explain: why,
        watch: [['insert', k]],
      };
    },
  };

  return leftist
    ? [swaps, nplAfterMerge, pathAfterDelete, leftAfterDelete]
    : [mergePath, rightAfterInsert, pathAfterDelete, leftAfterDelete];
}
