import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { backpropagation, graphLines } from '.';
import { backwardPass, forwardValues, formula, layersOf, parseGraph, topoOrder } from './graph';
import { layoutDag } from './layout';
import { defaults, num, type BpSettings } from './model';

const graph = (text: string) => {
  const g = parseGraph(text);
  if (g instanceof Error) throw g;
  return g;
};

/** An expression as text and as a plain JavaScript function of the variables, written apart from the page. */
interface Expr {
  text: string;
  fn: (env: Record<string, number>) => number;
  /** Inputs of every relu, so a test can stay clear of its kink. */
  kinks: (env: Record<string, number>) => number[];
}

const leaf: fc.Arbitrary<Expr> = fc.oneof(
  fc.constantFrom('a', 'b', 'c').map((v): Expr => ({ text: v, fn: (e) => e[v]!, kinks: () => [] })),
  fc
    .integer({ min: 1, max: 3 })
    .map((k): Expr => ({ text: String(k), fn: () => k, kinks: () => [] })),
);

const exprArb: fc.Arbitrary<Expr> = fc.letrec<{ e: Expr }>((tie) => ({
  e: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    leaf,
    fc.tuple(tie('e'), fc.constantFrom('+', '-', '*'), tie('e')).map(([x, op, y]): Expr => ({
      text: `(${x.text} ${op} ${y.text})`,
      fn: (e) =>
        op === '+' ? x.fn(e) + y.fn(e) : op === '-' ? x.fn(e) - y.fn(e) : x.fn(e) * y.fn(e),
      kinks: (e) => [...x.kinks(e), ...y.kinks(e)],
    })),
    fc
      .tuple(fc.constantFrom('tanh', 'sigmoid', 'relu', 'sq', 'neg'), tie('e'))
      .map(([f, x]): Expr => ({
        text: f === 'sq' ? `(${x.text})^2` : f === 'neg' ? `-(${x.text})` : `${f}(${x.text})`,
        fn: (e) => {
          const v = x.fn(e);
          if (f === 'tanh') return Math.tanh(v);
          if (f === 'sigmoid') return 1 / (1 + Math.exp(-v));
          if (f === 'relu') return Math.max(0, v);
          return f === 'sq' ? v * v : -v;
        },
        kinks: (e) => [...x.kinks(e), ...(f === 'relu' ? [x.fn(e)] : [])],
      })),
  ),
})).e;

const valueArb = fc.integer({ min: -200, max: 200 }).map((k) => k / 100);

/** The values part of the input, for the variables the expression uses. */
const given = (text: string, env: Record<string, number>) =>
  Object.entries(env)
    .filter(([v]) => new RegExp(`\\b${v}\\b`).test(text))
    .map(([v, x]) => `${v}=${x}`)
    .join(', ');

