import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { parseFormulaInput, twoSat } from '.';
import {
  formatFormula,
  litIndex,
  parseFormula,
  satisfies,
  type Algorithm,
  type SatSettings,
  type SatState,
} from './model';

/** Reference: try all 2^n assignments. */
function brute(s: SatState): boolean {
  const n = s.vars.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const value = s.vars.map((_, i) => ((mask >> i) & 1) === 1);
    if (satisfies(s, value)) return true;
  }
  return false;
}

const settings = (algorithm: Algorithm): SatSettings => ({ ...twoSat.defaults, algorithm });

function solve(text: string, algorithm: Algorithm) {
  const t = new Timeline(twoSat, settings(algorithm), 1, [['load', text], ['run']]);
  return t.entries[1]!.steps;
}

const VARS = 'abcdef';
const formulaArb = fc
  .array(
    fc.tuple(
      fc.integer({ min: 0, max: 5 }),
      fc.boolean(),
      fc.integer({ min: 0, max: 5 }),
      fc.boolean(),
    ),
    { minLength: 1, maxLength: 14 },
  )
  .map((cs) =>
    cs
      .map(([a, na, b, nb]) => `${na ? '!' : ''}${VARS[a]} | ${nb ? '!' : ''}${VARS[b]}`)
      .join(', '),
  );

describe('2-SAT', () => {
  it('parses clauses in several notations', () => {
    const s = parseFormula('(a ∨ ¬b) ∧ (~b || c); -a + c, x') as SatState;
    expect(s.vars).toEqual(['a', 'b', 'c', 'x']);
    expect(s.clauses).toHaveLength(4);
    expect(formatFormula(s)).toBe('a | !b, !b | c, !a | c, x');
    expect(litIndex(s.clauses[3]![0])).toBe(6);
    expect(parseFormula('a | b | c')).toBeInstanceOf(Error);
    expect(parseFormula('toolong')).toBeInstanceOf(Error);
    expect(parseFormulaInput('')).toBeInstanceOf(Error);
  });

  it('solves the three-clause example and finds the contradiction', () => {
    const ok = solve('a | !b, b | c, !a | !c', 'kosaraju').at(-1)!.extra!.run!;
    expect(ok.sat).toBe(true);
    expect(ok.comps).toHaveLength(2);
    const bad = solve('a | b, a | !b, !a | b, !a | !b', 'kosaraju').at(-1)!.extra!.run!;
    expect(bad.sat).toBe(false);
    expect(bad.conflict).toBe(0);
  });

  it('forces a to be false along a chain', () => {
    const r = solve('!a | b, !b | c, !c | d, !d | !a', 'tarjan').at(-1)!.extra!.run!;
    expect(r.sat).toBe(true);
    expect(r.value[0]).toBe(false);
  });

  it('agrees with brute force, for both algorithms', () => {
    fc.assert(
      fc.property(formulaArb, fc.constantFrom<Algorithm>('kosaraju', 'tarjan'), (text, alg) => {
        const s = parseFormula(text) as SatState;
        const steps = solve(text, alg);
        for (const st of steps) {
          const r = st.extra!.run!;
          // Every arc built so far has its mirror once the clause is done.
          if (r.clause === null)
            for (const [x, y] of r.arcs)
              expect(r.arcs.some(([p, q]) => p === (y ^ 1) && q === (x ^ 1))).toBe(true);
        }
        const r = steps.at(-1)!.extra!.run!;
        expect(r.sat).toBe(brute(s));
        if (r.sat) expect(satisfies(s, r.value as boolean[])).toBe(true);
        else expect(r.comp[2 * r.conflict!]).toBe(r.comp[2 * r.conflict! + 1]);
        // Components partition the literals.
        expect(r.comps.flat().sort((a, b) => a - b)).toEqual(
          Array.from({ length: 2 * s.vars.length }, (_, k) => k),
        );
      }),
      { numRuns: 300 },
    );
  });
});
