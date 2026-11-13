/**
 * Backpropagation (reverse-mode automatic differentiation) on a small expression drawn as a
 * graph: the forward pass fills in every node's value, a depth-first search from the output
 * lists the nodes in topological order, and the backward pass walks that list from the end,
 * passing each node's gradient to the nodes it reads by the chain rule, one edge at a time.
 * A value read twice collects a gradient from each use, and they add up.
 *
 * Settings
 *   accumulate  'add' (u.grad += ∂v/∂u · v.grad, the right way) or 'overwrite' (u.grad = ...,
 *               the classic bug: a value used twice keeps only the last use's share)
 *   zero        true: every backward pass starts from gradients of 0; false: the variables
 *               keep what the last pass left, so a second pass doubles them (forgetting
 *               zero_grad in a training loop)
 *
 * Operations: load (an expression and its values), forward, backward (runs the forward pass
 * first when the values are missing) and zero (every gradient back to 0). The arithmetic is in
 * graph.ts, in the code tabs' order.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import {
  backwardPass,
  forwardValues,
  formula,
  isConst,
  operands,
  parseGraph,
  topoOrder,
  type Graph,
  type OpKind,
} from './graph';

export type Accumulate = 'add' | 'overwrite';

export interface BpSettings {
  [key: string]: Scalar;
  accumulate: Accumulate;
  zero: boolean;
}

export const defaults: BpSettings = { accumulate: 'add', zero: true };

export const START_TEXT = '(a*b + c) * a; a=2, b=-3, c=4';

export interface BpState {
  g: Graph;
  /** Every node's value, once a forward pass has run (in part, during one). */
  values: (number | null)[];
  grads: number[];
  /** The topological order, once built (in part, while it is built). */
  order: number[];
  /** What the latest backward pass sent along each edge. */
  passed: (number | null)[];
  passes: number;
}

export interface BpExtra {
  /** The node the backward pass is at. */
  at?: number;
}

type S = BpState;
type X = BpExtra;
type Op = OpSpec<S, BpSettings, X>;
type BStep = Step<S, X>;

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/**
 * At most two decimals, trailing zeros dropped, a real minus sign: 2, −3, 0.79, 0. A value too
 * small for two decimals keeps two significant digits (0.0000033), so a tiny gradient does not
 * read as 0.
 */
export function num(x: number): string {
  const r = Math.round(x * 100) / 100;
  if (r === 0) {
    if (x === 0 || Math.abs(x) < 1e-9) return '0';
    const t = Number(Math.abs(x).toPrecision(2));
    const text = t.toFixed(1 - Math.floor(Math.log10(t))).replace(/0+$/, '');
    return x < 0 ? `−${text}` : text;
  }
  const s = String(Math.abs(r));
  return r < 0 ? `−${s}` : s;
}

/** A number as the second operand of + or ×: negatives in brackets. */
export const par = (x: number): string => (num(x).startsWith('−') ? `(${num(x)})` : num(x));

const TIMES = ['', 'once', 'twice', 'three times', 'four times', 'five times', 'six times'];
export const times = (k: number) => TIMES[k] ?? `${k} times`;

export function fresh(g: Graph): S {
  return {
    g,
    values: g.nodes.map(() => null),
    grads: g.nodes.map(() => 0),
    order: [],
    passed: g.edges.map(() => null),
    passes: 0,
  };
}

export function init(): S {
  return fresh(parseGraph(START_TEXT) as Graph);
}

/** Nodes that read node i, counting a node that reads it twice twice. */
export const uses = (g: Graph, i: number) => g.edges.filter((e) => e.from === i).length;

export function baseVars(s: S, chain = 0): Record<string, Scalar> {
  return {
    nodes: s.g.nodes.length,
    edges: s.g.edges.length,
    'chain-rule steps': chain,
    passes: s.passes,
  };
}

const valueList = (g: Graph) =>
  g.vars.map((v) => `${g.nodes[v]!.name} = ${num(g.nodes[v]!.value)}`).join(', ');

