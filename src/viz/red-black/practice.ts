import type { Rng } from '../../engine/rng';
import { Timeline, runOp } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { call, calls, distinct, pick } from '../avl/practice';
import { inorderKeys } from '../avl/tree-kit';
import { defaults, treeBlackHeight, type RBExtra, type RBSettings, type RBState } from './model';

type Def = VizDef<RBState, RBSettings, RBExtra>;
type T = Timeline<RBState, RBSettings, RBExtra>;

const INSERT_CASES = [
  ['none', 'No fix needed: the parent is black'],
  ['1', 'Case 1: the uncle is red'],
  ['2', 'Case 2: the uncle is black and the path zigzags'],
  ['3', 'Case 3: the uncle is black and the path is straight'],
] as const;

const DELETE_CASES = [
  ['red', 'None: the color that leaves is red'],
  ['none', 'None: x is red or the root, so it just turns black'],
  ['1', 'Case 1: the sibling is red'],
  ['2', 'Case 2: the sibling and both of its children are black'],
  ['3', 'Case 3: the sibling is black, its near child red, its far child black'],
  ['4', 'Case 4: the sibling is black and its far child is red'],
] as const;

/**
 * Practice questions for the red-black tree. Every answer comes from running the model, so it
 * always agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function redBlackPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const then = (t: T, c: OpCall) => runOp(def(), t.endState(), c, defaults, 1, t.entries.length);
  const randomTree = (rng: Rng, lo: number, hi: number): OpCall[] =>
    distinct(rng, rng.int(lo, hi)).map((k) => ['insert', k]);
  /** The first fixup case an operation runs into, with the narration that names it. */
  const firstCase = (steps: { vars?: Record<string, unknown>; say: string }[]) => {
    const s = steps.find((x) => typeof x.vars?.case === 'number');
    return s ? { kind: String(s.vars!.case), say: s.say } : null;
  };

  return [
    {
      id: 'insert-case',
      title: 'Which insert case comes first?',
      make(rng) {
        const setup = randomTree(rng, 4, 8);
        const t = run(setup);
        const there = new Set(inorderKeys(t.endState()));
        const byCase = new Map<string, { k: number; say: string }[]>();
        for (let k = 1; k <= 99; k++) {
          if (there.has(k)) continue;
          const first = firstCase(then(t, ['insert', k]).steps);
          const kind = first?.kind ?? 'none';
          byCase.set(kind, [...(byCase.get(kind) ?? []), { k, say: first?.say ?? '' }]);
        }
        const kind = pick(rng, [...byCase.keys()]);
        const { k, say } = pick(rng, byCase.get(kind)!);
        const options = INSERT_CASES.map(([, label]) => label);
        return {
          prompt: `Insert ${k} into the red-black tree shown. Which case does the fixup run into first?`,
          setup,
          answer: { kind: 'choice', options, correct: INSERT_CASES.findIndex(([c]) => c === kind) },
          explain:
            kind === 'none'
              ? `${k} is added as a red leaf under a black parent, so no red node has a red child and the fixup loop never runs.`
              : say,
          watch: [['insert', k]],
        };
      },
    },
    {
      id: 'color-after',
      title: 'Red or black?',
      make(rng) {
        const setup = randomTree(rng, 4, 7);
        const t = run(setup);
        const there = new Set(inorderKeys(t.endState()));
        // Prefer an insert that does some fixing, so colors change.
        const fresh = distinct(rng, 30).filter((k) => !there.has(k));
        const busy = fresh.filter((k) => firstCase(then(t, ['insert', k]).steps));
        const k = busy.length ? pick(rng, busy) : fresh[0]!;
        const e = then(t, ['insert', k]);
        const keys = inorderKeys(e.end);
        const asked = pick(rng, keys);
        const node = Object.values(e.end.nodes).find((n) => n.key === asked)!;
        const options = ['Red', 'Black'];
        const correct = node.color === 'red' ? 0 : 1;
        const before = Object.values(t.endState().nodes).find((n) => n.key === asked);
        return {
          prompt: `Insert ${k} into the red-black tree shown. What color is ${asked} once the fixup is done?`,
          setup,
          answer: { kind: 'choice', options, correct },
          explain: before
            ? before.color === node.color
              ? `${asked} stays ${node.color}.`
              : `${asked} changes from ${before.color} to ${node.color} during the fixup.`
            : `${asked} is the new key. It starts red${node.color === 'black' ? ' and the fixup turns it black' : ' and stays red'}.`,
          watch: [['insert', k]],
        };
      },
    },
    {
      id: 'black-height',
      title: 'What is the black-height?',
      make(rng) {
        const setup = randomTree(rng, 1, 3);
        const there = new Set(setup.map(([, k]) => Number(k)));
        const fresh = distinct(rng, 12)
          .filter((k) => !there.has(k))
          .slice(0, rng.int(4, 7));
        const keys = rng.int(0, 1) ? [...fresh].sort((a, b) => a - b) : fresh;
        const ask: OpCall[] = keys.map((k) => ['insert', k]);
        const end = run([...setup, ...ask]).endState();
        const bh = treeBlackHeight(end) ?? 0;
        return {
          prompt: `Starting from the tree shown, run ${calls(ask)}. What is the black-height of the tree afterwards? Count the black nodes on a path from the root down to a NIL, counting the NIL but not the root.`,
          setup,
          answer: { kind: 'number', value: bh },
          explain: `Every path from the root ${end.nodes[end.root!]!.key} down to a NIL meets ${bh} black ${bh === 1 ? 'node' : 'nodes'}, the NIL included. The tree has ${inorderKeys(end).length} keys.`,
          watch: ask,
        };
      },
    },
    {
      id: 'delete-case',
      title: 'Which delete case comes first?',
      make(rng) {
        const setup = randomTree(rng, 5, 10);
        const t = run(setup);
        const keys = inorderKeys(t.endState());
        const byCase = new Map<string, { k: number; say: string }[]>();
        for (const k of keys) {
          const steps = then(t, ['delete', k]).steps;
          const first = firstCase(steps);
          const red = steps.some((s) => s.say.includes('The color that left was red'));
          const kind = first?.kind ?? (red ? 'red' : 'none');
          byCase.set(kind, [...(byCase.get(kind) ?? []), { k, say: first?.say ?? '' }]);
        }
        const kinds = [...byCase.keys()];
        const numbered = kinds.filter((c) => /\d/.test(c));
        const kind = numbered.length && rng.int(0, 3) > 0 ? pick(rng, numbered) : pick(rng, kinds);
        const { k, say } = pick(rng, byCase.get(kind)!);
        const options = DELETE_CASES.map(([, label]) => label);
        return {
          prompt: `Run ${call(['delete', k])} on the tree shown (a node with two children is replaced by its successor). Which case does the fixup run into first?`,
          setup,
          answer: {
            kind: 'choice',
            options,
            correct: DELETE_CASES.findIndex(([c]) => c === kind),
          },
          explain:
            kind === 'red'
              ? 'The node that leaves its spot is red, so no path loses a black node and the fixup never runs.'
              : kind === 'none'
                ? 'A black node leaves, but the child x that takes its place is red (or the root), so coloring x black is all it takes.'
                : say,
          watch: [['delete', k]],
        };
      },
    },
  ];
}
