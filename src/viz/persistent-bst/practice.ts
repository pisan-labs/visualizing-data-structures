import type { Rng } from '../../engine/rng';
import { Timeline, runOp } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { call, calls, distinct } from '../_bst/practice-kit';
import {
  defaults,
  keysOf,
  reach,
  type PersistentExtra,
  type PersistentSettings,
  type PersistentState,
} from './model';

type Def = VizDef<PersistentState, PersistentSettings, PersistentExtra>;

/**
 * Practice for the persistent BST. Every answer comes from running the model.
 * `def` is a getter to avoid an import cycle.
 */
export function persistentPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const ins = (ks: number[]): OpCall[] => ks.map((k) => ['insert', k]);
  const after = (setup: OpCall[], c: OpCall) => {
    const t = run(setup);
    return runOp(def(), t.endState(), c, defaults, 1, t.entries.length);
  };
  const count = (s: PersistentState) => Object.keys(s.nodes).length;

  return [
    {
      id: 'new-nodes',
      title: 'How many new nodes?',
      make(rng: Rng) {
        const keys = distinct(rng, rng.int(4, 6));
        const setup = ins(keys.slice(0, -1));
        const k = keys.at(-1)!;
        const before = run(setup).endState();
        const e = after(setup, ['insert', k]);
        const made = count(e.end) - count(before);
        return {
          prompt: `Run ${call(['insert', k])} on the newest version shown. How many new nodes does path copying make?`,
          setup,
          answer: { kind: 'number', value: made },
          explain: `One new leaf for ${k}, plus a copy of every node on the path from the root down to its parent: ${made} in all. Everything off the path is shared.`,
          watch: [['insert', k]],
        };
      },
    },
    {
      id: 'total-nodes',
      title: 'Nodes in all versions',
      make(rng: Rng) {
        const keys = distinct(rng, rng.int(3, 5));
        const setup: OpCall[] = [];
        const ask = ins(keys);
        const total = count(run(ask).endState());
        return {
          prompt: `Starting from the empty v0, run ${calls(ask)}, each making a new version. How many nodes exist in all versions together?`,
          setup,
          answer: { kind: 'number', value: total },
          explain: `Each insert makes as many nodes as the depth of the new key plus one, and none is ever thrown away while its version lives: ${total} in all, against ${(keys.length * (keys.length + 1)) / 2} for full copies of every version.`,
          watch: ask,
        };
      },
    },
    {
      id: 'shared',
      title: 'What do two versions share?',
      make(rng: Rng) {
        const keys = distinct(rng, rng.int(5, 6));
        const setup = ins(keys.slice(0, -1));
        const k = keys.at(-1)!;
        const s = after(setup, ['insert', k]).end;
        const last = s.versions.length - 1;
        const a = new Set(reach(s, s.versions[last - 1]!.root));
        const shared = reach(s, s.versions[last]!.root).filter((u) => a.has(u)).length;
        return {
          prompt: `Run ${call(['insert', k])} on the newest version shown, making v${last}. How many nodes do v${last - 1} and v${last} share?`,
          setup,
          answer: { kind: 'number', value: shared },
          explain: `v${last} copies the path down to ${k} and shares everything else with v${last - 1}: ${shared} ${shared === 1 ? 'node' : 'nodes'}.`,
          watch: [['insert', k]],
        };
      },
    },
    {
      id: 'old-keys',
      title: 'Keys in an old version',
      make(rng: Rng) {
        const keys = distinct(rng, rng.int(4, 5));
        const setup = ins(keys);
        const gone = keys[rng.int(0, keys.length - 1)]!;
        const v = rng.int(1, keys.length - 1);
        const ask: OpCall[] = [
          ['delete', gone],
          ['view', v],
        ];
        const s = run([...setup, ...ask]).endState();
        const order = keysOf(s, v).map(String);
        return {
          prompt: `Run ${calls(ask)}. Type the keys of v${v} in sorted order.`,
          setup,
          answer: { kind: 'sequence', value: order },
          explain: `The delete made a new version and changed nothing old, so v${v} still holds the first ${v} keys inserted: ${order.join(' ')}.`,
          watch: ask,
        };
      },
    },
  ];
}
