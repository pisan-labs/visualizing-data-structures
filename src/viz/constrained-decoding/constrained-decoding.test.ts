import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { randomRegex } from '../_automata/regex-random';
import { matches as reference, parseRegex, showRegex, type Regex } from '../_automata/regex';
import { constrained } from '.';
import { buildIndex, compile, END, matches, VOCAB, walk, type Compiled } from './fsm';
import { defaults, textOf, type ConSettings } from './model';

/** The vocabulary's letters: the alphabet regexes here are written in. */
const LETTERS = ['y', 'e', 's', 'n', 'o', 'h', 'a'];

const regexArb = fc
  .tuple(fc.integer({ min: 1, max: 100000 }), fc.integer({ min: 1, max: 5 }))
  .map(([seed, n]) => showRegex(randomRegex(makeRng(seed), n, LETTERS.slice(0, 4), true)))
  .filter((t) => t.length <= 24);
const wordArb = fc
  .array(fc.constantFrom(...LETTERS.slice(0, 4)), { maxLength: 7 })
  .map((w) => w.join(''));
const settingsArb = fc.record({
  mask: fc.boolean(),
  index: fc.constantFrom('precompute' as const, 'scan' as const),
  decode: fc.constantFrom('greedy' as const, 'sample' as const),
});

describe('constrained decoding', () => {
  it('compiles a regex to a DFA that accepts exactly what the regex matches', () => {
    fc.assert(
      fc.property(regexArb, fc.array(wordArb, { minLength: 5, maxLength: 20 }), (text, words) => {
        const c = compile(text) as Compiled;
        const r = parseRegex(text) as Regex;
        for (const w of words) expect(matches(c.dfa, w), `${text} on "${w}"`).toBe(reference(r, w));
        // Every state is reachable and can reach an accepting state: no dead ends but the vocabulary's.
        for (const q of c.dfa.states) {
          const seen = new Set([q]);
          const todo = [q];
          while (todo.length) {
            const p = todo.pop()!;
            for (const m of c.dfa.moves)
              if (m.from === p && !seen.has(m.to)) {
                seen.add(m.to);
                todo.push(m.to);
              }
          }
          expect(
            c.dfa.accept.some((a) => seen.has(a)),
            `${q} reaches an accept`,
          ).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('allows a token exactly when its letters keep the text a prefix of a match', () => {
    fc.assert(
      fc.property(regexArb, (text) => {
        const c = compile(text) as Compiled;
        const r = parseRegex(text) as Regex;
        const { index } = buildIndex(c.dfa);
        // A word reaching q, found by a breadth-first walk.
        const reach = new Map([[c.dfa.start, '']]);
        const todo = [c.dfa.start];
        while (todo.length) {
          const p = todo.shift()!;
          for (const m of c.dfa.moves)
            if (m.from === p && !reach.has(m.to)) {
              reach.set(m.to, reach.get(p)! + m.on);
              todo.push(m.to);
            }
        }
        const suffixes = (n: number): string[] =>
          n === 0
            ? ['']
            : ['', ...suffixes(n - 1).flatMap((s) => LETTERS.slice(0, 4).map((c) => c + s))];
        const tails = [...new Set(suffixes(4))];
        for (const q of c.dfa.states) {
          const w = reach.get(q)!;
          VOCAB.forEach((t, k) => {
            const allowed = index.get(q)![k] !== null;
            if (t === END) expect(allowed).toBe(reference(r, w));
            // An allowed token leaves a text that some short tail completes (the regexes here
            // are small enough for four letters to finish any match they start).
            else if (allowed) expect(tails.some((tail) => reference(r, w + t + tail))).toBe(true);
            else expect(tails.some((tail) => reference(r, w + t + tail))).toBe(false);
          });
        }
      }),
      { numRuns: 120 },
    );
  });

  it('keeps every text it writes on the regex, and counts the work right', () => {
    fc.assert(
      fc.property(
        regexArb,
        settingsArb,
        fc.integer({ min: 1, max: 1000 }),
        fc.array(fc.constantFrom('next', 'generate', 'index'), { maxLength: 4 }),
        (text, set, seed, more) => {
          const settings: ConSettings = { ...defaults, ...set };
          const t = new Timeline(constrained, settings, seed, [
            ['compile', text],
            ...more.map((op) => [op] as [string]),
            ['generate'],
          ]);
          const c = compile(text) as Compiled;
          const r = parseRegex(text) as Regex;
          for (const e of t.entries) {
            const s = e.end;
            if (settings.mask) {
              expect(s.state, 'the mask never lets the text leave the DFA').not.toBeNull();
              if (s.done === 'end') expect(reference(r, textOf(s))).toBe(true);
            }
            if (s.index) expect(s.lookups.index % buildIndex(c.dfa).lookups).toBe(0);
            if (!settings.mask || settings.index === 'precompute') expect(s.lookups.steps).toBe(0);
          }
        },
      ),
      { numRuns: 80 },
    );
  });

  it('tells the story the examples tell', () => {
    const run = (regex: string, settings: Partial<ConSettings> = {}) =>
      new Timeline(constrained, { ...defaults, ...settings } as ConSettings, 1, [
        ['compile', regex],
        ['generate'],
      ]).endState();
    expect(textOf(run('yes|no'))).toBe('yes');
    const free = run('yes|no', { mask: false });
    expect(textOf(free)).toBe('yeah');
    expect(matches(free.c.dfa, 'yeah')).toBe(false);
    expect(textOf(run('ye(s|ah)'))).toBe('yeah');
    expect(textOf(run('yo+'))).toBe('yo');
    expect(run('yet').done).toBe('stuck');
    const c = compile('yes|no') as Compiled;
    expect(c.dfa.states).toHaveLength(5);
    expect(buildIndex(c.dfa).lookups).toBe(71);
    expect(walk(c.dfa, 'q0', 'yes')).toEqual({
      to: 'q3',
      path: ['q0', 'q2', 'q4', 'q3'],
      lookups: 3,
    });
    expect(walk(c.dfa, 'q0', 'yeah').to).toBeNull();
    const ha = compile('(ha)+') as Compiled;
    expect(walk(ha.dfa, 'q0', 'haha').lookups).toBe(4);
  });

  it('refuses a regex it cannot use', () => {
    expect(compile('')).toBeInstanceOf(Error);
    expect(compile('(ye')).toBeInstanceOf(Error);
    expect(compile('∅')).toBeInstanceOf(Error);
    expect(compile('y'.repeat(25))).toBeInstanceOf(Error);
    expect(compile('ε')).not.toBeInstanceOf(Error);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(constrained, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(constrained, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
