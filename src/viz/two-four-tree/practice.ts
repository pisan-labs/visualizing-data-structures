import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { keysOf, type BExtra, type BState } from '../_multiway/btree';
import { firstMedian, freshKey, keyList, markedKey, markedNode } from '../_multiway/practice';
import { deletes, distinctKeys, inserts, shuffle } from '../_multiway/presets';
import { defaults, type TwoFourSettings } from './model';

type Def = VizDef<BState, TwoFourSettings, BExtra>;
type BStep = Step<BState, BExtra>;

/** How the first underflow of a delete was fixed, or null if nothing underflowed. */
export function firstFix(steps: BStep[]): 'transfer' | 'fusion' | null {
  for (const st of steps) {
    if (st.lines.includes('del.transfer')) return 'transfer';
    if (st.lines.includes('del.fuse')) return 'fusion';
  }
  return null;
}

/** The key that moved up into the internal node during a delete's swap, if there was one. */
export function swappedIn(steps: BStep[]): number | null {
  const st = steps.find((s) => s.lines.includes('del.swap2'));
  return st ? (markedKey(st, 'new')?.key ?? null) : null;
}

const FIX = { transfer: 'A transfer from a sibling', fusion: 'A fusion with a sibling' };

/**
 * Practice questions for the 2-4 tree. Every answer comes from running the model, so it always
 * agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function twoFourPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: TwoFourSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);
  const lastOp = (cs: OpCall[], settings?: TwoFourSettings): BStep[] => {
    const t = run(cs, settings);
    return t.entries[t.entries.length - 1]!.steps;
  };

  return [
    {
      id: 'overflow-up',
      title: 'Which key moves up?',
      make(rng) {
        for (;;) {
          const keys = distinctKeys(rng, rng.int(5, 12));
          const setup = inserts(keys);
          const k = freshKey(rng, keys);
          const steps = lastOp([...setup, ['insert', k]]);
          const median = firstMedian(steps);
          const over = steps.map((s) => markedNode(s, 'error')).find((x) => x !== null);
          if (median === null || !over) continue;
          const options = shuffle(rng, over).map(String);
          return {
            prompt: `Insert \`${k}\` into the 2-4 tree shown. Its leaf overflows. Which key moves up when it splits?`,
            setup,
            answer: { kind: 'choice', options, correct: options.indexOf(String(median)) },
            explain: `With ${k}, the leaf would be [${over.join(' ')}], a 5-node. The split keeps the first two keys together, makes a 2-node of the last, and sends the third, ${median}, up to the parent.`,
            watch: [['insert', k]],
          };
        }
      },
    },
    {
      id: 'split-count',
      title: 'How many splits?',
      make(rng) {
        const first = rng.int(3, 7);
        const keys = distinctKeys(rng, first + rng.int(3, 5));
        const setup = inserts(keys.slice(0, first));
        const ask = inserts(keys.slice(first));
        const before = run(setup).endState().splits;
        const n = run([...setup, ...ask]).endState().splits - before;
        return {
          prompt: `Insert ${keyList(ask.map(([, k]) => Number(k)))} into the 2-4 tree shown, in that order. How many splits happen?`,
          setup,
          answer: { kind: 'number', value: n },
          explain:
            n === 0
              ? 'Every key lands in a leaf with room, so nothing overflows.'
              : `A split happens whenever a node would hold 4 keys, and a split can overflow the parent too. In all, ${n} ${n === 1 ? 'split' : 'splits'}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'underflow-fix',
      title: 'Transfer or fusion?',
      make(rng) {
        for (;;) {
          const keys = distinctKeys(rng, rng.int(6, 13));
          const gone = shuffle(rng, keys).slice(0, rng.int(0, 3));
          const setup = [...inserts(keys), ...deletes(gone)];
          const left = keysOf(run(setup).endState());
          const k = left[rng.int(0, left.length - 1)];
          if (k === undefined) continue;
          const fix = firstFix(lastOp([...setup, ['delete', k]]));
          if (fix === null) continue;
          const options = [FIX.transfer, FIX.fusion];
          return {
            prompt: `Delete \`${k}\` from the 2-4 tree shown. A node underflows: it is left with no keys. How is that first underflow fixed?`,
            setup,
            answer: { kind: 'choice', options, correct: options.indexOf(FIX[fix]) },
            explain:
              fix === 'transfer'
                ? 'A sibling next to the empty node has 2 or 3 keys, so it can spare one: it sends a key up to the parent, and the parent sends one down. That is a transfer.'
                : 'Every sibling next to the empty node is a 2-node with no key to spare, so the empty node fuses with one, and a key of the parent comes down between them.',
            watch: [['delete', k]],
          };
        }
      },
    },
    {
      id: 'swap-key',
      title: 'Which key does it swap with?',
      make(rng) {
        for (;;) {
          const keys = distinctKeys(rng, rng.int(5, 12));
          const setup = inserts(keys);
          const s = run(setup).endState();
          const inner = Object.values(s.nodes).filter((n) => n.kids.length > 0);
          if (inner.length === 0) continue;
          const z = inner[rng.int(0, inner.length - 1)]!;
          const k = z.keys[rng.int(0, z.keys.length - 1)]!.key;
          const swap = rng.int(0, 1) ? 'succ' : 'pred';
          const settings: TwoFourSettings = { ...defaults, swap };
          const answer = swappedIn(lastOp([...setup, ['delete', k]], settings));
          if (answer === null) continue;
          const all = keysOf(s);
          const at = all.indexOf(k);
          const near = [
            all[at - 1],
            all[at + 1],
            ...z.keys.map((x) => x.key).filter((x) => x !== k),
          ];
          const options = shuffle(
            rng,
            [answer, ...near]
              .filter((x): x is number => x !== undefined)
              .filter((x, i, xs) => xs.indexOf(x) === i)
              .slice(0, 4),
          ).map(String);
          const which = swap === 'succ' ? 'successor' : 'predecessor';
          return {
            prompt: `Delete \`${k}\` from the 2-4 tree shown. It is not in a leaf, so it first swaps places with its ${which}. Which key is that?`,
            setup,
            settings,
            answer: { kind: 'choice', options, correct: options.indexOf(String(answer)) },
            explain:
              swap === 'succ'
                ? `The successor is the smallest key right of ${k}: go down the pointer right of ${k}, then keep taking the first pointer down to a leaf. That gives ${answer}.`
                : `The predecessor is the largest key left of ${k}: go down the pointer left of ${k}, then keep taking the last pointer down to a leaf. That gives ${answer}.`,
            watch: [['delete', k]],
          };
        }
      },
    },
  ];
}
