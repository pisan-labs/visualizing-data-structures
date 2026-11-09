import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import {
  checkDerivation,
  formatGrammar,
  inLanguage,
  makeGrammar,
  nextVariable,
  treeOf,
  treeYield,
  type Rule,
} from '../_grammar/grammar';
import { cfgDerivation, parseInput } from '.';
import { defaults, type CfgSettings } from './model';

const run = (calls: OpCall[], settings: CfgSettings = defaults) =>
  new Timeline(cfgDerivation, settings, 1, calls);

const symArb = fc.constantFrom('S', 'A', 'a', 'b');
const grammarArb = fc
  .array(fc.record({ lhs: fc.constantFrom('S', 'A'), rhs: fc.array(symArb, { maxLength: 3 }) }), {
    minLength: 1,
    maxLength: 6,
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

describe('cfg-derivation', () => {
  it('plays a leftmost derivation one rule per step, growing the tree', () => {
    const t = run([
      ['load', 'S -> aSb | eps'],
      ['derive', 'aabb'],
    ]);
    const steps = t.entries[1]!.steps;
    expect(steps).toHaveLength(4);
    expect(steps[0]!.say).toContain('found a leftmost derivation of aabb in 3 steps');
    expect(steps[1]!.say).toContain('S → aSb on the leftmost S: S ⇒ aSb');
    expect(steps[3]!.say).toContain('aaSbb ⇒ aabb');
    expect(steps.map((s) => s.state.run!.at)).toEqual([0, 1, 2, 3]);
  });

  it('says so when the word is not in the language', () => {
    const t = run([
      ['load', 'S -> aSb | eps'],
      ['derive', 'aab'],
    ]);
    const last = t.entries[1]!.steps.at(-1)!;
    expect(last.lines).toEqual(['derive.none']);
    expect(last.say).toContain('aab is not in the language');
    expect(t.endState().run).toBeNull();
  });

  it('does not say Java settles the dangling else with a side rule', () => {
    // Java's grammar resolves it with statements that cannot end in an if without an else.
    expect(cfgDerivation.explain).not.toContain('C, Java and friends settle it');
    expect(cfgDerivation.explain).toContain("Java's grammar builds the same rule in");
  });

  it('gives up at the cap and asks CYK', () => {
    const t = run([
      ['load', 'S -> SS | (S) | eps'],
      ['derive', '(((())))('],
    ]);
    const last = t.entries[1]!.steps.at(-1)!;
    expect(last.lines).toEqual(['derive.cap']);
    expect(last.say).toContain('gave up after 10,000');
    expect(last.say).toContain('is not in the language');
  });

  it('finds two trees for a+a*a without precedence, and one with it', () => {
    const two = run([
      ['load', 'E -> E+E | E*E | (E) | a'],
      ['ambiguity', 'a+a*a'],
    ]).endState();
    expect(two.second?.shown).toBe(true);
    const g = two.grammar;
    const t1 = treeOf(g, two.run!.steps).trees.at(-1)!;
    const t2 = treeOf(g, two.second!.steps).trees.at(-1)!;
    expect(treeYield(t1).join('')).toBe('a+a*a');
    expect(treeYield(t2).join('')).toBe('a+a*a');
    expect(t1[t1[0]!.kids[1]!]!.sym).not.toBe(t2[t2[0]!.kids[1]!]!.sym);
    const one = run([
      ['load', 'E -> E+T | T; T -> T*F | F; F -> (E) | a'],
      ['ambiguity', 'a+a*a'],
    ]).endState();
    expect(one.second).toBeNull();
    expect(one.run).not.toBeNull();
  });

  it('refuses bad grammars and words, naming what is wrong, and keeps the grammar', () => {
    const t = run([
      ['load', 'S -> aSb | '],
      ['derive', 'abc'],
      ['load', 'aabb'],
      ['derive', 'S -> a'],
    ]);
    const say = t.entries.map((e) => e.steps.at(-1)!.say);
    expect(say[0]).toContain('"S -> aSb |" has an empty alternative');
    expect(say[1]).toContain('"c" is not a terminal');
    expect(say[2]).toContain('not a grammar');
    expect(say[3]).toContain('looks like a grammar');
    expect(formatGrammar(t.endState().grammar)).toBe('S → aSb | ε');
    expect(parseInput('S -> ')).toBeInstanceOf(Error);
    expect(parseInput('aSb')).toBeInstanceOf(Error);
    expect(parseInput('a b')).toBe('a b');
  });

  it('agrees with brute force, and every step keeps the form, the tree and the word in line', () => {
    fc.assert(
      fc.property(
        grammarArb,
        fc.array(fc.constantFrom('a', 'b'), { maxLength: 4 }),
        fc.constantFrom('leftmost' as const, 'rightmost' as const),
        (g, w, order) => {
          const word = w.join('') || 'eps';
          const t = run(
            [
              ['load', formatGrammar(g, true)],
              ['derive', word],
            ],
            { order },
          );
          const e = t.entries[1]!;
          const last = e.steps.at(-1)!;
          if (last.lines.includes('derive.cap')) return;
          const member = inLanguage(g, w);
          const end = e.end;
          expect(end.run !== null, `${formatGrammar(g)}: ${word}`).toBe(member);
          if (!end.run) return;
          const forms = treeOf(end.grammar, end.run.steps);
          const derivation = {
            steps: end.run.steps,
            forms: forms.forms.map((f) => f.map((x) => x.sym)),
          };
          expect(checkDerivation(end.grammar, derivation, w, order)).toBeNull();
          for (const step of e.steps) {
            const r = step.state.run!;
            const tree = forms.trees[r.at]!;
            const form = forms.forms[r.at]!;
            // The form is the tree's frontier: its leaves left to right, without ε.
            const leaves = tree.filter((n) => !n.kids.length && n.sym !== 'ε').map((n) => n.id);
            const order2 = new Map<number, number>();
            const walk = (id: number) => {
              order2.set(id, order2.size);
              tree[id]!.kids.forEach(walk);
            };
            walk(0);
            leaves.sort((a, b) => order2.get(a)! - order2.get(b)!);
            expect(form.map((f) => f.node)).toEqual(leaves);
            // One inner node per rule used.
            expect(tree.filter((n) => n.kids.length).length).toBe(r.at);
            // The variable highlighted next is the leftmost (or rightmost) one.
            const next = nextVariable(
              form.map((f) => f.sym),
              order,
            );
            const active = step.marks.filter((m) => m.role === 'active' && m.id.startsWith('f-'));
            expect(active.map((m) => m.id)).toEqual(next < 0 ? [] : [`f-${form[next]!.node}`]);
          }
          expect(treeYield(forms.trees.at(-1)!)).toEqual(w);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('writes the driver script from the model', () => {
    const { input, expected } = cfgDerivation.code!.script(
      [
        ['load', 'S -> aSb | eps'],
        ['derive', 'ab'],
        ['derive', 'aab'],
        ['derive', 'eps'],
      ],
      defaults,
    );
    expect(input).toEqual([
      'load S -> aSb | eps',
      'load S -> aSb | eps',
      'derive ab',
      'derive aab',
      'derive eps',
    ]);
    expect(expected).toEqual(['S => aSb => ab', 'no', 'S => eps']);
  });
});