describe('backpropagation', () => {
  it('matches finite differences on random expressions', () => {
    let checked = 0;
    fc.assert(
      fc.property(exprArb, valueArb, valueArb, valueArb, (ex, a, b, c) => {
        const g = parseGraph(`${ex.text}; ${given(ex.text, { a, b, c })}`);
        if (g instanceof Error) return; // too big, no variable, no operation, or numbers too large
        const env: Record<string, number> = { a, b, c };
        if (ex.kinks(env).some((k) => Math.abs(k) < 0.05)) return;
        const values = forwardValues(g);
        expect(values[g.out]).toBeCloseTo(ex.fn(env), 9);
        const grads = backwardPass(g, values, [], true).grads;
        for (const v of g.vars) {
          const name = g.nodes[v]!.name;
          const h = 1e-6;
          const up = ex.fn({ ...env, [name]: env[name]! + h });
          const down = ex.fn({ ...env, [name]: env[name]! - h });
          const numeric = (up - down) / (2 * h);
          expect(Math.abs(grads[v]! - numeric)).toBeLessThan(1e-4 * Math.max(1, Math.abs(numeric)));
        }
        checked++;
      }),
      { numRuns: 400 },
    );
    expect(checked).toBeGreaterThan(100);
  });

  it('keeps its invariants on every step of random runs', () => {
    const settingsArb = fc.record({
      accumulate: fc.constantFrom('add' as const, 'overwrite' as const),
      zero: fc.boolean(),
    });
    fc.assert(
      fc.property(
        exprArb,
        valueArb,
        valueArb,
        settingsArb,
        fc.integer({ min: 1, max: 3 }),
        (ex, a, b, settings, passes) => {
          const g = parseGraph(`${ex.text}; ${given(ex.text, { a, b, c: 1 })}`);
          if (g instanceof Error) return;
          const t = new Timeline(backpropagation, settings as BpSettings, 1, [
            ['load', g.text],
            ...Array.from({ length: passes }, () => ['backward'] as [string]),
          ]);
          const values = forwardValues(t.endState().g);
          const truth = backwardPass(t.endState().g, values, [], true).grads;
          for (const e of t.entries.slice(1)) {
            let prev = e.steps[0]!.state;
            for (const step of e.steps) {
              const s = step.state;
              // The order lists each node after everything it reads.
              const pos = new Map(s.order.map((v, i) => [v, i]));
              for (const edge of s.g.edges)
                if (pos.has(edge.to)) expect(pos.get(edge.from)!).toBeLessThan(pos.get(edge.to)!);
              // A step changes at most one gradient, apart from zeroing and the seed.
              const changed = s.grads.filter((x, i) => x !== prev.grads[i]).length;
              if (!['zero', 'keep', 'seed', 'done'].some((l) => step.lines.includes(l)))
                expect(changed).toBeLessThanOrEqual(1);
              prev = s;
            }
            expect(e.end.order).toEqual(topoOrder(e.end.g));
          }
          const end = t.endState();
          expect(end.passes).toBe(passes);
          expect(end.grads[end.g.out]).toBe(1);
          for (const v of end.g.vars) {
            if (settings.accumulate === 'add')
              // Without zeroing, every pass adds its own copy.
              expect(end.grads[v]!).toBeCloseTo(truth[v]! * (settings.zero ? 1 : passes), 9);
            else {
              // Overwriting keeps the share from the last edge the pass sent along.
              const last = backwardPass(end.g, values, [], true).work.filter(
                (w) => end.g.edges[w.edge]!.from === v,
              );
              expect(end.grads[v]!).toBeCloseTo(
                last.length ? last[last.length - 1]!.contribution : 0,
                12,
              );
            }
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('parses expressions, folds constants and shares variables', () => {
    const g = graph('(a*b + c) * a');
    expect(g.text).toBe('(a*b + c) * a; a=2, b=-3, c=4');
    expect(g.nodes.map((_, i) => formula(g, i))).toEqual([
      'a',
      'b',
      'n1 = a × b',
      'c',
      'n2 = n1 + c',
      'f = n2 × a',
    ]);
    expect(g.edges.filter((e) => e.from === 0)).toHaveLength(2);
    const folded = graph('2*3*a - (1 + 1); a=0.5');
    expect(folded.nodes.map((_, i) => formula(folded, i))).toEqual([
      'a',
      'n1 = 6 × a',
      'f = n1 − 2',
    ]);
    expect(formula(graph('tanh(w1)^2 / -x; w1=1, x=2'), 5)).toBe('f = n2 / n3');
    expect(graph('a ** 3 · b × 2').expr).toBe('a ** 3 · b × 2');
    for (const bad of [
      '',
      'a',
      '2 + 3',
      'a b',
      '(a + b',
      'a + b)',
      'a^b',
      'a^5',
      'foo(a)',
      'f + 1',
      'n1 * 2',
      'a; a=20',
      'a + 1; b=2',
      'a/(b - b)',
      'exp(exp(exp(a))); a=3',
      'a*b*c*d*e*g*h',
      'a+a+a+a+a+a+a',
      'tanh(tanh(tanh(tanh(tanh(tanh(a))))))',
    ])
      expect(parseGraph(bad), bad).toBeInstanceOf(Error);
  });

  it('lays out every node in a slot of its own, operands to the left', () => {
    for (const text of [
      '(a*b + c) * a',
      'tanh(w1*x1 + w2*x2 + b)',
      'a*b + a*c + a',
      'sigmoid(exp(a) - 2*b)',
      'a*a',
    ]) {
      const g = graph(text);
      const lay = layoutDag(g);
      const layer = layersOf(g);
      const seen = new Set(lay.at.map(([l, i]) => `${l}-${i}`));
      expect(seen.size).toBe(g.nodes.length);
      for (const e of g.edges) {
        expect(layer[e.from]).toBeLessThan(layer[e.to]!);
        expect(lay.via[g.edges.indexOf(e)]).toHaveLength(layer[e.to]! - layer[e.from]! - 1);
      }
    }
  });

  it('tells the story the examples tell', () => {
    const run = (ops: string[], settings: Partial<BpSettings> = {}) =>
      new Timeline(backpropagation, { ...defaults, ...settings } as BpSettings, 1, [
        ['load', '(a*b + c) * a; a=2, b=-3, c=4'],
        ...ops.map((o) => [o] as [string]),
      ]).endState().grads;
    expect(run(['backward'])).toEqual([-8, 4, 2, 2, 2, 1]);
    expect(run(['backward'], { accumulate: 'overwrite' })[0]).toBe(-6);
    expect(run(['backward', 'backward'], { zero: false }).slice(0, 4)).toEqual([-16, 8, 2, 4]);
    expect(run(['backward', 'zero'])).toEqual([0, 0, 0, 0, 0, 0]);
    const neuron = graph('tanh(w1*x1 + w2*x2 + b); w1=0.5, x1=1, w2=0.25, x2=-2, b=0.5');
    const grads = backwardPass(neuron, forwardValues(neuron), [], true).grads;
    expect(neuron.vars.map((v) => num(grads[v]!))).toEqual([
      '0.79',
      '0.39',
      '−1.57',
      '0.2',
      '0.79',
    ]);
    const sat = graph('tanh(a*b + 1); a=2, b=3');
    expect(num(backwardPass(sat, forwardValues(sat), [], true).grads[0]!)).toBe('0.00001');
    const dead = graph('relu(a*b + c); a=2, b=-3, c=1');
    expect(backwardPass(dead, forwardValues(dead), [], true).grads.slice(0, 2)).toEqual([0, 0]);
  });

  it('writes the graph for the code tabs', () => {
    expect(graphLines(graph('(w*x - 2)^2 / 3; w=0.5, x=-1'))).toEqual([
      'clear',
      'var w 0.5',
      'var x -1',
      'op n1 mul w x',
      'op n2 sub n1 2',
      'op n3 pow n2 2',
      'op f div n3 3',
    ]);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(backpropagation, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(backpropagation, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
