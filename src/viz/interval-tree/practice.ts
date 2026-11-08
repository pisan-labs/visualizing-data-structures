import type { Rng } from '../../engine/rng';
import { Timeline, runOp } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { call, calls } from '../_bst/practice-kit';
import { defaults, type IntervalExtra, type IntervalSettings, type IntervalState } from './model';

type Def = VizDef<IntervalState, IntervalSettings, IntervalExtra>;

/** n different intervals with ends from 0 to 60, each up to 15 long. */
function intervals(rng: Rng, n: number): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  while (out.length < n) {
    const lo = rng.int(0, 50);
    const hi = lo + rng.int(0, 15);
    if (!seen.has(`${lo},${hi}`)) {
      seen.add(`${lo},${hi}`);
      out.push([lo, hi]);
    }
  }
  return out;
}

const ins = (xs: [number, number][]): OpCall[] => xs.map(([a, b]) => ['insert', `${a}-${b}`]);
const text = (lo: number, hi: number) => `[${lo}, ${hi}]`;

/**
 * Practice for the interval tree. Every answer comes from running the model.
 * `def` is a getter to avoid an import cycle.
 */
export function intervalPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const after = (setup: OpCall[], c: OpCall) => {
    const t = run(setup);
    return runOp(def(), t.endState(), c, defaults, 1, t.entries.length);
  };

  return [
    {
      id: 'which-overlap',
      title: 'Which overlap does the search find?',
      make(rng: Rng) {
        const xs = intervals(rng, rng.int(6, 8));
        const setup = ins(xs);
        const lo = rng.int(0, 55);
        const q = `${lo}-${lo + rng.int(0, 5)}`;
        const e = after(setup, ['overlap', q]);
        const s = e.end;
        const f = e.steps.at(-1)!.extra?.found?.[0];
        const answer = f === undefined ? 'none' : text(s.nodes[f]!.lo, s.nodes[f]!.hi);
        const others = xs.map(([a, b]) => text(a, b)).filter((t) => t !== answer);
        const options = [answer, ...others.slice(0, 2), ...(answer === 'none' ? [] : ['none'])];
        options.sort();
        return {
          prompt: `Run ${call(['overlap', q])} on the interval tree shown: the CLRS search that goes left whenever the left child's max reaches the query's low end. Which interval does it return?`,
          setup,
          answer: { kind: 'choice', options, correct: options.indexOf(answer) },
          explain:
            f === undefined
              ? `The search follows max down one path and falls off the tree: nothing overlaps [${q.replace('-', ', ')}].`
              : `The search stops at the first node on its path that overlaps: ${answer}. Another interval may overlap too, but the search returns the first one it meets.`,
          watch: [['overlap', q]],
        };
      },
    },
    {
      id: 'visited',
      title: 'How many nodes does "all overlaps" visit?',
      make(rng: Rng) {
        const xs = intervals(rng, rng.int(6, 8));
        const setup = ins(xs);
        const lo = rng.int(0, 50);
        const q = `${lo}-${lo + rng.int(0, 8)}`;
        const e = after(setup, ['all', q]);
        const visited = Number(e.steps.at(-1)!.vars!.visited);
        return {
          prompt: `Run ${call(['all', q])} on the tree shown. It visits a left subtree only if its max reaches the query's low end, and a right subtree only if the node starts by the query's high end. How many nodes does it visit?`,
          setup,
          answer: { kind: 'number', value: visited },
          explain: `Counting every node checked, ${visited} of ${xs.length}. The others sit in subtrees cut off by max or by the low ends.`,
          watch: [['all', q]],
        };
      },
    },
    {
      id: 'root-max',
      title: "The root's max",
      make(rng: Rng) {
        const xs = intervals(rng, rng.int(5, 7));
        const setup = ins(xs.slice(0, 2));
        const ask = ins(xs.slice(2));
        const s = run([...setup, ...ask]).endState();
        const max = s.nodes[s.root!]!.max;
        return {
          prompt: `Starting from the tree shown, run ${calls(ask)}. What is max at the root afterwards?`,
          setup,
          answer: { kind: 'number', value: max },
          explain: `The root's subtree is the whole tree, so its max is the largest high end of all: ${max}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'max-after-delete',
      title: 'max after a delete',
      make(rng: Rng) {
        const xs = intervals(rng, rng.int(6, 8));
        const setup = ins(xs);
        const s0 = run(setup).endState();
        // Delete the interval with the largest high end, which sets the root's max.
        const top = Object.values(s0.nodes).reduce((a, b) => (b.hi > a.hi ? b : a));
        const c: OpCall = ['delete', `${top.lo}-${top.hi}`];
        const e = after(setup, c);
        const max = e.end.nodes[e.end.root!]!.max;
        return {
          prompt: `Run ${call(c)} on the tree shown. What is max at the root afterwards?`,
          setup,
          answer: { kind: 'number', value: max },
          explain: `${text(top.lo, top.hi)} had the largest high end, so it set max along its path. After it goes, the root's max is the largest high end left: ${max}.`,
          watch: [c],
        };
      },
    },
  ];
}
