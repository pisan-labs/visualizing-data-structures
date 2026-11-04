import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { distinctKeys, inserts } from '../_multiway/presets';
import { defaults, keysOf, type SkipExtra, type SkipSettings, type SLState } from './model';

type Def = VizDef<SLState, SkipSettings, SkipExtra>;
type SkipStep = Step<SLState, SkipExtra>;

/** The keys of the nodes a search moved to, in order (dropping down stays on the same node). */
export function nodesVisited(steps: SkipStep[]): number[] {
  const last = steps[steps.length - 1]!;
  const out: number[] = [];
  let prev: number | 'head' = 'head';
  for (const [p] of last.extra?.path ?? []) {
    if (p !== 'head' && p !== prev) out.push(last.state.nodes[p]!.key);
    prev = p;
  }
  return out;
}

const SMALL: SkipSettings = { ...defaults, maxLevel: 4 };

/**
 * Practice questions for the skip list. Every answer comes from running the model, so it always
 * agrees with the drawing, coin flips included. `def` is a getter to avoid an import cycle.
 */
export function skipPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: SkipSettings = SMALL) =>
    new Timeline(def(), settings, 1, cs);
  const lastOp = (cs: OpCall[], settings: SkipSettings = SMALL): SkipStep[] => {
    const t = run(cs, settings);
    return t.entries[t.entries.length - 1]!.steps;
  };
  const list = (rng: Rng, lo: number, hi: number) => inserts(distinctKeys(rng, rng.int(lo, hi)));
  /** A key that is in the list half the time, and otherwise one that is not. */
  const probe = (rng: Rng, keys: number[]) => {
    if (rng.int(0, 1)) return keys[rng.int(0, keys.length - 1)]!;
    for (;;) {
      const k = rng.int(1, 99);
      if (!keys.includes(k)) return k;
    }
  };

  return [
    {
      id: 'search-path',
      title: 'Which nodes does search move to?',
      make(rng) {
        const setup = list(rng, 6, 9);
        const keys = keysOf(run(setup).endState());
        const k = probe(rng, keys);
        const steps = lastOp([...setup, ['search', k]]);
        const path = nodesVisited(steps);
        return {
          prompt: `Type the keys of the nodes \`search(${k})\` moves to, in order. It starts at the head on the top level; dropping down a level stays on the same node. Leave it blank if it never moves right.`,
          setup,
          settings: SMALL,
          answer: { kind: 'sequence', value: path.map(String) },
          explain: path.length
            ? `On each level, move right while the next key is smaller than ${k}, then drop down. The search moves to ${path.join(', ')}.`
            : `Every first key on every level is at least ${k}, so the search drops straight down from the head.`,
          watch: [['search', k]],
        };
      },
    },
    {
      id: 'tower-height',
      title: 'How tall is the new node?',
      make(rng) {
        const settings: SkipSettings = { ...defaults, maxLevel: rng.int(3, 5) };
        for (;;) {
          const setup = list(rng, 3, 7);
          const keys = keysOf(run(setup, settings).endState());
          let k = rng.int(1, 99);
          while (keys.includes(k)) k = rng.int(1, 99);
          const steps = lastOp([...setup, ['insert', k]], settings);
          const last = steps[steps.length - 1]!;
          const flips = last.extra?.flips ?? [];
          const height = Number(last.vars?.level);
          // Mostly ask about a run of heads, which is where the cap can matter.
          if (flips.length < 2 && rng.int(0, 2) > 0) continue;
          const shown = flips.map((f) => (f === 'H' ? 'heads' : 'tails')).join(', ');
          return {
            prompt: `Insert \`${k}\` into the skip list shown. The maximum level is ${settings.maxLevel}, and the coin flips for the new node come up: ${shown}. How many levels tall is the new node?`,
            setup,
            settings,
            answer: { kind: 'number', value: height },
            explain:
              height === settings.maxLevel && flips[flips.length - 1] === 'H'
                ? `The node starts 1 level tall and each heads adds one. It reaches the maximum, ${height}, so the flipping stops there.`
                : `The node starts 1 level tall, each heads adds a level, and the first tails stops: ${height} ${height === 1 ? 'level' : 'levels'}.`,
            watch: [['insert', k]],
          };
        }
      },
    },
    {
      id: 'levels-after',
      title: 'How many levels after the delete?',
      make(rng) {
        const setup = list(rng, 5, 8);
        const s = run(setup).endState();
        const nodes = Object.values(s.nodes);
        const tallest = nodes.reduce((a, b) => (b.next.length > a.next.length ? b : a));
        const k = rng.int(0, 1) ? tallest.key : nodes[rng.int(0, nodes.length - 1)]!.key;
        const steps = lastOp([...setup, ['delete', k]]);
        const levels = Number(steps[steps.length - 1]!.vars?.levels);
        return {
          prompt: `Delete \`${k}\` from the skip list shown. How many levels does the list use afterwards?`,
          setup,
          settings: SMALL,
          answer: { kind: 'number', value: levels },
          explain:
            levels < s.level
              ? `${k} was the only node on the top ${s.level - levels === 1 ? 'level' : `${s.level - levels} levels`}, so ${s.level - levels === 1 ? 'that level goes' : 'those levels go'} away: ${levels} left.`
              : `Another node still reaches level ${s.level}, so the list keeps all ${s.level} levels.`,
          watch: [['delete', k]],
        };
      },
    },
    {
      id: 'comparisons',
      title: 'How many comparisons?',
      make(rng) {
        const setup = list(rng, 6, 9);
        const keys = keysOf(run(setup).endState());
        const k = probe(rng, keys);
        const steps = lastOp([...setup, ['search', k]]);
        const n = Number(steps[steps.length - 1]!.vars?.comparisons);
        return {
          prompt: `How many times does \`search(${k})\` compare ${k} with a key? Each look at the next node counts, including the one that sends it down a level; reaching nil does not count.`,
          setup,
          settings: SMALL,
          answer: { kind: 'number', value: n },
          explain: `On every level the search compares ${k} with the next key until it finds one that is not smaller (or reaches nil). Here that adds up to ${n}.`,
          watch: [['search', k]],
        };
      },
    },
  ];
}