const known = (s: S) => s.values.every((v) => v !== null);

// ---------------------------------------------------------------------------------------------
// Forward

function* forwardSteps(s: S, lines: string[], last: 1 | 2): Generator<BStep, S, void> {
  const { g } = s;
  const values = forwardValues(g);
  const shown: (number | null)[] = g.nodes.map(() => null);
  for (let i = 0; i < g.nodes.length; i++) {
    shown[i] = values[i]!;
    const n = g.nodes[i]!;
    const state: S = { ...s, values: [...shown] };
    const into = g.edges.flatMap((e, k) => (e.to === i ? [mark(`e-${k}`, 'active')] : []));
    if (n.kind === 'var') {
      yield {
        state,
        marks: [mark(`nd-${i}`, 'active'), mark(`v-${i}`, 'new')],
        say: `${n.name} is an input: its value is ${num(n.value)}.`,
        lines,
        level: 3,
        vars: baseVars(state),
      };
      continue;
    }
    const xs = operands(n, values);
    const shownArgs = n.args.map((a, j) => (isConst(a) ? num(a.c) : num(xs[j]!)));
    yield {
      state,
      marks: [
        ...into,
        ...n.args.flatMap((a) => (isConst(a) ? [] : [mark(`v-${a.node}`, 'compare')])),
        mark(`nd-${i}`, 'active'),
        mark(`v-${i}`, 'new'),
      ],
      say: `${formula(g, i)}${evalText(n.kind as OpKind, shownArgs, n.k)} = ${flat(n.kind as OpKind, values[i]!)}.`,
      lines,
      level: 2,
      vars: baseVars(state),
    };
  }
  const next: S = { ...s, values };
  yield {
    state: next,
    marks: [mark(`v-${g.out}`, 'found')],
    say: `Forward pass done: f = ${num(values[g.out]!)}. Every node keeps its value, because the backward pass needs it: the derivative of a × b with respect to a is b.`,
    lines,
    level: last,
    vars: baseVars(next),
  };
  return next;
}

/** A value, with more digits when a tanh or sigmoid is so close to flat that 2 decimals hide it. */
function flat(kind: OpKind, v: number): string {
  const edge = kind === 'tanh' ? 1 - Math.abs(v) : kind === 'sigmoid' ? Math.min(v, 1 - v) : 1;
  return edge > 0 && edge < 0.005 ? `${v.toFixed(6).replace('-', '−')}, almost ${num(v)}` : num(v);
}

/** The operation with the numbers put in: " = 2 × −3" (empty for a plain copy). */
function evalText(kind: OpKind, xs: string[], k: number): string {
  const [x = '', y = ''] = xs;
  const p = (t: string) => (t.startsWith('−') ? `(${t})` : t);
  switch (kind) {
    case 'add':
      return ` = ${x} + ${p(y)}`;
    case 'sub':
      return ` = ${x} − ${p(y)}`;
    case 'mul':
      return ` = ${x} × ${p(y)}`;
    case 'div':
      return ` = ${x} / ${p(y)}`;
    case 'neg':
      return ` = −${p(x)}`;
    case 'pow':
      return ` = ${p(x)}${'⁰¹²³⁴'[k]}`;
    case 'tanh':
    case 'relu':
    case 'exp':
      return ` = ${kind}(${x})`;
    case 'sigmoid':
      return ` = σ(${x})`;
  }
}

// ---------------------------------------------------------------------------------------------
// Backward

