import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { freshKey, markedKey, markedNode } from '../_multiway/practice';
import { deletes, distinctKeys, inserts, shuffle } from '../_multiway/presets';
import {
  defaults,
  keysOf,
  leafKeys,
  type BPExtra,
  type BPSettings,
  type BPStep,
  type BState,
} from './model';

type Def = VizDef<BState, BPSettings, BPExtra>;

/** The key a leaf split copied up, read from the step that split. */
export function copiedUp(steps: BPStep[]): number | null {
  const st = steps.find((s) => s.lines.includes('ins.copy'));
  return st ? (markedKey(st, 'new')?.key ?? null) : null;
}

/** How a delete fixed its first underflow, or null if nothing underflowed. */
export function firstFix(steps: BPStep[]): 'borrow' | 'merge' | null {
  for (const st of steps) {
    if (st.lines.includes('del.borrow')) return 'borrow';
    if (st.lines.includes('del.merge')) return 'merge';
  }
  return null;
}

/** The keys a range query output, in order. */
export function rangeOutput(steps: BPStep[]): number[] {
  const last = steps[steps.length - 1]!;
  const keys = new Map(leafKeys(last.state).map((k) => [k.uid, k.key]));
  return (last.extra?.output ?? []).map((u) => keys.get(u)!);
}

const FIX = { borrow: 'Borrow a key from a sibling', merge: 'Merge with a sibling' };

/**
 * Practice questions for the B+ tree. Every answer comes from running the model, so it always
 * agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function bPlusPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: BPSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);
  const lastOp = (cs: OpCall[], settings?: BPSettings): BPStep[] => {
    const t = run(cs, settings);
    return t.entries[t.entries.length - 1]!.steps;
  };
  /** A random range over a tree's keys: from somewhere in the lower half to the upper half. */
  const span = (rng: { int(a: number, b: number): number }, keys: number[]) => {
    const sorted = [...keys].sort((a, b) => a - b);
    const lo = Math.max(0, sorted[rng.int(0, Math.floor(sorted.length / 2))]! - rng.int(0, 4));
    const hi = sorted[rng.int(Math.floor(sorted.length / 2), sorted.length - 1)]! + rng.int(0, 4);
    return [lo, hi] as const;
  };

  return [
    {
      id: 'copy-up',
      title: 'Which key is copied up?',
      make(rng) {
        for (;;) {
          const keys = distinctKeys(rng, rng.int(4, 12));
          const setup = inserts(keys);
          const k = freshKey(rng, keys);
          const steps = lastOp([...setup, ['insert', k]]);
          const key = copiedUp(steps);
          const over = steps.map((s) => markedNode(s, 'error')).find((x) => x !== null);
          if (key === null || !over) continue;
          const options = shuffle(rng, over).map(String);
          return {
            prompt: `This B+ tree has order m = 4, so a leaf holds at most 3 keys. Insert \`${k}\`: its leaf overflows and splits. Which key is copied up into the parent?`,
            setup,
            answer: { kind: 'choice', options, correct: options.indexOf(String(key)) },
            explain: `With ${k} the leaf would be [${over.join(' ')}]. The left half keeps the first 2 keys and the new leaf takes the rest. A copy of the new leaf's first key, ${key}, goes up, and ${key} stays in the leaf too.`,
            watch: [['insert', k]],
          };
        }
      },
    },
    {
      id: 'range-output',
      title: 'What does the range query return?',
      make(rng) {
        const keys = distinctKeys(rng, rng.int(7, 13));
        const setup = inserts(keys);
        const [a, b] = span(rng, keys);
        const out = rangeOutput(lastOp([...setup, ['range', a, b]]));
        return {
          prompt: `Type the keys \`range(${a}, ${b})\` returns for the B+ tree shown, in order. Leave it blank if there are none.`,
          setup,
          answer: { kind: 'sequence', value: out.map(String) },
          explain: out.length
            ? `Every key from ${a} to ${b} is in a leaf, and the leaves are in order: ${out.join(', ')}.`
            : `No key is between ${a} and ${b}, so the answer is empty.`,
          watch: [['range', a, b]],
        };
      },
    },
    {
      id: 'range-leaves',
      title: 'How many leaves does the range read?',
      make(rng) {
        const keys = distinctKeys(rng, rng.int(8, 14));
        const setup = inserts(keys);
        const [a, b] = span(rng, keys);
        const steps = lastOp([...setup, ['range', a, b]]);
        const n = Number(steps[steps.length - 1]!.vars?.visited);
        return {
          prompt: `\`range(${a}, ${b})\` walks down to one leaf and then along the leaf links. How many leaves does it read, counting the first one?`,
          setup,
          answer: { kind: 'number', value: n },
          explain: `It starts in the leaf where ${a} would be and follows the links until it meets a key bigger than ${b} (or runs out of leaves): ${n} ${n === 1 ? 'leaf' : 'leaves'}.`,
          watch: [['range', a, b]],
        };
      },
    },
    {
      id: 'underflow-fix',
      title: 'Borrow or merge?',
      make(rng) {
        for (;;) {
          const keys = distinctKeys(rng, rng.int(6, 13));
          const gone = shuffle(rng, keys).slice(0, rng.int(0, 2));
          const setup = [...inserts(keys), ...deletes(gone)];
          const left = keysOf(run(setup).endState());
          const k = left[rng.int(0, left.length - 1)];
          if (k === undefined) continue;
          const fix = firstFix(lastOp([...setup, ['delete', k]]));
          if (fix === null) continue;
          const options = [FIX.borrow, FIX.merge];
          return {
            prompt: `Delete \`${k}\` from the B+ tree shown (m = 4, so a leaf needs at least 2 keys). Its leaf underflows. How is that fixed?`,
            setup,
            answer: { kind: 'choice', options, correct: options.indexOf(FIX[fix]) },
            explain:
              fix === 'borrow'
                ? 'A sibling next to the leaf has more than 2 keys, so one key moves over, and the separator above changes to the new first key on the right.'
                : 'Every sibling next to the leaf has only 2 keys, so the leaf merges with one, and their separator is dropped from the parent.',
            watch: [['delete', k]],
          };
        }
      },
    },
  ];
}
