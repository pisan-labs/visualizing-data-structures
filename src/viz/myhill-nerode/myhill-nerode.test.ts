import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { minimize } from '../_automata/automaton';
import { showRegex } from '../_automata/regex';
import { randomRegex } from '../_automata/regex-random';
import { myhillNerode } from '.';
import { apart, classKey, member, parseLanguage, type Language } from './language';
import { MAX_CLASSES, defaults, findClasses, type MnSettings } from './model';

const run = (calls: [string, ...string[]][], settings: Partial<MnSettings> = {}) =>
  new Timeline(myhillNerode, { ...defaults, ...settings } as MnSettings, 1, calls);

/** Every word over {a, b} up to length n, shortest first, then in alphabet order. */
const words = (n: number, sigma = ['a', 'b']): string[] => {
  const out = [''];
  for (let k = 0; out[k] !== undefined && out[k]!.length < n; k++)
    for (const c of sigma) out.push(out[k] + c);
  return out;
};

/** The reference: the first suffix up to length n that tells x and y apart, by brute force. */
const firstApart = (l: Language, x: string, y: string, n: number, sigma: string[]) =>
  words(n, sigma).find((z) => member(l, x + z) !== member(l, y + z)) ?? null;

describe('myhill-nerode', () => {
  it('finds the three classes of words ending in ab', () => {
    const p = run([['classes']]).endState().panel!;
    expect(p.kind === 'classes' && p.reps).toEqual(['', 'a', 'ab']);
    expect(p.kind === 'classes' && p.closed).toBe(true);
  });

  it('finds as many classes as the minimal DFA has states (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1e6 }), fc.integer({ min: 1, max: 5 }), (seed, n) => {
        const text = showRegex(randomRegex(makeRng(seed), n));
        const l = parseLanguage(text) as Language;
        if (l.kind !== 'regular') return;
        const want = minimize(l.dfa).dfa.states.length;
        const r = findClasses(l);
        if (want > MAX_CLASSES) {
          expect(r.stopped, text).toBe(true);
          return;
        }
        expect(r.reps.length, text).toBe(want);
        const sigma = l.dfa.alphabet;
        // The class words are pairwise apart, and every move goes to an equivalent word.
        for (let i = 0; i < r.reps.length; i++)
          for (let j = 0; j < i; j++) expect(apart(l, r.reps[i]!, r.reps[j]!), text).not.toBeNull();
        for (const m of r.moves)
          expect(apart(l, r.reps[m.from]! + m.on, r.reps[m.to]!), text).toBeNull();
        expect(r.moves).toHaveLength(r.reps.length * sigma.length);
      }),
      { numRuns: 200 },
    );
  });

  it('finds the shortest suffix that tells two words apart (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e6 }),
        fc.integer({ min: 1, max: 5 }),
        fc.array(fc.constantFrom('a', 'b'), { maxLength: 4 }),
        fc.array(fc.constantFrom('a', 'b'), { maxLength: 4 }),
        (seed, n, xs, ys) => {
          const text = showRegex(randomRegex(makeRng(seed), n));
          const l = parseLanguage(text) as Language;
          if (l.kind !== 'regular') return;
          const sigma = l.dfa.alphabet;
          const [x, y] = [xs, ys].map((s) => s.filter((c) => sigma.includes(c)).join('')) as [
            string,
            string,
          ];
          // A DFA with k states tells two words apart, if at all, by a suffix shorter than k.
          const want = firstApart(l, x, y, l.dfa.states.length, sigma);
          expect(apart(l, x, y), `${text}: ${x} / ${y}`).toBe(want);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('keys the classes of the languages with no DFA correctly (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'anbn' | 'equal'>('anbn', 'equal'),
        fc.array(fc.constantFrom('a', 'b'), { maxLength: 4 }),
        fc.array(fc.constantFrom('a', 'b'), { maxLength: 4 }),
        (name, xs, ys) => {
          const l: Language = { kind: 'named', name };
          const [x, y] = [xs.join(''), ys.join('')] as [string, string];
          const same = classKey(name, x) === classKey(name, y);
          expect(same, `${name}: ${x} / ${y}`).toBe(firstApart(l, x, y, 10, ['a', 'b']) === null);
          expect(apart(l, x, y)).toBe(same ? null : firstApart(l, x, y, 10, ['a', 'b']));
        },
      ),
      { numRuns: 300 },
    );
  });

  it('never closes on aⁿbⁿ, and tells aⁱ from aʲ by bⁱ', () => {
    const t = run([['load', 'anbn'], ['classes'], ['family']]);
    const c = t.entries[1]!.end.panel!;
    expect(c.kind === 'classes' && c.stopped).toBe(true);
    const f = t.endState().panel!;
    expect(f.kind === 'family' && f.table['4|2']).toBe('bb');
    expect(t.entries[2]!.steps.at(-1)!.say).toContain('it is not regular');
  });

  it('tells words apart and gives the lower bound', () => {
    const t = run([
      ['load', '(a|b)*a(a|b)'],
      ['apart', 'eps a aa ab'],
      ['apart', 'a ba bb'],
    ]);
    expect(t.entries[1]!.steps.at(-1)!.say).toContain('needs at least 4 states');
    expect(t.entries[2]!.steps.at(-1)!.say).toContain('ba ≡ a');
  });

  it('writes the driver script from the model', () => {
    const { input, expected } = myhillNerode.code!.script(
      [
        ['classes'],
        ['apart', 'a ba b'],
        ['load', 'anbn'],
        ['classes'],
        ['load', 'a*'],
        ['classes'],
      ],
      defaults,
    );
    expect(input.filter((l) => !/^(dfa|alphabet|start|accept|move)/.test(l))).toEqual([
      'classes',
      'apart a ba b',
      'classes',
    ]);
    expect(expected).toEqual([
      'eps a ab | eps-a->a eps-b->eps a-a->a a-b->ab ab-a->a ab-b->eps',
      '- b b',
      'eps | eps-a->eps',
    ]);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(myhillNerode, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(myhillNerode, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