/** ∂v/∂u in symbols, for narration: "b", "1", "1 − n2²". */
function localText(g: Graph, v: number, slot: number): string {
  const n = g.nodes[v]!;
  const name = (j: number) => {
    const a = n.args[j]!;
    return isConst(a) ? num(a.c) : g.nodes[a.node]!.name;
  };
  const x = name(0);
  switch (n.kind as OpKind) {
    case 'add':
      return '1';
    case 'sub':
      return slot === 0 ? '1' : '−1';
    case 'mul':
      return name(1 - slot);
    case 'div':
      return slot === 0 ? `1 / ${name(1)}` : `−${x} / ${name(1)}²`;
    case 'neg':
      return '−1';
    case 'pow':
      return n.k === 2 ? `2 × ${x}` : `${n.k} × ${x}${'⁰¹²³⁴'[n.k - 1]}`;
    case 'tanh':
      return `1 − ${n.name}²`;
    case 'relu':
      return `1 if ${x} > 0, else 0`;
    case 'exp':
      return `exp(${x}), which is ${n.name} itself`;
    case 'sigmoid':
      return `${n.name} × (1 − ${n.name})`;
  }
}

const ordinal = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

const backwardOp: Op = {
  label: 'Backward',
  arity: 0,
  *run(s0, _args, { settings }) {
    const overwrite = settings.accumulate === 'overwrite';
    let s = s0;
    if (!known(s)) s = yield* forwardSteps(s, ['fwd'], 2);
    const { g } = s;
    const values = s.values as number[];
    const trace = backwardPass(g, values, s.grads, settings.zero, overwrite);
    const names = g.nodes.map((n) => n.name);
    let chain = 0;
    const vars = (st: S) => baseVars(st, chain);

    // The topological order, one node at a time.
    const order: number[] = [];
    for (const v of trace.order) {
      order.push(v);
      const st: S = { ...s, order: [...order] };
      const n = g.nodes[v]!;
      const reads = [...new Set(n.args.flatMap((a) => (isConst(a) ? [] : [names[a.node]!])))];
      yield {
        state: st,
        marks: [mark(`nd-${v}`, 'active'), mark(`o-${order.length - 1}`, 'new')],
        say:
          n.kind === 'var'
            ? `Depth-first search from f reaches ${n.name}, which reads nothing, so ${n.name} goes on the list.`
            : `Everything ${n.name} reads (${reads.join(', ')}) is on the list, so ${n.name} goes on it next.`,
        lines: ['topo'],
        level: 3,
        vars: vars(st),
      };
    }
    s = { ...s, order: [...trace.order] };
    yield {
      state: s,
      marks: trace.order.map((_, j) => mark(`o-${j}`, 'new')),
      say: `A topological order, by depth-first search from f: ${trace.order.map((v) => names[v]).join(', ')}. Each node comes after the nodes it reads. The backward pass walks this list from the end, so a node is finished before anything it reads is visited.`,
      lines: ['topo'],
      level: 2,
      vars: vars(s),
    };

    // Zero, or not.
    const passed: (number | null)[] = g.edges.map(() => null);
    const kept = g.vars.filter((v) => trace.start[v] !== 0);
    if (settings.zero) {
      const any = s.grads.some((x) => x !== 0) || s.passed.some((x) => x !== null);
      s = { ...s, grads: [...trace.start], passed };
      yield {
        state: s,
        marks: any ? g.nodes.map((_, i) => mark(`g-${i}`, 'new')) : [],
        say: any
          ? 'Zero every gradient, so this pass does not add onto the last one.'
          : 'Every gradient starts at 0.',
        lines: ['zero'],
        level: any ? 2 : 3,
        vars: vars(s),
      };
    } else {
      s = { ...s, grads: [...trace.start], passed };
      yield {
        state: s,
        marks: kept.map((v) => mark(`g-${v}`, 'error')),
        say: kept.length
          ? `No zeroing: ${kept.map((v) => `${names[v]} still holds ${num(trace.start[v]!)}`).join(', ')} from the last pass, and this pass adds onto it. (The inner nodes start at 0: a framework builds them afresh in every forward pass.)`
          : 'No zeroing, but this is the first pass, so every gradient is 0 anyway.',
        lines: ['keep'],
        level: kept.length ? 2 : 3,
        vars: vars(s),
      };
    }

    // The seed.
    const grads = [...trace.start];
    grads[g.out] = 1;
    s = { ...s, grads: [...grads] };
    yield {
      state: s,
      marks: [mark(`nd-${g.out}`, 'active'), mark(`g-${g.out}`, 'new')],
      say: `Start at the output: ∂f/∂f = 1. If f moves by a little, f moves by the same little.`,
      lines: ['seed'],
      level: 2,
      vars: vars(s),
    };

    // Each node, from the end of the list, edge by edge.
    const seen = g.nodes.map(() => 0);
    let w = 0;
    for (let r = trace.order.length - 1; r >= 0; r--) {
      const v = trace.order[r]!;
      const n = g.nodes[v]!;
      const at = trace.order.length - 1 - r;
      if (n.kind === 'var') {
        yield {
          state: s,
          marks: [mark(`nd-${v}`, 'active'), mark(`o-${r}`, 'active'), mark(`g-${v}`, 'found')],
          say: `${n.name} is a variable: it reads nothing, so there is nothing to pass back. ∂f/∂${n.name} = ${num(grads[v]!)} is final.`,
          lines: ['loop'],
          level: 3,
          vars: vars(s),
          extra: { at },
        };
        continue;
      }
      const sent: string[] = [];
      const done: Mark[] = [];
      for (let slot = 0; slot < n.args.length; slot++) {
        const a = n.args[slot]!;
        if (isConst(a)) continue;
        const u = a.node;
        const item = trace.work[w++]!;
        chain++;
        seen[u]!++;
        grads[u] = item.after;
        passed[item.edge] = item.contribution;
        s = { ...s, grads: [...grads], passed: [...passed] };
        const un = names[u]!;
        const lt = localText(g, v, slot);
        const lnum = num(item.local);
        const head = `${formula(g, v)}, so ∂${n.name}/∂${un} = ${lt === lnum ? lnum : `${lt} = ${lnum}`}. Times ∂f/∂${n.name} = ${num(grads[v]!)}: ${lnum} × ${par(grads[v]!)} = ${num(item.contribution)}.`;
        const twice = uses(g, u) > 1;
        let tail: string;
        let role: Mark['role'] = 'new';
        if (overwrite && seen[u]! > 1) {
          tail = ` The bug: ∂f/∂${un} = ${num(item.contribution)} overwrites the ${num(item.before)} from ${un}'s other use.`;
          role = 'error';
        } else if (overwrite) {
          tail = ` ∂f/∂${un} = ${num(item.contribution)}.`;
        } else if (item.before === 0) {
          tail = ` ∂f/∂${un} = 0 + ${par(item.contribution)} = ${num(item.after)}.`;
        } else {
          tail =
            twice && seen[u]! > 1
              ? ` This is ${un}'s ${ordinal[seen[u]! - 1] ?? 'next'} use, so its parts add up: ∂f/∂${un} = ${num(item.before)} + ${par(item.contribution)} = ${num(item.after)}.`
              : ` Added to what ${un} already had: ${num(item.before)} + ${par(item.contribution)} = ${num(item.after)}.`;
        }
        sent.push(`${num(item.contribution)} to ${un}`);
        done.push(mark(`e-${item.edge}`, 'visit'), mark(`ch-${item.edge}`, 'visit'));
        yield {
          state: s,
          marks: [
            mark(`nd-${v}`, 'active'),
            mark(`o-${r}`, 'active'),
            mark(`g-${v}`, 'compare'),
            mark(`e-${item.edge}`, 'active'),
            mark(`ch-${item.edge}`, role === 'error' ? 'error' : 'active'),
            mark(`g-${u}`, role),
          ],
          say: head + tail,
          lines: ['loop', 'inner', 'chain'],
          level: 3,
          vars: vars(s),
          extra: { at },
        };
      }
      yield {
        state: s,
        marks: [mark(`nd-${v}`, 'active'), mark(`o-${r}`, 'active'), ...done],
        say: `${n.name} is done: it passed ${sent.join(' and ')}. Each share is ∂${n.name}/∂(that input) times ∂f/∂${n.name} = ${num(grads[v]!)}.`,
        lines: ['loop', 'chain'],
        level: 2,
        vars: vars(s),
        extra: { at },
      };
    }

    // The result.
    const next: S = { ...s, grads: [...trace.grads], passes: s.passes + 1 };
    const truth = backwardPass(g, values, [], true).grads;
    const list = g.vars.map((v) => `∂f/∂${names[v]} = ${num(trace.grads[v]!)}`).join(', ');
    const notes: string[] = [];
    for (const v of g.vars) {
      if (uses(g, v) < 2 || notes.length >= 2) continue;
      const parts = trace.work
        .filter((x) => g.edges[x.edge]!.from === v)
        .map((x, j) => (j ? par(x.contribution) : num(x.contribution)));
      notes.push(
        overwrite
          ? `${names[v]} is used ${times(uses(g, v))}, but each use overwrote the last: it shows ${num(trace.grads[v]!)}, and the true gradient is ${parts.join(' + ')} = ${num(truth[v]!)}.`
          : trace.start[v]
            ? `${names[v]} is used ${times(uses(g, v))}: this pass gave it ${parts.join(' + ')}, on top of the ${num(trace.start[v]!)} kept from before.`
            : `${names[v]} is used ${times(uses(g, v))}, so its gradient is the sum of its parts: ${parts.join(' + ')} = ${num(trace.grads[v]!)}.`,
      );
    }
    if (!settings.zero && kept.length && !overwrite)
      notes.push(
        `Without zeroing, each variable holds the sum of ${next.passes} passes. The true gradients are ${g.vars
          .map((v) => `${names[v]} = ${num(truth[v]!)}`)
          .join(', ')}.`,
      );
    if (g.vars.every((v) => Math.abs(truth[v]!) < 0.005)) {
      const stuck = trace.work.find((x) => Math.abs(x.local) < 0.005);
      const e = stuck && g.edges[stuck.edge]!;
      const n = e && g.nodes[e.to]!;
      if (e && n?.kind === 'relu')
        notes.push(
          `${n.name} = relu(${names[e.from]}) gets ${num(values[e.from]!)}, which is not positive, so its slope is 0: no gradient gets past it, and nothing before it can learn (a dead ReLU).`,
        );
      else if (e && n && (n.kind === 'tanh' || n.kind === 'sigmoid'))
        notes.push(
          `${n.name}'s slope is only ${num(stuck.local)}: ${n.kind} is almost flat at ${num(values[e.from]!)} (it is saturated), so every gradient before it is tiny.`,
        );
    }
    yield {
      state: next,
      marks: g.vars.map((v) => mark(`g-${v}`, trace.grads[v] === truth[v] ? 'found' : 'error')),
      say: `Backward pass done: ${list}.${notes.length ? ` ${notes.join(' ')}` : ''}`,
      lines: ['done'],
      level: 1,
      vars: baseVars(next, chain),
    };
    return next;
  },
};

