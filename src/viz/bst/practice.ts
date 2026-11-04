import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import {
  defaults,
  ordinal,
  type BSTExtra,
  type BSTSettings,
  type BSTState,
  type Side,
} from './model';

type Def = VizDef<BSTState, BSTSettings, BSTExtra>;

function distinct(rng: Rng, n: number): number[] {
  const out = new Set<number>();
  while (out.size < n) out.add(rng.int(1, 99));
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

const inserts = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k]);
const keyList = (keys: number[]) => keys.map((k) => `\`${k}\``).join(', ');

/** Keys from the root down to the deepest node (the first one found, left before right). */
function longestPath(s: BSTState): number[] {
  const walk = (u: number | null): number[] => {
    if (u === null) return [];
    const n = s.nodes[u]!;
    const l = walk(n.left);
    const r = walk(n.right);
    return [n.key, ...(r.length > l.length ? r : l)];
  };
  return walk(s.root);
}

/**
 * Practice questions for binary search trees. Every answer comes from running the model, so it
 * always agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function bstPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: BSTSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);
  /** The last step of the last operation. */
  const last = (cs: OpCall[], settings?: BSTSettings): Step<BSTState, BSTExtra> => {
    const t = run(cs, settings);
    const steps = t.entries[t.entries.length - 1]!.steps;
    return steps[steps.length - 1]!;
  };
  const sortedKeys = (setup: OpCall[]) =>
    String(last([...setup, ['inorder']]).vars?.output ?? '')
      .split(' ')
      .filter(Boolean);

  return [
    {
      id: 'height-after',
      title: 'How tall is the tree after these inserts?',
      make(rng) {
        const keys = distinct(rng, rng.int(5, 7));
        const first = rng.int(1, 2);
        const setup = inserts(keys.slice(0, first));
        const ask = inserts(keys.slice(first));
        const end = last([...setup, ...ask]);
        const height = Number(end.vars?.height);
        const path = longestPath(end.state);
        return {
          prompt: `Insert ${keyList(keys.slice(first))} into the tree shown, in that order. What is the height of the tree afterwards? A single node has height 0.`,
          setup,
          answer: { kind: 'number', value: height },
          explain: `Each new key walks down one path and becomes a leaf. The longest path is ${path.join(' → ')}, which has ${height} ${height === 1 ? 'edge' : 'edges'}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'delete-replacement',
      title: "Which key takes the deleted key's place?",
      make(rng) {
        // Random trees until one has a node with two children (almost always the first).
        for (;;) {
          const keys = distinct(rng, rng.int(6, 8));
          const setup = inserts(keys);
          const s = run(setup).endState();
          const both = Object.values(s.nodes).filter((n) => n.left !== null && n.right !== null);
          if (both.length === 0) continue;
          const z = both[rng.int(0, both.length - 1)]!;
          const rule = rng.int(0, 1) ? 'successor' : 'predecessor';
          const side: Side | null =
            z.parent === null ? null : s.nodes[z.parent]!.left === z.uid ? 'left' : 'right';
          /** The key that ends up where z was, by running the model's delete. */
          const replacement = (r: BSTSettings['delete']) => {
            const after = last([...setup, ['delete', z.key]], { ...defaults, delete: r }).state;
            const u = z.parent === null ? after.root : after.nodes[z.parent]![side!];
            return after.nodes[u!]!.key;
          };
          const answer = replacement(rule);
          const other = replacement(rule === 'successor' ? 'predecessor' : 'successor');
          const near = [z.left, z.right].map((u) => s.nodes[u!]!.key);
          const options = shuffle(
            rng,
            [answer, other, ...near].filter((k, i, all) => all.indexOf(k) === i).map(String),
          );
          const where =
            rule === 'successor'
              ? `the smallest key in ${z.key}'s right subtree: go right once, then left as far as you can`
              : `the largest key in ${z.key}'s left subtree: go left once, then right as far as you can`;
          return {
            prompt: `Delete \`${z.key}\` from the tree shown. It has two children, so its ${rule} takes its place. Which key is that?`,
            setup,
            settings: { ...defaults, delete: rule },
            answer: { kind: 'choice', options, correct: options.indexOf(String(answer)) },
            explain: `The ${rule} is ${where}. That is ${answer}.`,
            watch: [['delete', z.key]],
          };
        }
      },
    },
    {
      id: 'select-rank',
      title: 'Select and rank',
      make(rng) {
        const keys = distinct(rng, rng.int(5, 8));
        const setup = inserts(keys);
        const sorted = sortedKeys(setup);
        if (rng.int(0, 1)) {
          const i = rng.int(1, keys.length);
          const value = Number(last([...setup, ['select', i]]).vars?.returned);
          return {
            prompt: `What does \`select(${i})\` return for the tree shown? It counts from 1, so \`select(1)\` is the smallest key.`,
            setup,
            answer: { kind: 'number', value },
            explain: `In sorted order the keys are ${sorted.join(', ')}, so the ${ordinal(i)} smallest is ${value}. The tree finds it without listing them, by comparing i with the size of each left subtree on the way down.`,
            watch: [['select', i]],
          };
        }
        const k = keys[rng.int(0, keys.length - 1)]!;
        const value = Number(last([...setup, ['rank', k]]).vars?.returned);
        const smaller = sorted.slice(0, value - 1);
        return {
          prompt: `What does \`rank(${k})\` return for the tree shown? Ranks count from 1, so the smallest key has rank 1.`,
          setup,
          answer: { kind: 'number', value },
          explain: smaller.length
            ? `${smaller.length} ${smaller.length === 1 ? 'key is' : 'keys are'} smaller than ${k} (${smaller.join(', ')}), so its rank is ${value}.`
            : `${k} is the smallest key, so its rank is 1.`,
          watch: [['rank', k]],
        };
      },
    },
    {
      id: 'search-path',
      title: 'Which keys does a search look at?',
      make(rng) {
        const keys = distinct(rng, rng.int(5, 8));
        const setup = inserts(keys);
        let k = keys[rng.int(0, keys.length - 1)]!;
        if (rng.int(0, 1)) while (keys.includes(k)) k = rng.int(1, 99);
        const end = last([...setup, ['search', k]]);
        const path = (end.extra?.path ?? []).map((u) => String(end.state.nodes[u]!.key));
        return {
          prompt: `Type the keys \`search(${k})\` compares ${k} with, in order, starting at the root.`,
          setup,
          answer: { kind: 'sequence', value: path },
          explain:
            end.vars?.found === true
              ? `Go left when ${k} is smaller and right when it is larger: ${path.join(', ')}. The last comparison finds ${k}.`
              : `Go left when ${k} is smaller and right when it is larger: ${path.join(', ')}. Then the search falls off the tree, so ${k} is not there.`,
          watch: [['search', k]],
        };
      },
    },
  ];
}
