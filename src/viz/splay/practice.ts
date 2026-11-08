import type { Rng } from '../../engine/rng';
import { Timeline, runOp } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { call, distinct, pick } from '../_bst/practice-kit';
import { inorderKeys, preorderKeys, treeHeight } from '../_bst/tree-kit';
import { defaults, type SplayExtra, type SplaySettings, type SplayState } from './model';

type Def = VizDef<SplayState, SplaySettings, SplayExtra>;
type T = Timeline<SplayState, SplaySettings, SplayExtra>;

const STEPS = ['Zig', 'Zig-zig', 'Zig-zag'];

/**
 * Practice questions for the splay tree. Every answer comes from running the model, so it always
 * agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function splayPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const then = (t: T, c: OpCall) => runOp(def(), t.endState(), c, defaults, 1, t.entries.length);
  const randomTree = (rng: Rng, lo: number, hi: number): OpCall[] =>
    distinct(rng, rng.int(lo, hi)).map((k) => ['insert', k]);
  const rootKey = (s: SplayState) => s.nodes[s.root!]!.key;

  return [
    {
      id: 'root-after-miss',
      title: 'Where does a missed search end?',
      make(rng) {
        const setup = randomTree(rng, 5, 8);
        const t = run(setup);
        const there = new Set(inorderKeys(t.endState()));
        const missing = distinct(rng, 30).filter((k) => !there.has(k));
        const k = pick(rng, missing.slice(0, 10));
        const e = then(t, ['search', k]);
        const root = rootKey(e.end);
        return {
          prompt: `Run ${call(['search', k])} on the splay tree shown. ${k} is not in the tree. Which key is at the root afterwards?`,
          setup,
          answer: { kind: 'number', value: root },
          explain: `The search falls off the tree below ${root}, the last node it visits, and a splay tree splays that node to the root even when the search fails.`,
          watch: [['search', k]],
        };
      },
    },
    {
      id: 'first-step',
      title: 'Which splay step comes first?',
      make(rng) {
        const setup = randomTree(rng, 5, 8);
        const t = run(setup);
        const s = t.endState();
        // Any key below the root will do; pick by the first step it needs, for variety.
        const byStep = new Map<string, number[]>();
        for (const k of inorderKeys(s)) {
          if (k === rootKey(s)) continue;
          const first = then(t, ['search', k]).steps.find((x) => x.vars?.case !== undefined);
          const kind = String(first!.vars!.case);
          byStep.set(kind, [...(byStep.get(kind) ?? []), k]);
        }
        const kind = pick(rng, [...byStep.keys()]);
        const k = pick(rng, byStep.get(kind)!);
        const correct = ['zig', 'zig-zig', 'zig-zag'].indexOf(kind);
        const say = then(t, ['search', k]).steps.find((x) => x.vars?.case === kind)!.say;
        return {
          prompt: `Run ${call(['search', k])} on the splay tree shown. Which step does the splay of ${k} start with?`,
          setup,
          answer: { kind: 'choice', options: STEPS, correct },
          explain: say,
          watch: [['search', k]],
        };
      },
    },
    {
      id: 'height-after',
      title: 'How tall after one deep search?',
      make(rng) {
        const keys = distinct(rng, rng.int(5, 8)).sort((a, b) => a - b);
        const setup: OpCall[] = keys.map((k) => ['insert', k]);
        const k = keys[0]!;
        const t = run(setup);
        const e = then(t, ['search', k]);
        const h = treeHeight(e.end);
        return {
          prompt: `Sorted inserts made the chain shown, of height ${treeHeight(t.endState())}. Run ${call(['search', k])}. What is the height of the tree afterwards?`,
          setup,
          answer: { kind: 'number', value: h },
          explain: `Splaying ${k} from the bottom of the chain folds the path as it goes: the height drops from ${treeHeight(t.endState())} to ${h}.`,
          watch: [['search', k]],
        };
      },
    },
    {
      id: 'preorder-after-insert',
      title: 'Preorder after an insert',
      make(rng) {
        const setup = randomTree(rng, 3, 5);
        const t = run(setup);
        const there = new Set(inorderKeys(t.endState()));
        const k = distinct(rng, 20).find((x) => !there.has(x))!;
        const e = then(t, ['insert', k]);
        const order = preorderKeys(e.end).map(String);
        return {
          prompt: `Run ${call(['insert', k])} on the splay tree shown. Type the keys in preorder afterwards: root, then the left subtree, then the right subtree.`,
          setup,
          answer: { kind: 'sequence', value: order },
          explain: `${k} goes in as a leaf and is splayed to the root, so the preorder starts with ${k}: ${order.join(' ')}.`,
          watch: [['insert', k]],
        };
      },
    },
  ];
}
