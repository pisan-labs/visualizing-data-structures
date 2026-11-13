/**
 * Expressions as computation graphs, for the backpropagation page: a parser for what the
 * learner types, constant folding, and the arithmetic of the forward and backward passes in
 * the same order as the code tabs, so all four agree to the last bit.
 *
 *   (a*b + c) * a; a=2, b=-3, c=4
 *
 * Variables are a letter with an optional digit (a, b, w1, x2); f is the output's name and n1,
 * n2... name the inner nodes, so those are taken. Operators + − * / and ^ (a whole power from 2
 * to 4), unary minus, and the functions tanh, relu, exp and sigmoid. Constants fold into the
 * node that uses them (2*a is one node, "2 × a"), so the graph has a node for each variable and
 * each operation, and an edge wherever a node reads another. A variable used twice is one node
 * with two edges out. Values after the semicolon; a variable with none takes the next of
 * 2, −3, 4, −1, 3.
 */
import { short } from '../_lm/numbers';

export type OpKind =
  'add' | 'sub' | 'mul' | 'div' | 'neg' | 'pow' | 'tanh' | 'relu' | 'exp' | 'sigmoid';

/** An operand: another node, or a constant folded in. */
export type Arg = { node: number } | { c: number };

export interface GNode {
  /** a, w1 (a variable), n1, n2... (an inner node) or f (the output). */
  name: string;
  kind: 'var' | OpKind;
  args: Arg[];
  /** The power, for pow. */
  k: number;
  /** A variable's value. */
  value: number;
}

export interface Edge {
  /** The node read. */
  from: number;
  /** The node that reads it. */
  to: number;
  /** Which operand of `to` it is. */
  slot: number;
}

export interface Graph {
  /** The input as the page writes it back: the expression, then every variable's value. */
  text: string;
  expr: string;
  /** In the order they were made, which is a topological order (inputs first). */
  nodes: GNode[];
  /** Variables, in order of first use. */
  vars: number[];
  edges: Edge[];
  /** The output, always the last node. */
  out: number;
}

export const MAX_VARS = 5;
export const MAX_OPS = 6;
/** Layers of the drawing, the variables' included. */
export const MAX_DEPTH = 6;
/** Values and gradients past this do not fit a cell. */
export const MAX_ABS = 999;
export const DEFAULT_VALUES = [2, -3, 4, -1, 3];
const FUNCS = ['tanh', 'relu', 'exp', 'sigmoid'] as const;

export const isConst = (a: Arg): a is { c: number } => 'c' in a;

// ---------------------------------------------------------------------------------------------
// Arithmetic, in the code tabs' order

/** x to a whole power by repeated multiplication, so every language rounds alike. */
export function power(x: number, k: number): number {
  let p = 1;
  for (let i = 0; i < k; i++) p *= x;
  return p;
}

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function apply(kind: OpKind, xs: readonly number[], k: number): number {
  const [x = 0, y = 0] = xs;
  switch (kind) {
    case 'add':
      return x + y;
    case 'sub':
      return x - y;
    case 'mul':
      return x * y;
    case 'div':
      return x / y;
    case 'neg':
      return -x;
    case 'pow':
      return power(x, k);
    case 'tanh':
      return Math.tanh(x);
    case 'relu':
      return x > 0 ? x : 0;
    case 'exp':
      return Math.exp(x);
    case 'sigmoid':
      return sigmoid(x);
  }
}

/** ∂out/∂(operand `slot`), from the operands and the node's own value. */
export function localGrad(
  kind: OpKind,
  xs: readonly number[],
  out: number,
  slot: number,
  k: number,
): number {
  const [x = 0, y = 0] = xs;
  switch (kind) {
    case 'add':
      return 1;
    case 'sub':
      return slot === 0 ? 1 : -1;
    case 'mul':
      return slot === 0 ? y : x;
    case 'div':
      return slot === 0 ? 1 / y : -x / (y * y);
    case 'neg':
      return -1;
    case 'pow':
      return k * power(x, k - 1);
    case 'tanh':
      return 1 - out * out;
    case 'relu':
      return x > 0 ? 1 : 0;
    case 'exp':
      return out;
    case 'sigmoid':
      return out * (1 - out);
  }
}

export const operands = (n: GNode, values: readonly number[]): number[] =>
  n.args.map((a) => (isConst(a) ? a.c : values[a.node]!));

