import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import {
  formatGrammar,
  inLanguage,
  isCnf,
  makeGrammar,
  treeYield,
  wordsUpTo,
  type Rule,
} from '../_grammar/grammar';
import { cykParsing, driverGrammar, parseInput } from '.';
import { defaults, type CykSettings } from './model';

const run = (calls: OpCall[], settings: CykSettings = defaults) =>
  new Timeline(cykParsing, settings, 1, calls);

const symArb = fc.constantFrom('S', 'A', 'B', 'a', 'b');
const grammarArb = fc
  .array(
    fc.record({ lhs: fc.constantFrom('S', 'A', 'B'), rhs: fc.array(symArb, { maxLength: 3 }) }),
    { minLength: 1, maxLength: 6 },
  )
  .map((rules) => {
    const all = rules[0]!.lhs === 'S' ? rules : [{ lhs: 'S', rhs: ['a'] }, ...rules];
    const seen = new Set<string>();
    return makeGrammar(
      'S',
      all.filter((r) => {
        const k = `${r.lhs}>${r.rhs.join('')}`;
        return !seen.has(k) && !!seen.add(k);
      }) as Rule[],
    );
  });

describe('cyk', () => {
  it('shows each stage of the conversion, or only the result', () => {
    const g = 'S -> ASA | aB; A -> B | S; B -> b | eps';
    const staged = run([['load', g]]);
    const steps = staged.entries[0]!.steps;
    expect(steps).toHaveLength(12);
    expect(steps[0]!.state.shown).toBe(-1);
    expect(steps.map((s) => s.state.shown)).toEqual([-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(steps[2]!.say).toContain('Remove the ε-rule B → ε');
    expect(steps[2]!.say).toContain('S → a and A → ε');
    const quick = run([['load', g]], { conversion: 'result' });
    expect(quick.entries[0]!.steps).toHaveLength(1);
    expect(quick.endState()).toEqual(staged.endState());
    expect(isCnf(quick.endState().cnf.cnf)).toBe(true);
  });

  it('fills the classic table cell by cell, row by row', () => {
    const t = run([
      ['load', 'S -> AB | BC; A -> BA | a; B -> CC | b; C -> AB | a'],
      ['parse', 'baaba'],
    ]);
    const e = t.entries[1]!;
    const cells = e.steps.filter((s) => s.level === 2 && s.extra?.cell).map((s) => s.extra!.cell!);
    // 15 cells, bottom row first, left to right.
    expect(cells).toHaveLength(15);
    expect(cells.slice(0, 6).map((c) => [c.len, c.i])).toEqual([
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
      [1, 4],
      [2, 0],
    ]);
    expect(e.steps.filter((s) => s.level === 3)).toHaveLength(20);
    const end = e.end;
    expect(end.accept).toBe(true);
    expect(end.table![4]![0]).toEqual(['S₀', 'S', 'A', 'C']);
    expect(end.splits).toBe(20);
    expect(end.cells).toBe(15);
    expect(treeYield(end.tree!).join('')).toBe('baaba');
    expect(e.steps.at(-1)!.say).toContain('S₀ is in table(1, 5)');
  });

  it('handles the empty word with S₀ → ε', () => {
    const t = run(
      [
        ['load', 'S -> aSb | eps'],
        ['parse', 'eps'],
        ['load', 'S -> aSb | ab'],
        ['parse', 'eps'],
      ],
      { conversion: 'result' },
    );
    expect(t.entries[1]!.end.accept).toBe(true);
    expect(t.entries[3]!.end.accept).toBe(false);
    expect(t.entries[3]!.steps.at(-1)!.say).toContain('There is no rule S₀ → ε');
  });

  it('refuses bad input, naming what is wrong', () => {
    const t = run([
      ['load', 'S -> a -> b'],
      ['parse', 'abc'],
      ['parse', 'S -> a'],
      ['load', 'ab'],
    ]);
    const say = t.entries.map((e) => e.steps.at(-1)!.say);
    expect(say[0]).toContain('two arrows');
    expect(say[1]).toContain('"c" is not a terminal');
    expect(say[2]).toContain('looks like a grammar');
    expect(say[3]).toContain('not a grammar');
    expect(parseInput('aaaaabbbbb')).toBeInstanceOf(Error);
    expect(parseInput('aabb')).toBe('aabb');
  });

  it('agrees with brute force on random grammars and words, and every cell is right', () => {
    fc.assert(
      fc.property(grammarArb, fc.array(fc.constantFrom('a', 'b'), { maxLength: 5 }), (g, w) => {
        const t = run(
          [
            ['load', formatGrammar(g, true)],
            ['parse', w.join('') || 'eps'],
          ],
          { conversion: 'result' },
        );
        const e = t.entries[1]!;
        if (!g.terminals.length || w.some((c) => !g.terminals.includes(c))) return;
        const end = e.end;
        expect(end.accept, `${formatGrammar(g)}: ${w.join('')}`).toBe(inLanguage(g, w));
        if (end.accept) expect(treeYield(end.tree!)).toEqual(w);
        const cnf = end.cnf.cnf;
        // Each cell holds exactly the variables that derive its substring.
        end.table!.forEach((row, l) =>
          row.forEach((cell, i) => {
            const sub = w.slice(i, i + l + 1).join('');
            for (const v of cnf.variables) {
              const words = wordsUpTo(makeGrammar(v, cnf.rules), sub.length);
              expect(cell!.includes(v)).toBe(words.has(sub));
            }
          }),
        );
        // The counters add up as the table fills.
        let cells = 0;
        let splits = 0;
        for (const step of e.steps) {
          expect(step.state.cells).toBeGreaterThanOrEqual(cells);
          expect(step.state.splits).toBeGreaterThanOrEqual(splits);
          cells = step.state.cells;
          splits = step.state.splits;
        }
        const n = w.length;
        expect(cells).toBe((n * (n + 1)) / 2);
        expect(splits).toBe((n * n * n - n) / 6);
      }),
      { numRuns: 150 },
    );
  });

  it('writes the driver script from the model', () => {
    const { input, expected } = cykParsing.code!.script(
      [
        ['parse', 'aabb'],
        ['parse', 'aab'],
        ['parse', 'eps'],
      ],
      defaults,
    );
    expect(input[0]).toBe(
      'load S0 -> eps | U1 S1 | U1 U2; S -> U1 S1 | U1 U2; S1 -> S U2; U1 -> a; U2 -> b',
    );
    expect(input.slice(1)).toEqual(['parse aabb', 'parse aab', 'parse eps']);
    expect(expected).toEqual(['yes S0 S', 'no', 'yes']);
    expect(driverGrammar(run([]).initial.state.cnf.cnf)).toBe(input[0]!.slice(5));
  });
});
