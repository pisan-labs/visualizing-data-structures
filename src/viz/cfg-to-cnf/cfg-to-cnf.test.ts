import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { formatGrammar, isCnf, makeGrammar, wordsUpTo, type Rule } from '../_grammar/grammar';
import { cfgToCnf } from '.';
import { convert, defaults, grammarOf, type CnfSettings } from './model';

const run = (calls: OpCall[], settings: CnfSettings = defaults) =>
  new Timeline(cfgToCnf, settings, 1, calls);

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

/** Reference nullable set: a variable is nullable when it derives ε, by brute force. */
const nullableRef = (g: ReturnType<typeof makeGrammar>) =>
  g.variables.filter((v) => wordsUpTo(makeGrammar(v, g.rules), 0).has(''));

describe('cfg-to-cnf', () => {
  it('converts Sipser’s grammar stage by stage', () => {
    const t = run([['load', 'S -> ASA | aB; A -> B | S; B -> b | eps']]);
    const steps = t.entries[0]!.steps;
    const phases = [...new Set(steps.map((s) => s.state.phase))];
    expect(phases).toEqual(['typed', 'start', 'del', 'unit', 'term', 'bin', 'done']);
    const end = t.endState();
    expect(end.start).toBe('S₀');
    expect(end.nullable).toEqual(['B', 'A']);
    expect(isCnf(grammarOf(end))).toBe(true);
    expect(steps.some((s) => s.extra?.struck?.length)).toBe(true);
  });

  it('keeps S₀ → ε when the language has ε, and derives in 2n − 1 steps', () => {
    const t = run([
      ['load', 'S -> aSb | eps'],
      ['derive', 'aabb'],
      ['derive', 'aab'],
      ['derive', 'eps'],
    ]);
    expect(t.entries[0]!.end.rules).toContainEqual({ lhs: 'S₀', rhs: [] });
    expect(t.entries[1]!.end.derivation!.used).toHaveLength(7);
    expect(t.entries[1]!.end.derivation!.forms.at(-1)!.join('')).toBe('aabb');
    expect(t.entries[2]!.end.derivation!.ok).toBe(false);
    expect(t.entries[3]!.end.derivation!.used).toHaveLength(1);
  });

  it('refuses bad input, saying why', () => {
    const t = run([
      ['load', 'S -> a -> b'],
      ['derive', 'S -> a'],
      ['load', 'abc'],
    ]);
    const say = t.entries.map((e) => e.steps.at(-1)!.say);
    expect(say[0]).toContain('two arrows');
    expect(say[1]).toContain('looks like a grammar');
    expect(say[2]).toContain('not a grammar');
  });

  it('gives a grammar in CNF for the same language, in both orders (property)', () => {
    fc.assert(
      fc.property(grammarArb, fc.constantFrom('term-first', 'bin-first'), (g, order) => {
        const end = convert(g, order as CnfSettings['order']);
        const cnf = grammarOf(end);
        expect(isCnf(cnf), formatGrammar(cnf)).toBe(true);
        // Nullable set against brute force.
        expect(new Set(end.nullable.filter((v) => g.variables.includes(v)))).toEqual(
          new Set(nullableRef(g)),
        );
        // Same words up to length 4.
        expect(wordsUpTo(cnf, 4)).toEqual(wordsUpTo(g, 4));
        // Every step on the way: rules are unique, and the phase never goes back.
        const t = run([['load', formatGrammar(g, true)]], { order: order as CnfSettings['order'] });
        let rank = -1;
        const ranks = [
          'typed',
          'start',
          'del',
          'unit',
          order === 'term-first' ? 'term' : 'bin',
          order === 'term-first' ? 'bin' : 'term',
          'done',
        ];
        for (const s of t.entries[0]!.steps) {
          const keys = s.state.rules.map((r) => `${r.lhs}>${r.rhs.join(' ')}`);
          expect(new Set(keys).size).toBe(keys.length);
          const k = ranks.indexOf(s.state.phase);
          expect(k).toBeGreaterThanOrEqual(rank);
          rank = k;
        }
      }),
      { numRuns: 150 },
    );
  });

  it('writes the driver script from the model', () => {
    const { input, expected } = cfgToCnf.code!.script([['load', 'S -> aSb | eps']], defaults);
    expect(input).toEqual(['order term-first', 'convert S -> a S b; S -> eps']);
    expect(expected).toEqual([
      'S0 -> eps | U1 S1 | U1 U2; S1 -> S U2; S -> U1 S2 | U1 U2; S2 -> S U2; U1 -> a; U2 -> b',
    ]);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(cfgToCnf, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(cfgToCnf, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
