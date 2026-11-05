import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import {
  defaults,
  depth,
  height,
  init,
  rootOf,
  roots,
  type DSExtra,
  type DSSettings,
  type DSState,
} from './model';

type Def = VizDef<DSState, DSSettings, DSExtra>;

const call = ([op, ...args]: OpCall) => `\`${op}(${args.join(', ')})\``;
const calls = (cs: OpCall[]) => cs.map(call).join(', ');

/** `count` unions of random pairs among 0..7 that join different sets. */
function joins(rng: Rng, start: DSState, count: number, run: (cs: OpCall[]) => DSState): OpCall[] {
  const out: OpCall[] = [];
  let s = start;
  for (let tries = 0; out.length < count && tries < 200; tries++) {
    const x = rng.int(0, 7);
    const y = rng.int(0, 7);
    if (rootOf(s, x) === rootOf(s, y)) continue;
    out.push(['union', x, y]);
    s = run(out);
  }
  return out;
}

/**
 * Practice for disjoint sets. Answers come from running the model: roots, parents and heights
 * are read from its states. `def` is a getter to avoid an import cycle.
 */
export function dsPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: DSSettings = defaults) =>
    new Timeline(def(), settings, 1, cs).endState();
  const start = init();

  return [
    {
      id: 'find-after',
      title: 'Which root?',
      make(rng) {
        const setup = joins(rng, start, rng.int(2, 3), (cs) => run(cs));
        const more = joins(rng, run(setup), 2, (cs) => run([...setup, ...cs]));
        const end = run([...setup, ...more]);
        const x = rng.int(0, 7);
        const root = rootOf(end, x);
        return {
          prompt: `The forest shows the sets after a few unions (by rank, with path compression). Now run ${calls(more)}. What does \`find(${x})\` return?`,
          setup,
          answer: { kind: 'number', value: root },
          explain: `On a tie, union puts the first root under the second; otherwise the root of smaller rank goes under. After those unions, ${x}'s set has root ${root}.`,
          watch: [...more, ['find', x]],
        };
      },
    },
    {
      id: 'parent-after-find',
      title: 'Where does x point now?',
      make(rng) {
        const halve = rng.int(0, 1) === 1;
        const settings: DSSettings = { ...defaults, path: halve ? 'halve' : 'compress' };
        // Unions of roots only, so the tree keeps its full height until a find.
        for (;;) {
          const setup: OpCall[] = [];
          let s = start;
          for (let i = 0; i < 6; i++) {
            const rs = roots(s);
            const a = rs[rng.int(0, rs.length - 1)]!;
            const b = rs.filter((r) => r !== a)[rng.int(0, rs.length - 2)]!;
            setup.push(['union', a, b]);
            s = run(setup, settings);
          }
          const deep = s.elems.filter((x) => depth(s, x) >= 2);
          if (deep.length === 0) continue;
          const x = deep[rng.int(0, deep.length - 1)]!;
          const after = run([...setup, ['find', x]], settings);
          const p = after.p[x]!;
          return {
            prompt: `This forest uses union by rank and ${halve ? 'path halving' : 'path compression'}. What is \`${x}.p\`, the parent of ${x}, after \`find(${x})\`?`,
            setup,
            settings: settings as Settings,
            answer: { kind: 'number', value: p },
            explain: halve
              ? `Path halving points ${x} at its grandparent, ${p}, and moves on from there. ${x} does not jump all the way to the root unless its grandparent is the root.`
              : `Path compression points every node on the path at the root. The root of ${x}'s tree is ${p}.`,
            watch: [['find', x]],
          };
        }
      },
    },
    {
      id: 'who-goes-under',
      title: 'Which root goes under?',
      make(rng) {
        const kinds = ['rank', 'size', 'naive'] as const;
        const union = kinds[rng.int(0, 2)]!;
        const settings: DSSettings = { ...defaults, union };
        for (;;) {
          const setup = joins(rng, start, rng.int(2, 4), (cs) => run(cs, settings));
          const s = run(setup, settings);
          const rs = roots(s);
          if (rs.length < 2) continue;
          const a = rs[rng.int(0, rs.length - 1)]!;
          const others = rs.filter((r) => r !== a);
          const b = others[rng.int(0, others.length - 1)]!;
          const after = run([...setup, ['union', a, b]], settings);
          const under = after.p[a] === b ? a : b;
          const options = [`${a} goes under ${b}`, `${b} goes under ${a}`];
          const how =
            union === 'rank'
              ? `${a} has rank ${s.rank[a]} and ${b} has rank ${s.rank[b]}. The smaller rank goes under; on a tie, the first root goes under the second.`
              : union === 'size'
                ? `${a}'s tree has ${s.size[a]} nodes and ${b}'s has ${s.size[b]}. The smaller tree goes under; on a tie, the first root goes under the second.`
                : 'Naive union always puts the first root under the second, whatever the sizes.';
          return {
            prompt: `This forest uses ${union === 'naive' ? 'naive union' : `union by ${union}`}. In \`union(${a}, ${b})\`, which root goes under the other?`,
            setup,
            settings: settings as Settings,
            answer: { kind: 'choice', options, correct: under === a ? 0 : 1 },
            explain: how,
            watch: [['union', a, b]],
          };
        }
      },
    },
    {
      id: 'height',
      title: 'How tall?',
      make(rng) {
        const naive = rng.int(0, 1) === 1;
        const settings: DSSettings = { union: naive ? 'naive' : 'rank', path: 'none' };
        const more = joins(rng, start, rng.int(4, 6), (cs) => run(cs, settings));
        const h = height(run(more, settings));
        return {
          prompt: `Start from eight separate sets, as shown, with ${naive ? 'naive union' : 'union by rank'} and no path compression. Run ${calls(more)}. What is the height of the tallest tree (the most parent pointers from a node to its root)?`,
          setup: [],
          settings: settings as Settings,
          answer: { kind: 'number', value: h },
          explain: naive
            ? `Naive union puts the first root under the second, so trees can grow by one level per union. Here the tallest ends at height ${h}.`
            : `By rank, a tree only gets taller when two trees of equal rank meet, so the height is at most log₂ 8 = 3. Here it is ${h}.`,
          watch: more,
        };
      },
    },
  ];
}
