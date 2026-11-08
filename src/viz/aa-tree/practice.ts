import type { Rng } from '../../engine/rng';
import { Timeline, runOp } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { call, calls, distinct } from '../_bst/practice-kit';
import { preorderKeys } from '../_bst/tree-kit';
import { defaults, rootLevel, type AAExtra, type AASettings, type AAState } from './model';

type Def = VizDef<AAState, AASettings, AAExtra>;

/**
 * Practice for the AA tree. Every answer comes from running the model.
 * `def` is a getter to avoid an import cycle.
 */
export function aaPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const ins = (ks: number[]): OpCall[] => ks.map((k) => ['insert', k]);
  const after = (setup: OpCall[], c: OpCall) => {
    const t = run(setup);
    return runOp(def(), t.endState(), c, defaults, 1, t.entries.length);
  };

  return [
    {
      id: 'skews-splits',
      title: 'How many skews and splits?',
      make(rng: Rng) {
        const keys = distinct(rng, rng.int(5, 8));
        const setup = ins(keys.slice(0, -1));
        const k = keys.at(-1)!;
        const before = run(setup).endState();
        const e = after(setup, ['insert', k]);
        const sk = e.end.skews - before.skews;
        const sp = e.end.splits - before.splits;
        return {
          prompt: `Insert ${k} into the AA tree shown, ${call(['insert', k])}. How many skews and splits (that actually change the tree) does it take in all?`,
          setup,
          answer: { kind: 'number', value: sk + sp },
          explain: `${k} goes in as a leaf on level 1. On the way back up, ${sk} ${sk === 1 ? 'skew' : 'skews'} and ${sp} ${sp === 1 ? 'split' : 'splits'} change the tree: ${sk + sp} in all.`,
          watch: [['insert', k]],
        };
      },
    },
    {
      id: 'root',
      title: 'Which key is at the root?',
      make(rng: Rng) {
        const keys = distinct(rng, rng.int(5, 8));
        const setup = ins(keys.slice(0, 2));
        const ask = ins(keys.slice(2));
        const s = run([...setup, ...ask]).endState();
        const root = s.nodes[s.root!]!;
        return {
          prompt: `Starting from the AA tree shown, run ${calls(ask)}. Which key is at the root afterwards?`,
          setup,
          answer: { kind: 'number', value: root.key },
          explain: `Each split lifts a middle node a level; the last one to reach the top is the root: ${root.key}, on level ${root.level}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'root-level',
      title: 'How many levels?',
      make(rng: Rng) {
        const n = rng.int(6, 12);
        const keys = distinct(rng, n);
        const setup: OpCall[] = [];
        const ask = ins(keys);
        const lvl = rootLevel(run(ask).endState());
        return {
          prompt: `Insert ${calls(ask)} into an empty AA tree. On which level is the root afterwards?`,
          setup,
          answer: { kind: 'number', value: lvl },
          explain: `Only a split raises a level, and the root's level counts how many levels the tree has: ${lvl}. Like the black height of a red-black tree, it grows by one only when a split reaches the top.`,
          watch: ask,
        };
      },
    },
    {
      id: 'preorder',
      title: 'Preorder after deletes',
      make(rng: Rng) {
        const keys = distinct(rng, rng.int(6, 8));
        const setup = ins(keys);
        const gone = distinct(rng, 2, 0, keys.length - 1).map((i) => keys[i]!);
        const ask: OpCall[] = gone.map((k) => ['delete', k]);
        const order = preorderKeys(run([...setup, ...ask]).endState()).map(String);
        return {
          prompt: `Starting from the AA tree shown, run ${calls(ask)}. Type the keys in preorder afterwards.`,
          setup,
          answer: { kind: 'sequence', value: order },
          explain: `A delete removes a leaf (a neighbor stands in for an inner node), then lowers levels and skews and splits on the way up. Preorder: ${order.join(' ')}.`,
          watch: ask,
        };
      },
    },
  ];
}
