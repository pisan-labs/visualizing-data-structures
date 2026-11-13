import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import cppSource from './code/cpp/value.hpp?raw';
import javaSource from './code/java/Value.java?raw';
import pythonSource from './code/python/value.py?raw';
import chain from './examples/chain.json';
import deadRelu from './examples/dead-relu.json';
import forgotZero from './examples/forgot-zero.json';
import neuron from './examples/neuron.json';
import overwriteBug from './examples/overwrite-bug.json';
import saturated from './examples/saturated.json';
import squaredError from './examples/squared-error.json';
import usedTwice from './examples/used-twice.json';
import explain from './explain.md?raw';
import { backwardPass, forwardValues, isConst, parseGraph, plain, type Graph } from './graph';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type BpExtra,
  type BpSettings,
  type BpState,
} from './model';
import { backpropPractice } from './practice';
import { view } from './view';

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
const small = (rng: Rng) => pick(rng, [-3, -2, -1, 1, 2, 3]);
const half = (rng: Rng) => pick(rng, [-1.5, -1, -0.5, 0.5, 1, 1.5, 2]);
const values = (pairs: [string, number][]) => pairs.map(([n, v]) => `${n}=${plain(v)}`).join(', ');

/** Expressions a learner meets first, with random values. */
export const TEMPLATES: { label: string; make(rng: Rng): string }[] = [
  {
    label: 'A value used twice',
    make: (rng) =>
      `(a*b + c) * a; ${values([
        ['a', small(rng)],
        ['b', small(rng)],
        ['c', small(rng)],
      ])}`,
  },
  {
    label: 'One neuron (tanh)',
    make: (rng) =>
      `tanh(w1*x1 + w2*x2 + b); ${values([
        ['w1', half(rng)],
        ['x1', half(rng)],
        ['w2', half(rng)],
        ['x2', half(rng)],
        ['b', pick(rng, [-0.5, 0, 0.5])],
      ])}`,
  },
  {
    label: 'Squared error of one weight',
    make: (rng) =>
      `(w*x - y)^2; ${values([
        ['w', half(rng)],
        ['x', small(rng)],
        ['y', small(rng)],
      ])}`,
  },
  {
    label: 'A product of three',
    make: (rng) =>
      `a*b*c; ${values([
        ['a', small(rng)],
        ['b', small(rng)],
        ['c', small(rng)],
      ])}`,
  },
  {
    label: 'One value, many uses',
    make: (rng) =>
      `a*b + a*c + a; ${values([
        ['a', small(rng)],
        ['b', small(rng)],
        ['c', small(rng)],
      ])}`,
  },
  {
    label: 'A saturated tanh (tiny gradients)',
    make: (rng) =>
      `tanh(a*b + 1); ${values([
        ['a', pick(rng, [2, 3])],
        ['b', pick(rng, [2, 3])],
      ])}`,
  },
  {
    label: 'A dead ReLU (zero gradients)',
    make: (rng) =>
      `relu(a*b + c); ${values([
        ['a', pick(rng, [1, 2])],
        ['b', pick(rng, [-2, -3])],
        ['c', pick(rng, [1, 2])],
      ])}`,
  },
  {
    label: 'A chain of functions',
    make: (rng) =>
      `sigmoid(exp(a) - 2*b); ${values([
        ['a', half(rng)],
        ['b', half(rng)],
      ])}`,
  },
];

const preset = (t: (typeof TEMPLATES)[number]): Preset => ({
  label: t.label,
  make: (rng) => [['load', t.make(rng)], ['backward']],
});