/** Every node's value, in order. */
export function forwardValues(g: Graph): number[] {
  const values: number[] = [];
  for (const n of g.nodes)
    values.push(n.kind === 'var' ? n.value : apply(n.kind, operands(n, values), n.k));
  return values;
}

/** Each node once, after everything it reads: depth-first from the output, operands in order. */
export function topoOrder(g: Graph): number[] {
  const seen = new Set<number>();
  const order: number[] = [];
  const build = (v: number) => {
    if (seen.has(v)) return;
    seen.add(v);
    for (const a of g.nodes[v]!.args) if (!isConst(a)) build(a.node);
    order.push(v);
  };
  build(g.out);
  return order;
}

export interface EdgeWork {
  edge: number;
  local: number;
  /** local × the gradient of the node passing it back. */
  contribution: number;
  before: number;
  after: number;
}

export interface PassTrace {
  order: number[];
  /** Gradients at the start of the pass, after zeroing (or not). */
  start: number[];
  /** Edge by edge, in the order the pass applies them. */
  work: EdgeWork[];
  grads: number[];
}

/**
 * One backward pass. `old` are the gradients before it. With `zero`, everything starts at 0;
 * without, the variables keep theirs (inner nodes always start at 0: a framework builds them
 * afresh in each forward pass). `overwrite` is the bug: = instead of +=.
 */
export function backwardPass(
  g: Graph,
  values: readonly number[],
  old: readonly number[],
  zero: boolean,
  overwrite = false,
): PassTrace {
  const order = topoOrder(g);
  const grads = g.nodes.map((n, i) => (!zero && n.kind === 'var' ? old[i]! : 0));
  const start = [...grads];
  grads[g.out] = 1;
  const work: EdgeWork[] = [];
  const edgeOf = new Map(g.edges.map((e, k) => [`${e.to}-${e.slot}`, k]));
  for (let r = order.length - 1; r >= 0; r--) {
    const v = order[r]!;
    const n = g.nodes[v]!;
    if (n.kind === 'var') continue;
    const xs = operands(n, values);
    n.args.forEach((a, slot) => {
      if (isConst(a)) return;
      const local = localGrad(n.kind as OpKind, xs, values[v]!, slot, n.k);
      const contribution = local * grads[v]!;
      const before = grads[a.node]!;
      grads[a.node] = overwrite ? contribution : before + contribution;
      work.push({
        edge: edgeOf.get(`${v}-${slot}`)!,
        local,
        contribution,
        before,
        after: grads[a.node]!,
      });
    });
  }
  return { order, start, work, grads };
}

// ---------------------------------------------------------------------------------------------
// Parsing

type Ast =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'op'; kind: OpKind; args: Ast[]; k: number };

function tokenize(s: string): string[] | Error {
  const out: string[] = [];
  const re = /\s*(\d+(?:\.\d+)?|\.\d+|[a-z]+\d*|\*\*|[-+*/^()×·−])/y;
  let i = 0;
  while (s.slice(i).trim() !== '') {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) return new Error(`I can't read "${s.slice(i).trim().slice(0, 8)}".`);
    let tok = m[1]!;
    if (tok === '×' || tok === '·') tok = '*';
    if (tok === '−') tok = '-';
    if (tok === '**') tok = '^';
    out.push(tok);
    i = re.lastIndex;
  }
  return out;
}

