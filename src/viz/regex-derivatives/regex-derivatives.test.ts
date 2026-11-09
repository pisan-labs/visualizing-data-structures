import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { accepts } from '../_automata/automaton';
import { matches, showRegex, type Regex } from '../_automata/regex';
import { randomRegex } from '../_automata/regex-random';
import { regexDerivatives } from '.';
import { key, show } from './derive';
import { defaults, dfaAutomaton, type RdSettings } from './model';

const run = (text: string, settings: Partial<RdSettings>, ...calls: [string, ...string[]][]) =>
  new Timeline(regexDerivatives, { ...defaults, ...settings } as RdSettings, 1, [
    ['load', text],
    ...calls,
  ]);

const words = (n: number): string[] => {
  const out = [''];
  for (let k = 0; k < out.length && out[out.length - 1]!.length < n; k++)
    for (const c of 'ab') out.push(out[k] + c);
  return out.filter((w) => w.length <= n);
};

describe('regex derivatives', () => {
  it('takes d_a((a|b)*abb) part by part', () => {
    const p = run('(a|b)*abb', {}, ['derive', 'a']).endState().panel!;
    expect(p.kind).toBe('derive');
    if (p.kind !== 'derive') return;
    expect(p.rows.map((r) => r.text)).toEqual([
      'a',
      'b',
      'a|b',
      '(a|b)*',
      'a',
      'b',
      'b',
      'bb',
      'abb',
      '(a|b)*abb',
    ]);
    expect(show(p.rows.at(-1)!.d, '|')).toBe('(a|b)*abb|bb');
  });

  it('builds the 4-state DFA for (a|b)*abb and stops a*a* without similarity', () => {
    const p = run('(a|b)*abb', {}, ['dfa']).endState().panel!;
    expect(p.kind === 'dfa' && p.states.length).toBe(4);
    const grow = run('a*a*', { similarity: 'basic' }, ['dfa']).endState().panel!;
    expect(grow.kind === 'dfa' && grow.stopped).toBeTruthy();
    const one = run('a*a*', {}, ['dfa']).endState().panel!;
    expect(one.kind === 'dfa' && one.states.length).toBe(2);
  });

  it('matches exactly the words the expression does (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e6 }),
        fc.integer({ min: 1, max: 5 }),
        fc.constantFrom<RdSettings['similarity']>('aci', 'basic'),
        fc.array(fc.constantFrom('a', 'b'), { maxLength: 5 }),
        (seed, n, similarity, letters) => {
          const r = randomRegex(makeRng(seed), n, ['a', 'b'], true);
          const text = showRegex(r);
          const w = letters.join('');
          const p = run(text, { similarity }, ['match', w || 'eps']).endState().panel!;
          expect(p.kind === 'match' && p.verdict, `${text} on ${w}`).toBe(
            matches(r, w) ? 'accept' : 'reject',
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it('gives each part a derivative for the right language (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e6 }),
        fc.integer({ min: 1, max: 5 }),
        fc.constantFrom('a', 'b'),
        (seed, n, c) => {
          const r = randomRegex(makeRng(seed), n, ['a', 'b'], true);
          const t = run(showRegex(r), {}, ['derive', c]);
          for (const st of t.entries[1]!.steps) {
            const p = st.state.panel;
            if (p?.kind !== 'derive') continue;
            for (const row of p.rows.slice(0, p.shown))
              for (const w of words(3))
                expect(matches(row.d, w), `d_${c}(${row.text}) on ${w}`).toBe(
                  matches(row.r, c + w),
                );
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('builds a DFA of distinct derivatives that accepts the same words (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1e6 }), fc.integer({ min: 1, max: 5 }), (seed, n) => {
        const r: Regex = randomRegex(makeRng(seed), n, ['a', 'b'], true);
        const p = run(showRegex(r), {}, ['dfa']).endState().panel!;
        if (p.kind !== 'dfa' || p.stopped) return;
        expect(new Set(p.states.map((q) => key(q.r))).size).toBe(p.states.length);
        const a = dfaAutomaton(p);
        for (const w of words(5).filter((x) => [...x].every((ch) => p.alphabet.includes(ch))))
          expect(accepts(a, w), `${showRegex(r)} on ${w}`).toBe(matches(r, w));
      }),
      { numRuns: 200 },
    );
  });

  it('writes the driver script from the model', () => {
    const { input, expected } = regexDerivatives.code!.script(
      [
        ['derive', 'a'],
        ['match', 'abb'],
        ['dfa'],
        ['load', 'a(bc)'],
        ['match', 'eps'],
        ['derive', 'xy'],
      ],
      defaults,
    );
    expect(input).toEqual([
      'regex . * | a b . a . b b',
      'derive a',
      'match abb',
      'dfa',
      'regex . a . b c',
      'match eps',
    ]);
    expect(expected).toEqual(['(a|b)*abb|bb', 'accept', '4 states, 1 accepting', 'reject']);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(regexDerivatives, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(regexDerivatives, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