export const backpropagation: VizDef<BpState, BpSettings, BpExtra> = {
  id: 'backpropagation',
  title: 'Backpropagation',
  family: 'Training',
  blurb:
    'An expression as a graph: the forward pass fills in the values, and the backward pass walks a topological order from the output, sending gradients back by the chain rule, one edge at a time.',
  settings: [
    {
      kind: 'choice',
      key: 'accumulate',
      label: 'A value used twice',
      options: [
        { value: 'add', label: 'Add up its gradients (grad += ...)' },
        { value: 'overwrite', label: 'Overwrite its gradient (grad = ..., the classic bug)' },
      ],
      help: 'A value read by two nodes changes f through both, so its gradient is the sum of the two shares. Overwriting keeps only the last one.',
    },
    {
      kind: 'boolean',
      key: 'zero',
      label: 'Zero the gradients before each backward pass',
      help: 'Frameworks add new gradients onto old ones. A training loop zeroes them first (zero_grad); turn this off and press Backward twice to see what happens when it forgets.',
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: {
      label: 'Expression',
      placeholder: 'e.g. (a*b + c) * a; a=2, b=-3',
      maxLength: 80,
      sample: '(a*b + c) * a; a=2, b=-3, c=4',
      parse: (text) => {
        const g = parseGraph(text);
        return g instanceof Error ? g : g.text;
      },
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'forward', label: 'Forward', usesInput: false },
      { op: 'backward', label: 'Backward', usesInput: false },
      { op: 'zero', label: 'Zero gradients', usesInput: false },
    ],
    random: {
      label: 'Random expression',
      make: (rng) => [['load', pick(rng, TEMPLATES).make(rng)], ['backward']],
    },
    presets: TEMPLATES.map(preset),
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'Forward pass',
      best: {
        cost: 'Θ(V + E)',
        why: 'Each node is computed once, from the values it reads.',
        example: 'squared-error',
      },
      average: {
        cost: 'Θ(V + E)',
        why: 'One operation per node, one read per edge.',
        example: 'neuron',
      },
      worst: {
        cost: 'Θ(V + E)',
        why: 'Never more: every value is computed once and kept.',
        example: 'used-twice',
      },
    },
    {
      op: 'Topological order (depth-first search)',
      best: {
        cost: 'Θ(V + E)',
        why: 'Every node and edge is looked at once.',
        example: 'chain',
      },
      average: {
        cost: 'Θ(V + E)',
        why: 'A node reached a second time is skipped.',
        example: 'used-twice',
      },
      worst: {
        cost: 'Θ(V + E)',
        why: 'As for any DFS on a DAG.',
        example: 'neuron',
      },
    },
    {
      op: 'Backward pass: every gradient',
      best: {
        cost: 'Θ(V + E)',
        why: 'One multiply and one add per edge.',
        example: 'chain',
      },
      average: {
        cost: 'Θ(V + E)',
        why: 'About as much work as the forward pass, however many inputs there are.',
        example: 'neuron',
      },
      worst: {
        cost: 'Θ(V + E)',
        why: 'Nudging each of n inputs instead would take n + 1 forward passes.',
        example: 'used-twice',
      },
      note: 'This is why training uses backpropagation: one backward pass gives the gradient for every weight at once.',
    },
    {
      op: 'Memory for the backward pass',
      best: {
        cost: 'Θ(V)',
        why: 'Every value from the forward pass is kept until the backward pass uses it.',
        example: 'squared-error',
      },
      average: { cost: 'Θ(V)', why: 'One value and one gradient per node.', example: 'neuron' },
      worst: {
        cost: 'Θ(V)',
        why: 'A deep network keeps every layer’s outputs: memory, not time, is often the limit.',
        example: 'chain',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BpSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    usedTwice,
    neuron,
    overwriteBug,
    forgotZero,
    squaredError,
    saturated,
    deadRelu,
    chain,
  ] as unknown as SavedExample[],
  practice: backpropPractice(() => backpropagation),
  preview: { example: 'used-twice', level: 2, hide: ['o-', 'key-'] },
  opening: 'used-twice',
};

/** The lines that build a graph in the code tabs' drivers. */
export function graphLines(g: Graph): string[] {
  const lines = ['clear', ...g.vars.map((v) => `var ${g.nodes[v]!.name} ${g.nodes[v]!.value}`)];
  for (const n of g.nodes) {
    if (n.kind === 'var') continue;
    const args = n.args.map((a) => (isConst(a) ? String(a.c) : g.nodes[a.node]!.name));
    lines.push(`op ${n.name} ${n.kind} ${args.join(' ')}${n.kind === 'pow' ? ` ${n.k}` : ''}`);
  }
  return lines;
}

/**
 * Driver protocol for the code tabs. "clear" starts a new expression, "var <name> <value>"
 * adds a variable and "op <name> <kind> <operands> [power]" a node (operands are names or
 * numbers); none of them prints. "forward" prints "f <value>". "backward" builds the graph
 * afresh from the variables, runs the backward pass and prints "f <value> | <name> <gradient>"
 * for each variable; the variables keep their gradients until "zero". The code adds, as the
 * default does: an example that overwrites still gets the sums.
 */
function codeScript(calls: OpCall[], settings: BpSettings) {
  const t = new Timeline(backpropagation, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let g: Graph | undefined;
  let grads: number[] = [];
  const sync = (s: BpState) => {
    if (s.g === g) return;
    g = s.g;
    grads = g.nodes.map(() => 0);
    input.push(...graphLines(g));
  };
  sync(t.initial.state);
  for (const e of t.entries) {
    sync(e.end);
    const graph = g!;
    const f = forwardValues(graph);
    if (e.call[0] === 'forward') {
      input.push('forward');
      expected.push(`f ${round3(f[graph.out]!)}`);
    } else if (e.call[0] === 'zero') {
      input.push('zero');
      grads = grads.map(() => 0);
    } else if (e.call[0] === 'backward') {
      if (settings.zero) input.push('zero');
      input.push('backward');
      grads = backwardPass(graph, f, grads, settings.zero).grads;
      expected.push(
        `f ${round3(f[graph.out]!)} | ${graph.vars
          .map((v) => `${graph.nodes[v]!.name} ${round3(grads[v]!)}`)
          .join(' ')}`,
      );
    }
  }
  return { input, expected };
}

export default backpropagation;