class Parser {
  private i = 0;
  constructor(private readonly toks: string[]) {}
  peek() {
    return this.toks[this.i];
  }
  next() {
    return this.toks[this.i++];
  }
  done() {
    return this.i >= this.toks.length;
  }
  expr(): Ast {
    let left = this.term();
    while (this.peek() === '+' || this.peek() === '-') {
      const op = this.next();
      left = { t: 'op', kind: op === '+' ? 'add' : 'sub', args: [left, this.term()], k: 0 };
    }
    return left;
  }
  term(): Ast {
    let left = this.unary();
    while (this.peek() === '*' || this.peek() === '/') {
      const op = this.next();
      left = { t: 'op', kind: op === '*' ? 'mul' : 'div', args: [left, this.unary()], k: 0 };
    }
    return left;
  }
  unary(): Ast {
    if (this.peek() === '-') {
      this.next();
      return { t: 'op', kind: 'neg', args: [this.unary()], k: 0 };
    }
    if (this.peek() === '+') {
      this.next();
      return this.unary();
    }
    return this.power();
  }
  power(): Ast {
    const base = this.atom();
    if (this.peek() !== '^') return base;
    this.next();
    const k = this.next();
    if (k === undefined || !/^\d+$/.test(k) || Number(k) < 2 || Number(k) > 4)
      throw new Error('Powers must be a whole number from 2 to 4, such as x^2.');
    return { t: 'op', kind: 'pow', args: [base], k: Number(k) };
  }
  atom(): Ast {
    const tok = this.next();
    if (tok === undefined) throw new Error('The expression stops too early.');
    if (tok === '(') {
      const e = this.expr();
      if (this.next() !== ')') throw new Error('A bracket is not closed.');
      return e;
    }
    if (/^(\d|\.)/.test(tok)) return { t: 'num', v: Number(tok) };
    if ((FUNCS as readonly string[]).includes(tok)) {
      if (this.next() !== '(') throw new Error(`Write ${tok} with brackets, such as ${tok}(x).`);
      const e = this.expr();
      if (this.next() !== ')') throw new Error('A bracket is not closed.');
      return { t: 'op', kind: tok as OpKind, args: [e], k: 0 };
    }
    if (/^[a-z]\d?$/.test(tok)) {
      if (tok === 'f' || /^n\d$/.test(tok))
        throw new Error(`"${tok}" names a node in the drawing; call the variable something else.`);
      return { t: 'var', name: tok };
    }
    if (tok === ')') throw new Error('There is a ")" with no "(" before it.');
    if (/^[a-z]/.test(tok))
      throw new Error(
        `"${tok}" is not a variable (a letter with at most one digit, such as w1) or a function (tanh, relu, exp, sigmoid).`,
      );
    throw new Error(`"${tok}" is out of place.`);
  }
}

/** Fold operations on constants into constants. */
function fold(a: Ast): Ast {
  if (a.t !== 'op') return a;
  const args = a.args.map(fold);
  if (args.every((x) => x.t === 'num'))
    return {
      t: 'num',
      v: apply(
        a.kind,
        args.map((x) => (x as { v: number }).v),
        a.k,
      ),
    };
  return { ...a, args };
}

/** "a=2, b=-3" into values; an Error says what is wrong. */
function readValues(s: string): Map<string, number> | Error {
  const out = new Map<string, number>();
  for (const part of s
    .replace(/\s*=\s*/g, '=')
    .split(/[,\s]+/)
    .filter(Boolean)) {
    const m = /^([a-z]\d?)=(-?\d+(?:\.\d{1,2})?|-?\.\d{1,2})$/.exec(part.replace('−', '-'));
    if (!m) return new Error(`Give values like a=2, b=-0.5 (two decimals at most), not "${part}".`);
    const v = Number(m[2]);
    if (Math.abs(v) > 10) return new Error(`Keep values between −10 and 10 (${m[1]} is ${v}).`);
    out.set(m[1]!, v);
  }
  return out;
}

/** A value as the page writes it in the input: 2, -3, 0.5. */
export const plain = (x: number): string => String(Math.round(x * 100) / 100);