const loadOp: Op = {
  label: 'Load',
  arity: 1,
  *run(s, args) {
    const g = parseGraph(String(args[0]));
    if (g instanceof Error) {
      yield { state: s, marks: [], say: g.message, lines: [], level: 1, vars: baseVars(s) };
      return s;
    }
    const next = fresh(g);
    const twice = g.vars.filter((v) => uses(g, v) > 1);
    yield {
      state: next,
      marks: g.nodes.map((_, i) => mark(`nd-${i}`, 'new')),
      say: `f = ${g.expr}, with ${valueList(g)}: ${g.vars.length === 1 ? 'one variable' : `${g.vars.length} variables`} and ${g.nodes.length - g.vars.length === 1 ? 'one operation' : `${g.nodes.length - g.vars.length} operations`}, a node each.${
        twice.length
          ? ` ${twice.map((v) => `${g.nodes[v]!.name} is used ${times(uses(g, v))}`).join(' and ')}: one node, with an edge out for each use.`
          : ''
      } Press Backward.`,
      lines: ['parse'],
      level: 1,
      vars: baseVars(next),
    };
    return next;
  },
};

const forwardOp: Op = {
  label: 'Forward',
  arity: 0,
  *run(s) {
    return yield* forwardSteps(s, ['floop', 'fval'], 1);
  },
};

