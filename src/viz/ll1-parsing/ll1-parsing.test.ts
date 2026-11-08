import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import {
  EPS,
  formatGrammar,
  inLanguage,
  isVariable,
  makeGrammar,
  treeYield,
  type Grammar,
  type Rule,
} from '../_grammar/grammar';
import { ll1Parsing } from '.';
import { analyze, defaults, END, type Ll1Settings } from './model';

const run = (calls: OpCall[], settings: Ll1Settings = defaults) =>
  new Timeline(ll1Parsing, settings, 1, calls);

/** Reference FIRST: a terminal a is in FIRST(A) when A derives a string starting with a (brute force on forms). */
function refFirst(g: Grammar, A: string): Set<string> {
  const out = new Set<string>();
  const seen = new Set<string>();
  let frontier: string[][] = [[A]];
  for (let depth = 0; depth < 8 && frontier.length; depth++) {
    const next: string[][] = [];
    for (const f of frontier) {
      const key = f.join(' ');
      if (seen.has(key) || f.length > 6) continue;
      seen.add(key);
      if (!f.length) {
        out.add(EPS);
        continue;
      }
      if (!isVariable(f[0]!)) {
        out.add(f[0]!);
        continue;
      }
      for (const r of g.rules.filter((x) => x.lhs === f[0])) next.push([...r.rhs, ...f.slice(1)]);
    }
    frontier = next;
  }
  return out;
}

const symArb = fc.constantFrom('S', 'A', 'a', 'b', 'c');
const grammarArb = fc
  .array(fc.record({ lhs: fc.constantFrom('S', 'A'), rhs: fc.array(symArb, { maxLength: 3 }) }), {
    minLength: 1,
    maxLength: 5,
  })
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

describe('ll1-parsing', () => {
  it('builds the dragon book’s sets and table for the expression grammar', () => {
    const s = run([]).initial.state;
    expect(s.first.E).toEqual(['(', 'a']);
    expect(s.first["E'"]).toEqual(['+', EPS]);
    expect(s.follow.E).toEqual([')', END]);
    expect(s.follow.F).toEqual(['+', '*', ')', END]);
    expect(s.conflicts).toEqual([]);
  });

  it('parses a+a*a top down and builds its tree', () => {
    const t = run([['parse', 'a+a*a']]);
    const r = t.endState().run!;
    expect(r.verdict).toBe('accept');
    expect(treeYield(r.tree).join('')).toBe('a+a*a');
    expect(r.made).toBe(r.tree.length);
  });

  it('finds conflicts and refuses, or guesses and gives up', () => {
    const lr = 'E -> E+T | T; T -> T*F | F; F -> (E) | a';
    const t = run([
      ['load', lr],
      ['parse', 'a'],
    ]);
    expect(t.entries[0]!.end.conflicts.length).toBe(4);
    expect(t.entries[1]!.steps.at(-1)!.say).toContain('The table has');
    const g = run(
      [
        ['load', lr],
        ['parse', 'a'],
      ],
      { conflicts: 'first' },
    );
    expect(g.endState().run!.verdict).toBe('gave-up');
  });

  it('agrees with references on random grammars (property)', () => {
    fc.assert(
      fc.property(
        grammarArb,
        fc.array(fc.constantFrom('a', 'b', 'c'), { maxLength: 4 }),
        (g, w) => {
          const s = analyze(g);
          for (const v of g.variables) {
            const ref = refFirst(g, v);
            // The brute force is bounded, so it may miss symbols; never invent one.
            for (const x of ref) expect(s.first[v], `${formatGrammar(g)} FIRST(${v})`).toContain(x);
          }
          if (s.conflicts.length || w.some((c) => !g.terminals.includes(c))) return;
          const t = run([
            ['load', formatGrammar(g, true)],
            ['parse', w.join('') || 'eps'],
          ]);
          const e = t.entries[1]!;
          const r = e.end.run!;
          if (r.verdict === 'gave-up') return;
          // An LL(1) parse accepts exactly the words of the language.
          expect(r.verdict === 'accept', `${formatGrammar(g)}: ${w.join('')}`).toBe(
            inLanguage(g, w),
          );
          if (r.verdict === 'accept') expect(treeYield(r.tree)).toEqual(w);
          // Invariants on every step: $ at the bottom, moves count up, nodes only grow.
          let made = 0;
          let moves = -1;
          for (const st of e.steps) {
            const x = st.state.run!;
            expect(x.stack[0]!.sym).toBe(END);
            expect(x.made).toBeGreaterThanOrEqual(made);
            expect(x.moves).toBeGreaterThanOrEqual(moves);
            made = x.made;
            moves = x.moves;
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('writes the driver script from the model', () => {
    const { input, expected } = ll1Parsing.code!.script([['parse', 'a+a']], defaults);
    expect(input.slice(0, 2)).toEqual([
      'policy refuse',
      "load E -> T E'; E' -> + T E'; E' -> eps; T -> F T'; T' -> * F T'; T' -> eps; F -> ( E ); F -> a",
    ]);
    expect(expected[0]).toBe("E: ( a; E': + eps; T: ( a; T': * eps; F: ( a");
    expect(expected.at(-1)).toMatch(/^accept \d+$/);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(ll1Parsing, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(ll1Parsing, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