/** Parse the learner's text into a graph; an Error says what is wrong. */
export function parseGraph(text: string): Graph | Error {
  const [exprText = '', valueText = '', ...extra] = text.toLowerCase().split(';');
  if (extra.length) return new Error('Use one semicolon, between the expression and the values.');
  const expr = exprText.replace(/\s+/g, ' ').trim();
  if (!expr) return new Error('Type an expression first, such as (a*b + c) * a.');
  const toks = tokenize(expr);
  if (toks instanceof Error) return toks;
  let ast: Ast;
  try {
    const p = new Parser(toks);
    ast = p.expr();
    if (!p.done()) {
      const tok = p.peek()!;
      return new Error(
        tok === ')'
          ? 'There is a ")" with no "(" before it.'
          : `Something is missing before "${tok}" (write a*b, not a b).`,
      );
    }
  } catch (e) {
    return e as Error;
  }
  ast = fold(ast);
  if (ast.t === 'num') return new Error('Use at least one variable, such as a*b.');
  if (ast.t === 'var') return new Error('Use at least one operation, such as a*b or tanh(a).');
  const given = readValues(valueText);
  if (given instanceof Error) return given;

  const nodes: GNode[] = [];
  const vars: number[] = [];
  const byName = new Map<string, number>();
  const edges: Edge[] = [];
  let ops = 0;
  const build = (a: Ast): Arg => {
    if (a.t === 'num') return { c: a.v };
    if (a.t === 'var') {
      let i = byName.get(a.name);
      if (i === undefined) {
        const value = given.get(a.name) ?? DEFAULT_VALUES[vars.length % DEFAULT_VALUES.length]!;
        i = nodes.push({ name: a.name, kind: 'var', args: [], k: 0, value }) - 1;
        byName.set(a.name, i);
        vars.push(i);
      }
      return { node: i };
    }
    const args = a.args.map(build);
    ops++;
    const i = nodes.push({ name: `n${ops}`, kind: a.kind, args, k: a.k, value: 0 }) - 1;
    args.forEach((x, slot) => {
      if (!isConst(x)) edges.push({ from: x.node, to: i, slot });
    });
    return { node: i };
  };
  build(ast);
  if (vars.length > MAX_VARS)
    return new Error(`Use at most ${MAX_VARS} variables, so the drawing stays readable.`);
  if (ops > MAX_OPS)
    return new Error(`Use at most ${MAX_OPS} operations, so the drawing stays readable.`);
  const unknown = [...given.keys()].filter((k) => !byName.has(k));
  if (unknown.length) return new Error(`${unknown[0]} has a value but is not in the expression.`);
  nodes[nodes.length - 1]!.name = 'f';
  const g: Graph = {
    text: '',
    expr,
    nodes,
    vars,
    edges,
    out: nodes.length - 1,
  };
  g.text = `${expr}; ${vars.map((v) => `${nodes[v]!.name}=${plain(nodes[v]!.value)}`).join(', ')}`;
  if (depthOf(g) > MAX_DEPTH)
    return new Error('That chain is too long to draw; nest fewer operations.');

  const values = forwardValues(g);
  const bad = values.findIndex((v) => !Number.isFinite(v));
  if (bad >= 0)
    return new Error(
      `${nodes[bad]!.name} divides by 0. Pick values that keep the divisor away from 0.`,
    );
  const grads = backwardPass(g, values, [], true).grads;
  if ([...values, ...grads].some((v) => !Number.isFinite(v) || Math.abs(v) > MAX_ABS))
    return new Error('The numbers get too big to show. Try smaller values.');
  return g;
}

// ---------------------------------------------------------------------------------------------
// Layers, for the drawing and the depth limit

/** Each node's layer: an operation one past its deepest operand, a variable just before its first reader. */
export function layersOf(g: Graph): number[] {
  const layer = g.nodes.map(() => 0);
  g.nodes.forEach((n, i) => {
    if (n.kind !== 'var')
      layer[i] = 1 + Math.max(...n.args.map((a) => (isConst(a) ? 0 : layer[a.node]!)));
  });
  for (const v of g.vars) {
    const readers = g.edges.filter((e) => e.from === v).map((e) => layer[e.to]!);
    layer[v] = Math.max(0, Math.min(...readers) - 1);
  }
  return layer;
}

export const depthOf = (g: Graph) => Math.max(...layersOf(g)) + 1;

// ---------------------------------------------------------------------------------------------
// Words

/** An operand as written in a formula. */
const argText = (g: Graph, a: Arg) =>
  isConst(a) ? short(a.c).replace(/^(−?)\./, '$10.') : g.nodes[a.node]!.name;

/** What a node computes: "n1 = a × b", "f = tanh(n2)", "n2 = n1²". */
export function formula(g: Graph, i: number): string {
  const n = g.nodes[i]!;
  if (n.kind === 'var') return n.name;
  const [x = '', y = ''] = n.args.map((a) => argText(g, a));
  const body = {
    add: `${x} + ${y}`,
    sub: `${x} − ${y}`,
    mul: `${x} × ${y}`,
    div: `${x} / ${y}`,
    neg: `−${x}`,
    pow: `${x}${'⁰¹²³⁴'[n.k]}`,
    tanh: `tanh(${x})`,
    relu: `relu(${x})`,
    exp: `exp(${x})`,
    sigmoid: `σ(${x})`,
  }[n.kind];
  return `${n.name} = ${body}`;
}