const zeroOp: Op = {
  label: 'Zero gradients',
  arity: 0,
  *run(s) {
    const next: S = { ...s, grads: s.g.nodes.map(() => 0), passed: s.g.edges.map(() => null) };
    yield {
      state: next,
      marks: s.g.nodes.map((_, i) => mark(`g-${i}`, 'new')),
      say: 'Every gradient back to 0, as a training loop does before each backward pass (zero_grad in PyTorch).',
      lines: ['zall'],
      level: 1,
      vars: baseVars(next),
    };
    return next;
  },
};

export const ops = { load: loadOp, forward: forwardOp, backward: backwardOp, zero: zeroOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: BpSettings): PseudoBlock[] {
  const overwrite = settings.accumulate === 'overwrite';
  return [
    {
      op: 'load',
      lines: [
        L('lsig', 0, 'LOAD(expression)', 'Start from an expression:'),
        L(
          'parse',
          1,
          'one node per variable and per operation',
          'make a node for each variable and each operation, and an edge wherever one reads another.',
        ),
      ],
    },
    {
      op: 'forward',
      lines: [
        L('fsig', 0, 'FORWARD(f)', 'Work out every value, inputs first:'),
        L(
          'floop',
          1,
          'for each node v, inputs first',
          'take the nodes in the order they were built,',
        ),
        L(
          'fval',
          2,
          'v.value = v.op(values v reads)',
          'and compute each from the values it reads.',
        ),
      ],
    },
    {
      op: 'backward',
      lines: [
        L('bsig', 0, 'BACKWARD(f)', 'Find how much f changes when each value changes a little:'),
        L('fwd', 1, 'if values missing: FORWARD(f)', 'Every value has to be known first.'),
        L(
          'topo',
          1,
          'order = TOPOLOGICAL-SORT(f)',
          'List the nodes so that each comes after the ones it reads (depth-first search from f).',
        ),
        settings.zero
          ? L('zero', 1, 'for each node v: v.grad = 0', 'Clear the gradients of the last pass.')
          : L(
              'keep',
              1,
              '// no zeroing: old gradients stay',
              'Do not clear the old gradients: this pass adds onto them.',
            ),
        L('seed', 1, 'f.grad = 1', 'f moves one for one with itself.'),
        L(
          'loop',
          1,
          'for each v in reverse order',
          'Walk the list from the end, from f back to the inputs.',
        ),
        L('inner', 2, 'for each input u of v', 'For each value v reads,'),
        overwrite
          ? L(
              'chain',
              3,
              'u.grad = ∂v/∂u · v.grad      // bug',
              'set u’s gradient to how much v moves with u, times how much f moves with v, forgetting what u’s other uses gave it.',
            )
          : L(
              'chain',
              3,
              'u.grad += ∂v/∂u · v.grad',
              'add how much v moves with u, times how much f moves with v.',
            ),
        L('done', 1, 'return the gradients', 'Each variable now holds ∂f/∂(that variable).'),
      ],
    },
    {
      op: 'zero',
      lines: [
        L('zsig', 0, 'ZERO-GRAD()', 'Get ready for a new pass:'),
        L('zall', 1, 'for each node v: v.grad = 0', 'every gradient back to 0.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S): string {
  return `f = ${s.g.expr}, with ${valueList(s.g)}. Each node will show its value and its gradient, ∂f/∂(that node). Press Backward: the forward pass fills in the values, and the backward pass sends gradients from f back to the inputs.`;
}

export const initialVars = (s: S) => baseVars(s);

export function describe(s: S): string {
  const { g } = s;
  const nodes = g.nodes
    .map((n, i) => {
      const v = s.values[i];
      return `${formula(g, i)}: value ${v === null || v === undefined ? 'not computed' : num(v)}, gradient ${num(s.grads[i]!)}`;
    })
    .join('; ');
  return `f = ${g.expr}. ${nodes}.`;
}

export { topoOrder };
