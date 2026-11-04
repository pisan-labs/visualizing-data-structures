import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { choice, plural } from '../_recursion/kit';
import { defaults, valueOf, type DagSettings, type DagState, type Problem } from './model';

type Def = VizDef<DagState, DagSettings, undefined>;

/**
 * Practice questions for the tree and the memoized DAG. Every answer comes from running the
 * model, so it always agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function dagPractice(def: () => Def): PracticeKind[] {
  const end = (problem: Problem, input: string): Step<DagState, undefined> => {
    const t = new Timeline(def(), { ...defaults, problem }, 1, [['call', input]]);
    return t.entries[0]!.steps.at(-1)!;
  };
  const num = (step: Step<DagState, undefined>, name: string) => Number(step.vars?.[name]);

  return [
    {
      id: 'memo-calls',
      title: 'Calls with a memo',
      make(rng) {
        const m = rng.int(3, 4);
        const n = rng.int(5, 8);
        const small = end('fib', String(m));
        const big = end('fib', String(n));
        const arrows = num(small, 'memo calls') - 1;
        return {
          prompt: `The picture shows \`fib(${m})\` as a tree and as a DAG. With a memo, the recursion makes one call for the top box and one for each arrow of the DAG. How many calls does \`fib(${n})\` make with a memo?`,
          setup: [['call', String(m)]] as OpCall[],
          settings: { problem: 'fib' },
          answer: { kind: 'number', value: num(big, 'memo calls') },
          explain: `The DAG of \`fib(${m})\` has ${m + 1} boxes and ${arrows} arrows: every box above fib(1) has two. For \`fib(${n})\` that is ${n + 1} boxes and ${2 * (n - 1)} arrows, so 1 + ${2 * (n - 1)} = ${num(big, 'memo calls')} calls, against ${num(big, 'tree calls')} in the tree.`,
          watch: [['call', String(n)]] as OpCall[],
        };
      },
    },
    {
      id: 'tree-calls',
      title: 'Calls in the tree',
      make(rng) {
        const n = rng.int(4, 6);
        const k = rng.int(1, n - 1);
        const value = valueOf('binom', [n, k]);
        const step = end('binom', `${n} ${k}`);
        return {
          prompt: `C(${n}, ${k}) = ${value}. Every leaf of its tree is a base case that returns 1, and every other call makes exactly two calls. Without a memo, how many calls does the tree make?`,
          setup: [],
          settings: { problem: 'binom' },
          answer: { kind: 'number', value: num(step, 'tree calls') },
          explain: `The leaves add up to the answer, so there are ${value} of them. A tree where every call makes 0 or 2 calls has one fewer inner call than leaves: ${value} + ${value - 1} = ${num(step, 'tree calls')}.`,
          watch: [['call', `${n} ${k}`]] as OpCall[],
        };
      },
    },
    {
      id: 'dag-boxes',
      title: 'Boxes in the DAG',
      make(rng) {
        const [n, k] = (
          [
            [4, 2],
            [4, 1],
            [5, 2],
            [5, 1],
            [3, 1],
            [5, 3],
          ] as const
        )[rng.int(0, 5)]!;
        const step = end('binom', `${n} ${k}`);
        const boxes = num(step, 'dag nodes');
        const keys = step.state.dag.map((d) => `C(${d.args[0]}, ${d.args[1]})`);
        return {
          prompt: `How many different subproblems, boxes in the DAG, does C(${n}, ${k}) reach? Count C(${n}, ${k}) itself and the base cases.`,
          setup: [],
          settings: { problem: 'binom' },
          answer: { kind: 'number', value: boxes },
          explain: `Follow both calls from every box that is not a base case, and count each subproblem once: ${keys.join(', ')}. That is ${plural(boxes, 'box', 'boxes')}.`,
          watch: [['call', `${n} ${k}`]] as OpCall[],
        };
      },
    },
    {
      id: 'most-called',
      title: 'The busiest subproblem',
      make(rng) {
        const n = rng.int(5, 7);
        const step = end('fib', String(n));
        const counts = Object.entries(step.state.seen).sort((a, b) => b[1] - a[1]);
        const [key, times] = counts[0]!;
        const right = `fib(${key})`;
        const wrong = [`fib(0)`, `fib(2)`, `fib(${n - 1})`, `fib(1)`];
        return {
          prompt: `The picture shows \`fib(${n - 2})\` with how often the tree calls each subproblem (the ×k badges). In the tree of \`fib(${n})\`, which subproblem is called the most times?`,
          setup: [['call', String(n - 2)]] as OpCall[],
          settings: { problem: 'fib' },
          answer: choice(rng, right, wrong),
          explain: `The smaller the subproblem, the more paths lead down to it, and fib(1) is reached from both fib(2) and fib(3). In \`fib(${n})\` the tree calls ${right} ${times} times.`,
          watch: [['call', String(n)]] as OpCall[],
        };
      },
    },
  ];
}
