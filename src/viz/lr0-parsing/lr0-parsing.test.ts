import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { formatGrammar, inLanguage, makeGrammar, type Rule } from '../_grammar/grammar';
import { lr0Parsing } from '.';
import { build, closure, defaults, END, type Lr0Settings } from './model';

const run = (calls: OpCall[], settings: Lr0Settings = defaults) =>
  new Timeline(lr0Parsing, settings, 1, calls);

const symArb = fc.constantFrom('S', 'A', 'a', 'b');
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

describe('lr0-parsing', () => {
  it('builds the 9 states of the default grammar, without conflicts', () => {
    const s = run([]).initial.state;
    expect(s.sets).toHaveLength(9);
    expect(s.conflicts).toEqual([]);
    expect(s.action[1]![END]!.map((a) => a.kind)).toContain('accept');
  });

  it('parses (a+a)+a and rejects a+)', () => {
    const t = run([
      ['parse', '(a+a)+a'],
      ['parse', 'a+)'],
    ]);
    expect(t.entries[0]!.end.run!.verdict).toBe('accept');
    expect(t.entries[1]!.end.run!.verdict).toBe('reject');
  });

  it('finds the precedence conflicts in LR(0), and SLR(1) settles them', () => {
    const g = 'E -> E+T | T; T -> T*F | F; F -> (E) | a';
    const lr = run([['load', g]]).endState();
    expect(lr.conflicts.some((c) => c.kind === 'shift-reduce')).toBe(true);
    const slr = run(
      [
        ['load', g],
        ['parse', 'a+a*a'],
      ],
      { method: 'slr1' },
    );
    expect(slr.entries[0]!.end.conflicts).toEqual([]);
    expect(slr.endState().run!.verdict).toBe('accept');
  });

  it('agrees with brute force and keeps its invariants (property)', () => {
    fc.assert(
      fc.property(
        grammarArb,
        fc.constantFrom<Lr0Settings['method']>('lr0', 'slr1'),
        fc.array(fc.constantFrom('a', 'b'), { maxLength: 4 }),
        (g, method, w) => {
          const s = build(g, method);
          // Every set is closed, and no two sets are the same.
          const keys = s.sets.map((set) =>
            set
              .map((i) => `${i.rule}.${i.dot}`)
              .sort()
              .join(' '),
          );
          expect(new Set(keys).size).toBe(keys.length);
          for (const set of s.sets) expect(closure(s.rules, set)).toHaveLength(set.length);
          if (s.conflicts.length || s.sets.length >= 16 || w.some((c) => !g.terminals.includes(c)))
            return;
          const t = run(
            [
              ['load', formatGrammar(g, true)],
              ['parse', w.join('') || 'eps'],
            ],
            { method },
          );
          const e = t.entries[1]!;
          const r = e.end.run!;
          expect(r.verdict === 'accept', `${formatGrammar(g)}: ${w.join('')}`).toBe(
            inLanguage(g, w),
          );
          for (const st of e.steps) {
            const x = st.state.run!;
            expect(x.states[0]).toBe(0);
            expect(x.syms.length).toBe(x.states.length - 1);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('writes the driver script from the model', () => {
    const { input, expected } = lr0Parsing.code!.script([['parse', 'a+a']], defaults);
    expect(input.slice(0, 3)).toEqual([
      'method lr0',
      'load E -> E + T; E -> T; T -> ( E ); T -> a',
      'table',
    ]);
    expect(expected).toEqual(['states 9 conflicts 0', 'accept 7']);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(lr0Parsing, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(lr0Parsing, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
