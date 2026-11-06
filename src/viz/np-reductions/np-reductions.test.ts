import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { npReductions } from '.';
import { parseFormula, parseGraphInstance, type NpSettings, type UGraph } from './model';

const settings = (check: NpSettings['check'] = 'witness'): NpSettings => ({ check });

// ----- References, written separately from the model: plain brute force -----

type Clause = { name: string; neg: boolean }[];

function refSat(clauses: Clause[]): boolean {
  const names = [...new Set(clauses.flat().map((l) => l.name))];
  for (let mask = 0; mask < 1 << names.length; mask++) {
    const val = (n: string) => ((mask >> names.indexOf(n)) & 1) === 1;
    if (clauses.every((c) => c.some((l) => val(l.name) !== l.neg))) return true;
  }
  return false;
}

function subsets(xs: string[]): string[][] {
  const out: string[][] = [];
  for (let mask = 0; mask < 1 << xs.length; mask++) out.push(xs.filter((_, i) => (mask >> i) & 1));
  return out;
}

const has = (g: UGraph, a: string, b: string) =>
  g.edges.some(([u, v]) => (u === a && v === b) || (u === b && v === a));

function refIs(g: UGraph, k: number): boolean {
  return subsets(g.vertices).some(
    (s) => s.length >= k && s.every((a, i) => s.slice(i + 1).every((b) => !has(g, a, b))),
  );
}
function refClique(g: UGraph, k: number): boolean {
  return subsets(g.vertices).some(
    (s) => s.length >= k && s.every((a, i) => s.slice(i + 1).every((b) => has(g, a, b))),
  );
}
function refVc(g: UGraph, k: number): boolean {
  return subsets(g.vertices).some(
    (s) => s.length <= k && g.edges.every(([u, v]) => s.includes(u) || s.includes(v)),
  );
}
function refSc(m: number, sets: { name: string; items: number[] }[], k: number): boolean {
  return subsets(sets.map((s) => s.name)).some((pick) => {
    if (pick.length > k) return false;
    const got = new Set(sets.filter((s) => pick.includes(s.name)).flatMap((s) => s.items));
    return Array.from({ length: m }, (_, i) => i + 1).every((x) => got.has(x));
  });
}

// ----- Random tiny instances -----

const litArb = fc.record({ name: fc.constantFrom('a', 'b', 'c'), neg: fc.boolean() });
const clauseArb = fc
  .uniqueArray(litArb, {
    minLength: 1,
    maxLength: 3,
    selector: (l) => `${l.neg}${l.name}`,
  })
  .map((c) => c as Clause);
const formulaArb = fc.array(clauseArb, { minLength: 1, maxLength: 4 });
const formulaText = (cs: Clause[]) =>
  cs.map((c) => `(${c.map((l) => `${l.neg ? '!' : ''}${l.name}`).join(' | ')})`).join(', ');

