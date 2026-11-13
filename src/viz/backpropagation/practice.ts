import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeAnswer, PracticeKind, VizDef } from '../../engine/types';
import { backwardPass, forwardValues, formula, plain, type Graph } from './graph';
import { defaults, num, uses, type BpExtra, type BpSettings, type BpState } from './model';

type Def = VizDef<BpState, BpSettings, BpExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
const small = (rng: Rng) => pick(rng, [-3, -2, -1, 1, 2, 3]);

/** Expressions with whole-number answers. The first ones use a variable twice. */
const SHAPES: { expr: string; vars: string[]; reuse: boolean }[] = [
  { expr: '(a*b + c) * a', vars: ['a', 'b', 'c'], reuse: true },
  { expr: '(a + b) * (a - c)', vars: ['a', 'b', 'c'], reuse: true },
  { expr: 'a*b + a*c', vars: ['a', 'b', 'c'], reuse: true },
  { expr: '(a - b)^2 + a*c', vars: ['a', 'b', 'c'], reuse: true },
  { expr: 'a*b*c', vars: ['a', 'b', 'c'], reuse: false },
  { expr: '(w*x - y)^2', vars: ['w', 'x', 'y'], reuse: false },
  { expr: '(a + b) * c - b', vars: ['a', 'b', 'c'], reuse: true },
];

/**
 * Practice for backpropagation. The picture shows the graph after the forward pass (or after a
 * backward pass, for the question about zeroing); the questions ask about the backward pass.
 * Every answer comes from running the model.
 */
export function backpropPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: BpSettings = defaults) =>
    new Timeline(def(), settings, 1, ops).endState();

  function setup(rng: Rng, reuse = false) {
    const shapes = reuse ? SHAPES.filter((s) => s.reuse) : SHAPES;
    const shape = pick(rng, shapes);
    const text = `${shape.expr}; ${shape.vars.map((v) => `${v}=${plain(small(rng))}`).join(', ')}`;
    const ops: OpCall[] = [['load', text], ['forward']];
    const g = run(ops).g;
    const values = forwardValues(g);
    const trace = backwardPass(g, values, [], true);
    const name = (i: number) => g.nodes[i]!.name;
    return { ops, g, values, trace, name };
  }

  const answer = (x: number): PracticeAnswer =>
    Number.isInteger(Math.round(x * 1e9) / 1e9)
      ? { kind: 'number', value: Math.round(x) }
      : { kind: 'number', value: x, tolerance: 0.005 };

  const shares = (g: Graph, trace: ReturnType<typeof backwardPass>, v: number) =>
    trace.work.filter((w) => g.edges[w.edge]!.from === v).map((w) => num(w.contribution));

  return [
    {
      id: 'gradient',
      title: 'A gradient',
      make(rng) {
        const { ops, g, trace, name } = setup(rng);
        const v = pick(rng, g.vars);
        const parts = shares(g, trace, v);
        return {
          prompt: `f = ${g.expr}, and the forward pass has filled in every value. What is **∂f/∂${name(v)}**?`,
          setup: ops,
          answer: answer(trace.grads[v]!),
          explain:
            parts.length > 1
              ? `${name(v)} is read ${parts.length} times, and its gradient is the sum of the shares: ${parts.join(' + ')} = ${num(trace.grads[v]!)}.`
              : `The chain rule along the one path from f to ${name(v)}: each node multiplies the gradient by its local derivative. ∂f/∂${name(v)} = ${num(trace.grads[v]!)}.`,
          watch: [['backward']],
        };
      },
    },
    {
      id: 'order',
      title: 'The backward order',
      make(rng) {
        const { ops, g, trace, name } = setup(rng);
        const forward = trace.order.map(name);
        const back = [...forward].reverse();
        return {
          prompt: `The page lists the nodes by depth-first search from f (operands left to right, each node after the nodes it reads), and the backward pass walks the list from the end. In what order does it visit the nodes? Type their names, f first.`,
          setup: ops,
          answer: { kind: 'sequence', value: back },
          explain: `The list is ${forward.join(', ')}: a node joins it once everything it reads has. Backwards: ${back.join(', ')}. Every node that reads a value is visited before that value, so its gradient is complete when its turn comes.`,
          watch: [['backward']],
        };
      },
    },
    {
      id: 'share',
      title: 'One edge',
      make(rng) {
        for (;;) {
          const { ops, g, trace, name } = setup(rng);
          // An edge into an operation that is not the output, so the share needs a step of thought.
          const work = trace.work.filter((w) => g.edges[w.edge]!.to !== g.out);
          if (!work.length) continue;
          const w = pick(rng, work);
          const e = g.edges[w.edge]!;
          const upstream = backwardPass(g, forwardValues(g), [], true).grads[e.to]!;
          return {
            prompt: `f = ${g.expr}. When the backward pass reaches **${formula(g, e.to)}**, what does it send back to **${name(e.from)}** along that edge? That is ∂${name(e.to)}/∂${name(e.from)} × ∂f/∂${name(e.to)}.`,
            setup: ops,
            answer: answer(w.contribution),
            explain: `∂f/∂${name(e.to)} = ${num(upstream)} by the time the pass gets there, and ∂${name(e.to)}/∂${name(e.from)} = ${num(w.local)}. The share is ${num(w.local)} × ${num(upstream)} = ${num(w.contribution)}.`,
            watch: [['backward']],
          };
        }
      },
    },
    {
      id: 'bug',
      title: 'Two classic bugs',
      make(rng) {
        const { ops, g, trace, name } = setup(rng, true);
        const v = g.vars.find((u) => uses(g, u) > 1)!;
        if (rng.int(0, 1) === 0) {
          const settings: BpSettings = { ...defaults, accumulate: 'overwrite' };
          const bad = run([...ops, ['backward']], settings).grads[v]!;
          const parts = shares(g, trace, v);
          return {
            prompt: `f = ${g.expr}. This backward pass has the classic bug: it sets u.grad = ∂v/∂u · v.grad instead of adding. What does it show for **∂f/∂${name(v)}**?`,
            setup: ops,
            settings,
            answer: answer(bad),
            explain: `${name(v)} is read ${uses(g, v)} times. Its shares are ${parts.join(', ')}, and the right answer is their sum, ${num(trace.grads[v]!)}. Overwriting keeps only the last share to arrive: ${num(bad)}.`,
            watch: [['backward']],
          };
        }
        const settings: BpSettings = { ...defaults, zero: false };
        const before: OpCall[] = [...ops, ['backward']];
        const twice = run([...before, ['backward']], settings).grads[v]!;
        return {
          prompt: `f = ${g.expr}. The backward pass has run once, and nobody zeroed the gradients. It runs again. What does **∂f/∂${name(v)}** show now?`,
          setup: before,
          settings,
          answer: answer(twice),
          explain: `The second pass adds its ${num(trace.grads[v]!)} onto the ${num(trace.grads[v]!)} already there: ${num(twice)}. A training loop zeroes the gradients before every backward pass for this reason.`,
          watch: [['backward']],
        };
      },
    },
  ];
}
