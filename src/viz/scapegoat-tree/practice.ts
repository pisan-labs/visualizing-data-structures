import type { Rng } from '../../engine/rng';
import { Timeline, runOp } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { call, calls, distinct } from '../_bst/practice-kit';
import { preorderKeys } from '../_bst/tree-kit';
import { nodeShapeId } from '../../layouts/binary-tree';
import {
  defaults,
  type ScapegoatExtra,
  type ScapegoatSettings,
  type ScapegoatState,
} from './model';

type Def = VizDef<ScapegoatState, ScapegoatSettings, ScapegoatExtra>;

/**
 * Practice for the scapegoat tree, with α = 2/3. Every answer comes from running the model.
 * `def` is a getter to avoid an import cycle.
 */
export function scapegoatPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const ins = (ks: number[]): OpCall[] => ks.map((k) => ['insert', k]);
  const after = (setup: OpCall[], c: OpCall) => {
    const t = run(setup);
    return runOp(def(), t.endState(), c, defaults, 1, t.entries.length);
  };

  return [
    {
      id: 'scapegoat',
      title: 'Find the scapegoat',
      make(rng: Rng) {
        // Rising keys with a little noise push new keys deep on the right.
        for (;;) {
          const n = rng.int(4, 7);
          const keys = distinct(rng, n + 1, 1, 99).sort((a, b) => a - b);
          if (rng.int(0, 1)) [keys[0], keys[1]] = [keys[1]!, keys[0]!];
          const setup = ins(keys.slice(0, -1));
          const k = keys.at(-1)!;
          const e = after(setup, ['insert', k]);
          const goatStep = e.steps.find((st) => st.lines.includes('ins.goat') && st.level === 1);
          if (!goatStep) continue;
          const id = goatStep.marks.find((m) => m.role === 'error')!.id;
          const uid = Number(id.slice(nodeShapeId('').length));
          const goat = goatStep.state.nodes[uid]!.key;
          return {
            prompt: `Insert ${k} into the scapegoat tree shown (α = 2/3), ${call(['insert', k])}. It lands too deep. Which key is the scapegoat, the first ancestor on the way up whose child holds more than 2/3 of its subtree?`,
            setup,
            answer: { kind: 'number', value: goat },
            explain: `Walk up from ${k}, adding up subtree sizes. At ${goat} the child on the path holds more than 2/3 of ${goat}'s subtree for the first time, so ${goat} is the scapegoat and its subtree is rebuilt.`,
            watch: [['insert', k]],
          };
        }
      },
    },
    {
      id: 'limit',
      title: 'How deep may a node sit?',
      make(rng: Rng) {
        const n = rng.int(3, 12);
        const keys = distinct(rng, n, 1, 99);
        const setup = ins(keys);
        const t = run(setup);
        const v = t.at(t.length - 1).step.vars ?? {};
        const limit = Number(v.limit);
        return {
          prompt: `The scapegoat tree shown has N = ${n} keys and α = 2/3. What is the deepest a node may sit (counting the root as depth 0) before an insert looks for a scapegoat?`,
          setup,
          answer: { kind: 'number', value: limit },
          explain: `The limit is ⌊log base 3/2 of N⌋: the largest d with 1.5^d ≤ ${n}. That is ${limit}, since 1.5^${limit} = ${(1.5 ** limit).toFixed(2)} ≤ ${n} < 1.5^${limit + 1} = ${(1.5 ** (limit + 1)).toFixed(2)}.`,
        };
      },
    },
    {
      id: 'preorder',
      title: 'Preorder after a rebuild',
      make(rng: Rng) {
        const n = rng.int(5, 7);
        const keys = distinct(rng, n, 1, 99).sort((a, b) => a - b);
        const setup: OpCall[] = [];
        const ask = ins(keys);
        const order = preorderKeys(run(ask).endState()).map(String);
        return {
          prompt: `Insert ${calls(ask)} into an empty scapegoat tree with α = 2/3. Type the keys in preorder afterwards.`,
          setup,
          answer: { kind: 'sequence', value: order },
          explain: `Rising keys build a chain on the right until one lands deeper than ⌊log base 3/2 of N⌋. Then the scapegoat's subtree is rebuilt with its middle key on top. Preorder: ${order.join(' ')}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'full-rebuild',
      title: 'Which delete rebuilds everything?',
      make(rng: Rng) {
        const n = rng.int(6, 10);
        const keys = distinct(rng, n, 1, 99);
        const setup = ins(keys);
        const order = distinct(rng, n, 0, n - 1).map((i) => keys[i]!);
        const dels: OpCall[] = order.map((k) => ['delete', k]);
        const t = run([...setup, ...dels]);
        const first = t.entries
          .slice(setup.length)
          .findIndex((e) => e.steps.some((st) => st.lines.includes('del.all')));
        const count = first + 1;
        const ask = dels.slice(0, count);
        return {
          prompt: `The tree shown holds ${n} keys, so max N = ${n}. Delete ${calls(dels.slice(0, Math.max(count + 1, 3)))} in that order. After how many of these deletes is the whole tree rebuilt (α = 2/3)?`,
          setup,
          answer: { kind: 'number', value: count },
          explain: `The whole tree is rebuilt as soon as N < 2/3 × max N = 2/3 × ${n}. That first happens when N = ${n - count}, after ${count} deletes.`,
          watch: ask,
        };
      },
    },
  ];
}
