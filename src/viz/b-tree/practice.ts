import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { keysOf, type BExtra, type BState } from '../_multiway/btree';
import { firstMedian, freshKey as fresh, keyList } from '../_multiway/practice';
import { distinctKeys, inserts, shuffle } from '../_multiway/presets';
import { defaults, type BTreeSettings } from './model';

export { firstMedian };

type Def = VizDef<BState, BTreeSettings, BExtra>;
type BStep = Step<BState, BExtra>;

/** The delete cases a run of steps went through, in order: "3b", "1"... */
export function deleteCases(steps: BStep[]): string[] {
  const tags: Record<string, string> = {
    'del.case1': '1',
    'del.2a.do': '2a',
    'del.2b.do': '2b',
    'del.2c.do': '2c',
    'del.3a.do': '3a',
    'del.3b.do': '3b',
  };
  // A case can span consecutive steps; a step with no case tag ends it.
  const out: string[] = [];
  let last = '';
  for (const st of steps) {
    const tag = st.lines.map((l) => tags[l]).find((x) => x !== undefined) ?? '';
    if (tag && tag !== last) out.push(tag);
    last = tag;
  }
  return out;
}

/**
 * Practice questions for the B-tree. Every answer comes from running the model, so it always
 * agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function bTreePractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: BTreeSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);
  const lastOp = (cs: OpCall[], settings?: BTreeSettings): BStep[] => {
    const t = run(cs, settings);
    return t.entries[t.entries.length - 1]!.steps;
  };

  return [
    {
      id: 'median-up',
      title: 'Which key moves up?',
      make(rng) {
        for (;;) {
          const keys = distinctKeys(rng, rng.int(8, 14));
          const setup = inserts(keys);
          const k = fresh(rng, keys);
          const steps = lastOp([...setup, ['insert', k]]);
          const median = firstMedian(steps);
          if (median === null) continue;
          // The full node that split, as it was before the insert.
          const before = run(setup).endState();
          const full = Object.values(before.nodes).find((n) =>
            n.keys.some((x) => x.key === median),
          )!;
          const others = shuffle(
            rng,
            full.keys.map((x) => x.key).filter((x) => x !== median),
          ).slice(0, 3);
          const options = shuffle(rng, [median, ...others]).map(String);
          return {
            prompt: `This B-tree has t = 3, so a node is full at 5 keys. Insert \`${k}\`: CLRS splits every full node on the way down. Which key moves up in the first split?`,
            setup,
            answer: { kind: 'choice', options, correct: options.indexOf(String(median)) },
            explain: `The first full node on the way to ${k}'s leaf is [${full.keys.map((x) => x.key).join(' ')}]. A split sends its middle key, the 3rd of 5, up into the parent: ${median}.`,
            watch: [['insert', k]],
          };
        }
      },
    },
    {
      id: 'split-count',
      title: 'How many splits?',
      make(rng) {
        const first = rng.int(4, 8);
        const keys = distinctKeys(rng, first + rng.int(3, 5));
        const setup = inserts(keys.slice(0, first));
        const ask = inserts(keys.slice(first));
        const before = run(setup).endState().splits;
        const after = run([...setup, ...ask]).endState().splits;
        const n = after - before;
        return {
          prompt: `Insert ${keyList(ask.map(([, k]) => Number(k)))} into the B-tree shown (t = 3), in that order, splitting full nodes on the way down. How many splits happen?`,
          setup,
          answer: { kind: 'number', value: n },
          explain:
            n === 0
              ? 'No insert meets a full node (5 keys) on its way down, so nothing splits.'
              : `Each insert splits every full node (5 keys) it meets on the way down, the root included. That happens ${n} ${n === 1 ? 'time' : 'times'}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'delete-cases',
      title: 'Which delete cases?',
      make(rng) {
        for (;;) {
          const keys = distinctKeys(rng, rng.int(9, 16));
          const setup = inserts(keys);
          const k = keys[rng.int(0, keys.length - 1)]!;
          const cases = deleteCases(lastOp([...setup, ['delete', k]]));
          // Mostly ask about deletes that do more than take a key out of a leaf.
          if (cases.length < 2 && rng.int(0, 3) > 0) continue;
          return {
            prompt: `Delete \`${k}\` from the B-tree shown (t = 3). Type the CLRS cases it goes through, in order, separated by spaces, for example \`3a 1\`.`,
            setup,
            answer: { kind: 'sequence', value: cases },
            explain: `On the way down, a child with only t - 1 = 2 keys first gets a key from a sibling (3a) or merges with one (3b). A key in an internal node is replaced by its predecessor (2a) or successor (2b), or its children merge (2c). A key in a leaf just comes out (1). Here: ${cases.join(', ')}.`,
            watch: [['delete', k]],
          };
        }
      },
    },
    {
      id: 'search-reads',
      title: 'How many nodes does search read?',
      make(rng) {
        const settings: BTreeSettings = { ...defaults, t: '2' };
        const keys = distinctKeys(rng, rng.int(10, 16));
        const setup = inserts(keys);
        const present = keysOf(run(setup, settings).endState());
        const k = rng.int(0, 1) ? present[rng.int(0, present.length - 1)]! : fresh(rng, keys);
        const steps = lastOp([...setup, ['search', k]], settings);
        const end = steps[steps.length - 1]!;
        const reads = Number(end.vars?.reads);
        const found = end.vars?.found === true;
        return {
          prompt: `How many nodes does \`search(${k})\` read in the B-tree shown, counting the root? Each one would be a disk read.`,
          setup,
          settings,
          answer: { kind: 'number', value: reads },
          explain: found
            ? `Search reads one node per level until it finds ${k}: ${reads} ${reads === 1 ? 'node' : 'nodes'}.`
            : `${k} is not in the tree, so search goes all the way down to a leaf: one node per level, ${reads} in all.`,
          watch: [['search', k]],
        };
      },
    },
  ];
}