const graphArb = fc.integer({ min: 1, max: 6 }).chain((n) => {
  const names = 'ABCDEF'.slice(0, n).split('');
  const pairs: [string, string][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([names[i]!, names[j]!]);
  return fc
    .tuple(fc.subarray(pairs), fc.integer({ min: 0, max: n }))
    .map(([edges, k]) => ({ names, edges, k }));
});
const graphText = (g: { names: string[]; edges: [string, string][]; k: number }) => {
  const used = new Set(g.edges.flat());
  const lone = g.names.filter((v) => !used.has(v));
  return `${[...g.edges.map(([u, v]) => `${u}-${v}`), ...lone].join(', ')} k=${g.k}`;
};

function checkSteps(t: Timeline<unknown, NpSettings, unknown>) {
  const tl = t as unknown as Timeline<import('./model').NpState, NpSettings, unknown>;
  for (let i = 0; i < tl.length; i++) {
    const g = tl.at(i).step.state.inst.graph;
    if (!g) continue;
    const keys = g.edges.map(([u, v]) => [u, v].sort().join(' '));
    expect(new Set(keys).size, 'no parallel edges').toBe(keys.length);
    for (const [u, v] of g.edges) {
      expect(u).not.toBe(v);
      expect(g.vertices).toContain(u);
      expect(g.vertices).toContain(v);
    }
    for (const v of g.vertices) expect(g.pos[v], `${v} has a place`).toBeDefined();
  }
}

describe('NP reductions', () => {
  it('reads formulas and graphs', () => {
    expect(parseFormula('a | !b | c, !a | b')).not.toBeInstanceOf(Error);
    expect(parseFormula('a | b | c | d')).toBeInstanceOf(Error);
    expect(parseFormula('a | a')).toBeInstanceOf(Error);
    expect(parseFormula('a, b, c, d, e')).toBeInstanceOf(Error);
    expect(parseGraphInstance('A-B, B-C k=2')).not.toBeInstanceOf(Error);
    expect(parseGraphInstance('A>B')).toBeInstanceOf(Error);
    expect(parseGraphInstance('A-B k=3')).toBeInstanceOf(Error);
  });

  it('3-SAT to IND-SET keeps the answer, and the certificate checks out', () => {
    fc.assert(
      fc.property(formulaArb, fc.constantFrom('witness' as const, 'none' as const), (cs, check) => {
        const t = new Timeline(npReductions, settings(check), 1, [
          ['load', formulaText(cs)],
          ['toIs'],
        ]);
        checkSteps(t as never);
        const i = t.endState().inst;
        expect(i.problem).toBe('is');
        const g = i.graph!;
        expect(g.vertices.length).toBe(cs.flat().length);
        expect(i.k).toBe(cs.length);
        // Edges: all pairs inside a clause, plus x / ¬x across clauses.
        let want = cs.reduce((a, c) => a + (c.length * (c.length - 1)) / 2, 0);
        for (let a = 0; a < cs.length; a++)
          for (let b = a + 1; b < cs.length; b++)
            for (const x of cs[a]!)
              for (const y of cs[b]!) if (x.name === y.name && x.neg !== y.neg) want++;
        expect(g.edges.length).toBe(want);
        const sat = refSat(cs);
        expect(refIs(g, i.k), 'yes maps to yes, no to no').toBe(sat);
        if (check === 'witness') {
          expect(i.answer).toBe(sat ? 'yes' : 'no');
          if (sat) {
            const w = i.witness!;
            expect(w.length).toBe(i.k);
            for (const a of w) for (const b of w) if (a !== b) expect(has(g, a, b)).toBe(false);
          }
        } else expect(i.answer).toBeNull();
      }),
      { numRuns: 300 },
    );
  });

  it('graph reductions keep the answer, and the certificates check out', () => {
    fc.assert(
      fc.property(graphArb, (spec) => {
        const text = graphText(spec);
        const run = (ops: OpCall[]) => new Timeline(npReductions, settings(), 1, ops);
        const src = run([['load', text]]).endState().inst;
        const g0 = src.graph!;
        const yes = refIs(g0, spec.k);
        // IS -> VC -> SC
        const a = run([['load', text], ['toVc'], ['toSc']]);
        checkSteps(a as never);
        const vc = a.entries[1]!.end.inst;
        expect(vc.problem).toBe('vc');
        expect(vc.k).toBe(g0.vertices.length - spec.k);
        expect(vc.graph!.edges).toEqual(g0.edges);
        expect(refVc(vc.graph!, vc.k)).toBe(yes);
        expect(vc.answer).toBe(yes ? 'yes' : 'no');
        if (yes)
          for (const [u, v] of vc.graph!.edges)
            expect(vc.witness!.includes(u) || vc.witness!.includes(v)).toBe(true);
        const sc = a.endState().inst;
        expect(sc.problem).toBe('sc');
        expect(sc.family!.m).toBe(g0.edges.length);
        expect(refSc(sc.family!.m, sc.family!.sets, sc.k)).toBe(yes);
        expect(sc.answer).toBe(yes ? 'yes' : 'no');
        // IS -> CLIQUE -> VC
        const b = run([['load', text], ['toClique'], ['toVc']]);
        checkSteps(b as never);
        const cl = b.entries[1]!.end.inst;
        expect(cl.problem).toBe('clique');
        expect(cl.graph!.edges.length).toBe(
          (g0.vertices.length * (g0.vertices.length - 1)) / 2 - g0.edges.length,
        );
        for (const [u, v] of cl.graph!.edges) expect(has(g0, u, v)).toBe(false);
        expect(refClique(cl.graph!, cl.k)).toBe(yes);
        if (yes)
          for (const x of cl.witness!)
            for (const y of cl.witness!) if (x !== y) expect(has(cl.graph!, x, y)).toBe(true);
        const vc2 = b.endState().inst;
        expect(vc2.problem).toBe('vc');
        expect(vc2.graph!.edges).toEqual(g0.edges);
        expect(refVc(vc2.graph!, vc2.k)).toBe(yes);
      }),
      { numRuns: 300 },
    );
  });

  it('says why a reduction cannot start from the current problem', () => {
    const t = new Timeline(npReductions, settings(), 1, [['toVc'], ['toSc'], ['toClique']]);
    for (const e of t.entries) expect(e.end.inst.problem).toBe('3sat');
    expect(t.entries[0]!.steps.at(-1)!.say).toMatch(/starts from INDEPENDENT-SET and CLIQUE/);
  });
});
